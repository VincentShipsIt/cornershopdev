import "server-only";
import { auth } from "@/lib/better-auth";
import { getDb } from "@/lib/db";
import type { MagicLinkRequestMetadata } from "@/lib/magic-link-delivery";
import { ownerMembershipWhere } from "@/lib/owner-membership";
import { canRetryMagicLink } from "@/lib/session";
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
      rotationGeneration: true,
      user: {
        select: {
          id: true,
          email: true,
          authLinkSequence: true,
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
  if (
    !source ||
    !canRetryMagicLink({
      ...source,
      authLinkSequence: source.user.authLinkSequence,
    })
  ) {
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
