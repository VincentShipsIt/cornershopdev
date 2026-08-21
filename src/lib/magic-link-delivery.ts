import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { buildMagicLinkEmail } from "@/lib/magic-link-email";
import { ownerMembershipWhere } from "@/lib/owner-membership";
import { getResend } from "@/lib/resend";
import {
  canRetryMagicLink,
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
  let link: { id: string; rotationGeneration: number };
  try {
    link = await getDb().$transaction(
      async (tx) => {
        const sequence = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { authLinkSequence: true },
        });
        const replacedLink = metadata.replacesId
          ? await tx.authMagicLink.findFirst({
              where: {
                id: metadata.replacesId,
                userId: user.id,
                consumedAt: null,
                retryCount: { lt: MAGIC_LINK_MAX_RETRIES },
              },
              select: {
                id: true,
                deliveryStatus: true,
                retryCount: true,
                consumedAt: true,
                revokedAt: true,
                createdAt: true,
                lastAttemptAt: true,
                rotationGeneration: true,
              },
            })
          : null;
        if (
          metadata.replacesId &&
          (!replacedLink ||
            metadata.retryCount !== replacedLink.retryCount + 1 ||
            !canRetryMagicLink({
              ...replacedLink,
              authLinkSequence: sequence.authLinkSequence,
            }))
        ) {
          throw new Error("This delivery was already retried.");
        }

        const advanced = await tx.user.updateMany({
          where: {
            id: user.id,
            authLinkSequence: sequence.authLinkSequence,
          },
          data: { authLinkSequence: { increment: 1 } },
        });
        if (advanced.count !== 1) {
          throw new Error("This delivery was already retried.");
        }
        const rotationGeneration = sequence.authLinkSequence + 1;

        const created = await tx.authMagicLink.create({
          data: {
            tokenHash,
            destination,
            brandVertical: isSuperadmin ? null : primarySite?.vertical,
            expiresAt,
            userId: user.id,
            retryCount: metadata.retryCount,
            rotationGeneration,
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
        return {
          ...created,
          rotationGeneration,
        };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    await getDb().verification.deleteMany({
      where: { identifier: tokenHash },
    });
    throw error;
  }

  const verifyUrl = new URL("/api/auth/verify", input.url);
  verifyUrl.searchParams.set("token", input.token);
  const emailMessage = buildMagicLinkEmail({
    verifyUrl: verifyUrl.toString(),
    isSuperadmin,
    site: primarySite,
    workspaceCount: workspaces.length,
  });

  let providerMessageId: string;
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
    providerMessageId = data.id;
  } catch (error) {
    await finalizeMagicLinkDelivery({
      id: link.id,
      rotationGeneration: link.rotationGeneration,
      outcome: "FAILED",
      providerMessageId: null,
      failureCode: deliveryFailureCode(error),
    });
    return;
  }

  await finalizeMagicLinkDelivery({
    id: link.id,
    rotationGeneration: link.rotationGeneration,
    outcome: "ACCEPTED",
    providerMessageId,
    failureCode: null,
  });
}

export async function finalizeMagicLinkDelivery(
  input: {
    id: string;
    rotationGeneration: number;
    outcome: "ACCEPTED" | "FAILED";
    providerMessageId: string | null;
    failureCode: string | null;
  },
  database: Pick<PrismaClient, "$transaction"> = getDb(),
): Promise<void> {
  const now = new Date();
  await database.$transaction(async (tx) => {
    const link = await tx.authMagicLink.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        rotationGeneration: true,
        deliveryStatus: true,
        providerMessageId: true,
        failureCode: true,
      },
    });
    if (!link || link.rotationGeneration !== input.rotationGeneration) {
      throw new Error("Authentication delivery reservation changed");
    }
    if (
      input.providerMessageId &&
      link.providerMessageId &&
      link.providerMessageId !== input.providerMessageId
    ) {
      throw new Error("Authentication provider message identity changed");
    }

    const attempted = await tx.authMagicLink.updateMany({
      where: {
        id: input.id,
        rotationGeneration: input.rotationGeneration,
        OR:
          input.providerMessageId
            ? [
                { providerMessageId: null },
                { providerMessageId: input.providerMessageId },
              ]
            : undefined,
      },
      data: {
        deliveryAttempts: { increment: 1 },
        providerMessageId: input.providerMessageId ?? undefined,
        lastAttemptAt: now,
      },
    });
    if (attempted.count !== 1) {
      throw new Error("Authentication delivery reservation changed");
    }

    if (input.outcome === "ACCEPTED") {
      await tx.authMagicLink.updateMany({
        where: { id: input.id, deliveryStatus: "PENDING" },
        data: { deliveryStatus: "SENT", failureCode: null },
      });
    } else {
      await tx.authMagicLink.updateMany({
        where: { id: input.id, deliveryStatus: "PENDING" },
        data: {
          deliveryStatus: "FAILED",
          failureCode: input.failureCode,
        },
      });
    }

    const finalized = await tx.authMagicLink.findUniqueOrThrow({
      where: { id: input.id },
      select: { deliveryStatus: true, failureCode: true },
    });
    const usable =
      finalized.deliveryStatus === "SENT" ||
      finalized.deliveryStatus === "DELIVERED";
    await reconcileMagicLinkActivation(tx, {
      userId: link.userId,
      rotationGeneration: input.rotationGeneration,
      usable,
      now,
    });

    await tx.authEvent.create({
      data: {
        type: usable
          ? "auth.magic_link.provider_accepted"
          : "auth.magic_link.delivery_failed",
        magicLinkId: input.id,
        metadata: {
          failureCode: finalized.failureCode ?? input.failureCode,
          provider: "better-auth",
          rotationGeneration: input.rotationGeneration,
        },
      },
    });
  });
}

export async function reconcileMagicLinkActivation(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    rotationGeneration: number;
    usable: boolean;
    now: Date;
  },
): Promise<void> {
  if (input.usable) {
    const activated = await tx.user.updateMany({
      where: {
        id: input.userId,
        authLinkActiveGeneration: { lt: input.rotationGeneration },
      },
      data: { authLinkActiveGeneration: input.rotationGeneration },
    });
    const active = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { authLinkActiveGeneration: true },
    });
    if (
      activated.count === 1 ||
      active.authLinkActiveGeneration === input.rotationGeneration
    ) {
      await revokeMagicLinks(tx, {
        userId: input.userId,
        generation: { lt: input.rotationGeneration },
        now: input.now,
      });
    } else if (active.authLinkActiveGeneration > input.rotationGeneration) {
      await revokeMagicLinks(tx, {
        userId: input.userId,
        generation: { equals: input.rotationGeneration },
        now: input.now,
      });
    }
    return;
  }
  await revokeMagicLinks(tx, {
    userId: input.userId,
    generation: { equals: input.rotationGeneration },
    now: input.now,
  });
}

async function revokeMagicLinks(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    generation: { lt: number } | { equals: number };
    now: Date;
  },
): Promise<void> {
  const links = await tx.authMagicLink.findMany({
    where: {
      userId: input.userId,
      rotationGeneration: input.generation,
      consumedAt: null,
      revokedAt: null,
    },
    select: { id: true, tokenHash: true },
  });
  if (links.length === 0) return;
  await tx.authMagicLink.updateMany({
    where: {
      id: { in: links.map((link) => link.id) },
      consumedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: input.now },
  });
  await tx.verification.deleteMany({
    where: {
      identifier: { in: links.map((link) => link.tokenHash) },
    },
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
