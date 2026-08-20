export const OWNER_MEMBERSHIP_ROLE = "owner" as const;

export function ownerMembershipWhere(userId?: string) {
  return userId
    ? { userId, role: OWNER_MEMBERSHIP_ROLE }
    : { role: OWNER_MEMBERSHIP_ROLE };
}

export function ownedSiteSessionWhere(input: {
  siteId: string;
  organizationId: string;
  userId: string;
}) {
  return {
    id: input.siteId,
    organizationId: input.organizationId,
    organization: {
      memberships: { some: ownerMembershipWhere(input.userId) },
    },
  };
}
