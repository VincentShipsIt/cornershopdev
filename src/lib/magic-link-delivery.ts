import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { buildMagicLinkEmail } from "@/lib/magic-link-email";
import { ownerMembershipWhere } from "@/lib/owner-membership";
import { getResend } from "@/lib/resend";
import {
  hashAuthToken,
  MAGIC_LINK_MAX_RETRIES,
  MAGIC_LINK_TTL_MS,
} from "@/lib/session";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";

const requestMetadataSchema = z.object({
  userId: z.string().min(1).max(128),
  retryCount: z.number().int().min(0).max(MAGIC_LINK_MAX_RETRIES),
  replacesId: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).max(160).optional(),
});

export type MagicLinkRequestMetadata = z.infer<
  typeof requestMetadataSchema
>;

type DeliveryInput = {
  email: string;
  token: string;
  url: string;
  metadata?: Record<string, unknown>;
};

export async function deliverMagicLink(input: DeliveryInput): Promise<void> {
  const metadata = requestMetadataSchema.parse(input.metadata);
  const tokenHash = hashAuthToken(input.token);
  const user = await getDb().user.findFirst({
    where: { id: metadata.userId, email: input.email },
    select: {
      id: true,
      email: true,
      platformRole: true,
      memberships: {
        where: ownerMembershipWhere(),
        select: {
          organization: {
            select: {
              sites: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
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
  if (!user) {
    await getDb().verification.deleteMany({ where: { identifier: tokenHash } });
    return;
  }

  const workspaces = user.memberships
    .flatMap((membership) => membership.organization.sites)
    .filter(
      (
        site,
      ): site is typeof site & {
        organizationId: string;
      } => Boolean(site.organizationId),
    );
  const isSuperadmin =
    user.platformRole === "SUPERADMIN" &&
    isConfiguredSuperadminEmail(user.email);
  if (!isSuperadmin && workspaces.length === 0) {
    await getDb().verification.deleteMany({ where: { identifier: tokenHash } });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
  const destination = isSuperadmin ? "ADMIN" : "WORKSPACE";
  const primarySite = workspaces[0] ?? null;
  const link = await getDb().$transaction(
    async (tx) => {
      const replacedLinks = metadata.replacesId
        ? await tx.authMagicLink.findMany({
            where: {
              id: metadata.replacesId,
              userId: user.id,
              consumedAt: null,
              revokedAt: null,
              retryCount: { lt: MAGIC_LINK_MAX_RETRIES },
            },
            select: { id: true, tokenHash: true },
          })
        : await tx.authMagicLink.findMany({
            where: {
              userId: user.id,
              destination,
              consumedAt: null,
              revokedAt: null,
            },
            select: { id: true, tokenHash: true },
          });
      if (metadata.replacesId && replacedLinks.length !== 1) {
        throw new Error("This delivery was already retried.");
      }

      const created = await tx.authMagicLink.create({
        data: {
          tokenHash,
          destination,
          brandVertical: isSuperadmin ? null : primarySite?.vertical,
          expiresAt,
          userId: user.id,
          retryCount: metadata.retryCount,
        },
        select: { id: true },
      });
      await tx.authEvent.create({
        data: {
          type: metadata.replacesId
            ? "auth.magic_link.retried"
            : "auth.magic_link.requested",
          actor: metadata.actor ?? "user:self",
          subjectUserId: user.id,
          magicLinkId: created.id,
          metadata: {
            destination,
            replacesId: metadata.replacesId ?? null,
            retryCount: metadata.retryCount,
            provider: "better-auth",
          },
        },
      });
      return { ...created, replacedLinks };
    },
    { isolationLevel: "Serializable" },
  );

  const verifyUrl = new URL("/api/auth/verify", input.url);
  verifyUrl.searchParams.set("token", input.token);
  const emailMessage = buildMagicLinkEmail({
    verifyUrl: verifyUrl.toString(),
    isSuperadmin,
    site: primarySite,
    workspaceCount: workspaces.length,
  });

  try {
    const { data, error } = await getResend().emails.send(
      {
        from: emailMessage.from,
        to: user.email,
        replyTo: emailMessage.replyTo,
        subject: emailMessage.subject,
        html: emailMessage.html,
        tags: [
          { name: "category", value: "auth_magic_link" },
          { name: "auth_magic_link_id", value: link.id },
        ],
      },
      { headers: { "Idempotency-Key": `magic-link-${link.id}` } },
    );
    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error("Resend did not return a message identifier");
    await recordDelivery(
      link.id,
      "SENT",
      data.id,
      null,
      link.replacedLinks,
    );
  } catch (error) {
    await recordDelivery(
      link.id,
      "FAILED",
      null,
      deliveryFailureCode(error),
      [],
    );
  }
}

async function recordDelivery(
  id: string,
  status: "SENT" | "FAILED",
  providerMessageId: string | null,
  failureCode: string | null,
  replacedLinks: Array<{ id: string; tokenHash: string }>,
): Promise<void> {
  const now = new Date();
  await getDb().$transaction(async (tx) => {
    const updated = await tx.authMagicLink.updateMany({
      where: {
        id,
        deliveryStatus:
          status === "SENT" ? { in: ["PENDING", "SENT"] } : "PENDING",
        OR:
          status === "SENT" && providerMessageId
            ? [
                { providerMessageId: null },
                { providerMessageId },
              ]
            : undefined,
      },
      data: {
        deliveryStatus: status,
        deliveryAttempts: { increment: 1 },
        providerMessageId,
        failureCode,
        lastAttemptAt: now,
        deliveredAt: null,
      },
    });
    if (updated.count === 1) {
      if (status === "SENT" && replacedLinks.length > 0) {
        await tx.authMagicLink.updateMany({
          where: {
            id: { in: replacedLinks.map((replaced) => replaced.id) },
            consumedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await tx.verification.deleteMany({
          where: {
            identifier: {
              in: replacedLinks.map((replaced) => replaced.tokenHash),
            },
          },
        });
      }
      await tx.authEvent.create({
        data: {
          type:
            status === "SENT"
              ? "auth.magic_link.provider_accepted"
              : "auth.magic_link.delivery_failed",
          magicLinkId: id,
          metadata: { failureCode, provider: "better-auth" },
        },
      });
    }
  });
}

function deliveryFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("rate") || message.includes("429")) {
    return "provider_rate_limited";
  }
  if (message.includes("domain") || message.includes("sender")) {
    return "sender_rejected";
  }
  if (message.includes("recipient") || message.includes("email")) {
    return "recipient_rejected";
  }
  return "provider_error";
}
