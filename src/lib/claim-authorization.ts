import type { SiteStatus } from "@/generated/prisma/enums";
import { normalizeAccountEmail } from "@/lib/account-email";
import { isClaimable } from "@/lib/site-claim";

export type ClaimInvitationAuthorization = {
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  site: {
    slug: string;
    status: SiteStatus;
    organizationId: string | null;
  };
};

export function isClaimInvitationAuthorized(
  invitation: ClaimInvitationAuthorization | null,
  input: {
    siteSlug: string;
    email: string;
    now?: Date;
  },
): boolean {
  const now = input.now ?? new Date();
  return Boolean(
    invitation &&
      !invitation.acceptedAt &&
      invitation.expiresAt > now &&
      invitation.site.slug === input.siteSlug &&
      normalizeAccountEmail(invitation.email) ===
        normalizeAccountEmail(input.email) &&
      isClaimable(invitation.site),
  );
}
