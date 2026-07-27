import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { createSessionInTransaction, type CreatedSession } from "@/lib/auth-sessions";
import { getDb } from "@/lib/db";
import { buildMagicLinkEmail } from "@/lib/magic-link-email";
import { getResend } from "@/lib/resend";
import {
  canRetryMagicLink,
  createOpaqueAuthToken,
  hashAuthToken,
  MAGIC_LINK_MAX_RETRIES,
  MAGIC_LINK_TTL_MS,
} from "@/lib/session";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";
import type { VerticalId } from "@/lib/verticals/types";

type Workspace = {
  id: string;
  slug: string;
  name: string;
  vertical: VerticalId;
  organizationId: string;
};

export async function requestMagicLink(email: string): Promise<void> {
  const user = await getDb().user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      platformRole: true,
      memberships: {
        select: {
          organization: {
            select: {
              sites: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  vertical: true,
                  organizationId: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return;

  const workspaces = normalizeWorkspaces(
    user.memberships.flatMap((row) => row.organization.sites),
  );
  const isSuperadmin =
    user.platformRole === "SUPERADMIN" &&
    isConfiguredSuperadminEmail(user.email);
  if (!isSuperadmin && workspaces.length === 0) return;

  await createAndDeliverMagicLink({
    userId: user.id,
    email: user.email,
    isSuperadmin,
    workspaces,
    retryCount: 0,
  });
}

export async function retryMagicLink(
  magicLinkId: string,
  actorUserId: string,
): Promise<void> {
  const source = await getDb().authMagicLink.findUnique({
    where: { id: magicLinkId },
    select: {
      id: true,
      destination: true,
      retryCount: true,
      createdAt: true,
      deliveryStatus: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      lastAttemptAt: true,
      user: {
        select: {
          id: true,
          email: true,
          platformRole: true,
          memberships: {
            select: {
              organization: {
                select: {
                  sites: {
                    orderBy: { createdAt: "asc" },
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      vertical: true,
                      organizationId: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!source || !canRetryMagicLink(source)) {
    throw new Error("This delivery cannot be retried.");
  }
  const workspaces = normalizeWorkspaces(
    source.user.memberships.flatMap((row) => row.organization.sites),
  );
  const isSuperadmin =
    source.destination === "ADMIN" &&
    source.user.platformRole === "SUPERADMIN" &&
    isConfiguredSuperadminEmail(source.user.email);
  if (!isSuperadmin && workspaces.length === 0) {
    throw new Error("This account no longer has a workspace.");
  }

  await createAndDeliverMagicLink({
    userId: source.user.id,
    email: source.user.email,
    isSuperadmin,
    workspaces,
    retryCount: source.retryCount + 1,
    replacesId: source.id,
    actor: `operator:${actorUserId}`,
  });
}

async function createAndDeliverMagicLink(input: {
  userId: string;
  email: string;
  isSuperadmin: boolean;
  workspaces: Workspace[];
  retryCount: number;
  replacesId?: string;
  actor?: string;
}): Promise<void> {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredAppUrl) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  const credential = createOpaqueAuthToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
  const destination = input.isSuperadmin ? "ADMIN" : "WORKSPACE";
  const primarySite = input.workspaces[0] ?? null;

  const link = await getDb().$transaction(
    async (tx) => {
      if (input.replacesId) {
        const revoked = await tx.authMagicLink.updateMany({
          where: {
            id: input.replacesId,
            consumedAt: null,
            revokedAt: null,
            retryCount: { lt: MAGIC_LINK_MAX_RETRIES },
          },
          data: { revokedAt: now },
        });
        if (revoked.count !== 1) {
          throw new Error("This delivery was already retried.");
        }
      } else {
        await tx.authMagicLink.updateMany({
          where: {
            userId: input.userId,
            destination,
            consumedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }
      const created = await tx.authMagicLink.create({
        data: {
          tokenHash: credential.tokenHash,
          destination,
          brandVertical: input.isSuperadmin ? null : primarySite?.vertical,
          expiresAt,
          userId: input.userId,
          retryCount: input.retryCount,
        },
        select: { id: true },
      });
      await tx.authEvent.create({
        data: {
          type: input.replacesId
            ? "auth.magic_link.retried"
            : "auth.magic_link.requested",
          actor: input.actor ?? "user:self",
          subjectUserId: input.userId,
          magicLinkId: created.id,
          metadata: {
            destination,
            replacesId: input.replacesId ?? null,
            retryCount: input.retryCount,
          },
        },
      });
      return created;
    },
    { isolationLevel: "Serializable" },
  );

  const verifyUrl = new URL("/api/auth/verify", configuredAppUrl);
  verifyUrl.searchParams.set("token", credential.token);
  const emailMessage = buildMagicLinkEmail({
    verifyUrl: verifyUrl.toString(),
    isSuperadmin: input.isSuperadmin,
    site: primarySite,
    workspaceCount: input.workspaces.length,
  });

  try {
    const { data, error } = await getResend().emails.send(
      {
        from: emailMessage.from,
        to: input.email,
        replyTo: emailMessage.replyTo,
        subject: emailMessage.subject,
        html: emailMessage.html,
      },
      { headers: { "Idempotency-Key": `magic-link-${link.id}` } },
    );
    if (error) throw new Error(error.message);
    await recordDelivery(link.id, "SENT", data?.id ?? null, null);
  } catch (error) {
    await recordDelivery(link.id, "FAILED", null, deliveryFailureCode(error));
  }
}

async function recordDelivery(
  id: string,
  status: "SENT" | "FAILED",
  providerMessageId: string | null,
  failureCode: string | null,
): Promise<void> {
  const now = new Date();
  await getDb().$transaction(async (tx) => {
    const updated = await tx.authMagicLink.updateMany({
      where: { id, deliveryStatus: "PENDING" },
      data: {
        deliveryStatus: status,
        deliveryAttempts: { increment: 1 },
        providerMessageId,
        failureCode,
        lastAttemptAt: now,
        deliveredAt: status === "SENT" ? now : null,
      },
    });
    if (updated.count === 1) {
      await tx.authEvent.create({
        data: {
          type:
            status === "SENT"
              ? "auth.magic_link.delivered"
              : "auth.magic_link.delivery_failed",
          magicLinkId: id,
          metadata: { failureCode },
        },
      });
    }
  });
}

export async function consumeMagicLink(token: string): Promise<CreatedSession> {
  const now = new Date();
  return getDb().$transaction(
    async (tx) => {
      const link = await tx.authMagicLink.findUnique({
        where: { tokenHash: hashAuthToken(token) },
        select: {
          id: true,
          destination: true,
          userId: true,
          expiresAt: true,
          consumedAt: true,
          revokedAt: true,
          user: { select: { email: true, platformRole: true } },
        },
      });
      if (
        !link ||
        link.consumedAt ||
        link.revokedAt ||
        link.expiresAt <= now
      ) {
        throw new Error("Invalid or expired sign-in link.");
      }

      const workspaces = await listWorkspacesInTransaction(tx, link.userId);
      const operator =
        link.destination === "ADMIN" &&
        link.user.platformRole === "SUPERADMIN" &&
        isConfiguredSuperadminEmail(link.user.email);
      if (!operator && workspaces.length === 0) {
        throw new Error("Workspace access is no longer available.");
      }
      const consumed = await tx.authMagicLink.updateMany({
        where: { id: link.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new Error("This sign-in link was already used.");
      }

      const singleSite = !operator && workspaces.length === 1 ? workspaces[0] : null;
      const session = await createSessionInTransaction(tx, {
        userId: link.userId,
        purpose: operator
          ? "ADMIN"
          : singleSite
            ? "SITE"
            : "WORKSPACE_SELECTION",
        organizationId: singleSite?.organizationId,
        site: singleSite ? { id: singleSite.id, slug: singleSite.slug } : null,
        actor: "magic-link",
        now,
      });
      await tx.authEvent.create({
        data: {
          type: "auth.magic_link.consumed",
          actor: "user:self",
          subjectUserId: link.userId,
          magicLinkId: link.id,
          sessionId: session.session.id,
        },
      });
      return session;
    },
    { isolationLevel: "Serializable" },
  );
}

async function listWorkspacesInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Workspace[]> {
  const rows = await tx.site.findMany({
    where: { organization: { memberships: { some: { userId } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      vertical: true,
      organizationId: true,
    },
  });
  return normalizeWorkspaces(rows);
}

function normalizeWorkspaces(
  rows: Array<{
    id: string;
    slug: string;
    name: string;
    vertical: VerticalId;
    organizationId: string | null;
  }>,
): Workspace[] {
  return rows.flatMap((row) =>
    row.organizationId ? [{ ...row, organizationId: row.organizationId }] : [],
  );
}

function deliveryFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("rate") || message.includes("429")) return "provider_rate_limited";
  if (message.includes("domain") || message.includes("sender")) return "sender_rejected";
  if (message.includes("recipient") || message.includes("email")) return "recipient_rejected";
  return "provider_error";
}
