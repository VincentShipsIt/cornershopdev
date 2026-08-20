import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { hashAuthToken } from "@/lib/session";

export async function markMagicLinkConsumed(
  token: string,
  database: Pick<PrismaClient, "$transaction"> = getDb(),
): Promise<void> {
  const now = new Date();
  const tokenHash = hashAuthToken(token);
  await database.$transaction(async (tx) => {
    const link = await tx.authMagicLink.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        rotationGeneration: true,
      },
    });
    if (!link) {
      throw new Error("Authentication delivery evidence is unavailable.");
    }

    // Lock the user's generation counter before consuming the verification.
    // A newer successful send locks the same row while advancing it, so the
    // two operations have one deterministic winner.
    const active = await tx.user.updateMany({
      where: {
        id: link.userId,
        authLinkActiveGeneration: link.rotationGeneration,
      },
      data: { authLinkActiveGeneration: { increment: 0 } },
    });
    if (active.count !== 1) {
      throw new Error("Authentication delivery evidence changed.");
    }
    const consumed = await tx.authMagicLink.updateMany({
      where: {
        id: link.id,
        rotationGeneration: link.rotationGeneration,
        deliveryStatus: { in: ["SENT", "DELIVERED"] },
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new Error("Authentication delivery evidence changed.");
    }
    await tx.authEvent.create({
      data: {
        type: "auth.magic_link.consumed",
        actor: "user:self",
        subjectUserId: link.userId,
        magicLinkId: link.id,
      },
    });
  });
}

export async function isMagicLinkConsumable(
  token: string,
  database: Pick<PrismaClient, "authMagicLink"> = getDb(),
): Promise<boolean> {
  const link = await database.authMagicLink.findUnique({
    where: { tokenHash: hashAuthToken(token) },
    select: {
      rotationGeneration: true,
      deliveryStatus: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      user: { select: { authLinkActiveGeneration: true } },
    },
  });
  return Boolean(
    link &&
      (link.deliveryStatus === "SENT" ||
        link.deliveryStatus === "DELIVERED") &&
      link.rotationGeneration === link.user.authLinkActiveGeneration &&
      !link.consumedAt &&
      !link.revokedAt &&
      link.expiresAt > new Date(),
  );
}
