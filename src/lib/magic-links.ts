import "server-only";
import { auth } from "@/lib/better-auth";
import { getDb } from "@/lib/db";
import type { MagicLinkRequestMetadata } from "@/lib/magic-link-delivery";
import { ownerMembershipWhere } from "@/lib/owner-membership";
import { canRetryMagicLink, hashAuthToken } from "@/lib/session";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";

export async function requestMagicLink(
  email: string,
  headers: Headers,
): Promise<void> {
  const user = await getDb().user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      platformRole: true,
      memberships: {
        where: ownerMembershipWhere(),
        select: {
          organization: {
            select: {
              sites: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!user) return;

  const workspaceCount = user.memberships.reduce(
    (total, membership) => total + membership.organization.sites.length,
    0,
  );
  const isSuperadmin =
    user.platformRole === "SUPERADMIN" &&
    isConfiguredSuperadminEmail(user.email);
  if (!isSuperadmin && workspaceCount === 0) return;

  await issueMagicLink(
    user.email,
    {
      userId: user.id,
      retryCount: 0,
    },
    headers,
  );
}

export async function retryMagicLink(
  magicLinkId: string,
  actorUserId: string,
  headers: Headers,
): Promise<void> {
  const source = await getDb().authMagicLink.findUnique({
    where: { id: magicLinkId },
    select: {
      id: true,
      retryCount: true,
      createdAt: true,
      deliveryStatus: true,
      consumedAt: true,
      revokedAt: true,
      lastAttemptAt: true,
      user: {
        select: {
          id: true,
          email: true,
          platformRole: true,
          memberships: {
            where: ownerMembershipWhere(),
            select: {
              organization: {
                select: {
                  sites: { select: { id: true } },
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

  const workspaceCount = source.user.memberships.reduce(
    (total, membership) => total + membership.organization.sites.length,
    0,
  );
  const isSuperadmin =
    source.user.platformRole === "SUPERADMIN" &&
    isConfiguredSuperadminEmail(source.user.email);
  if (!isSuperadmin && workspaceCount === 0) {
    throw new Error("This account no longer has a workspace.");
  }

  await issueMagicLink(
    source.user.email,
    {
      userId: source.user.id,
      retryCount: source.retryCount + 1,
      replacesId: source.id,
      actor: `operator:${actorUserId}`,
    },
    headers,
  );
}

export async function markMagicLinkConsumed(token: string): Promise<void> {
  const now = new Date();
  const tokenHash = hashAuthToken(token);
  await getDb().$transaction(async (tx) => {
    const link = await tx.authMagicLink.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });
    if (!link) {
      throw new Error("Authentication delivery evidence is unavailable.");
    }
    const consumed = await tx.authMagicLink.updateMany({
      where: {
        id: link.id,
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

async function issueMagicLink(
  email: string,
  metadata: MagicLinkRequestMetadata,
  headers: Headers,
): Promise<void> {
  await auth.api.signInMagicLink({
    body: {
      email,
      callbackURL: "/api/auth/complete",
      errorCallbackURL: "/sign-in?error=invalid-link",
      metadata,
    },
    headers,
  });
}
