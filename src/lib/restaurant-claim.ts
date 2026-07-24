import type { Prisma } from "@/generated/prisma/client";
import { RestaurantStatus } from "@/generated/prisma/enums";

/**
 * A restaurant may only be claimed while it is still an unowned prospect.
 * Once it belongs to an organization, only that organization may act on it —
 * a completed checkout must never be able to reassign somebody else's
 * restaurant just because the caller supplied its slug.
 *
 * Mirrors the equivalent guard on the import path in
 * `restaurant-import-persistence.ts`, which the claim path was missing.
 */
export const CLAIMABLE_STATUSES: RestaurantStatus[] = [
  RestaurantStatus.PROSPECT,
  RestaurantStatus.PREVIEW_READY,
];

/**
 * Raised when a checkout tries to claim a restaurant that is missing or is
 * already owned by another organization. The message deliberately does not
 * distinguish the two so the endpoint cannot be used to enumerate slugs.
 */
export class RestaurantNotClaimableError extends Error {
  constructor() {
    super("This restaurant is not available to claim");
    this.name = "RestaurantNotClaimableError";
  }
}

/**
 * True when a restaurant has never been claimed. Used for the pre-checkout
 * courtesy check; the authoritative guard is `claimableWhere`, which pushes
 * the same rule into the database so it cannot lose a check-then-write race.
 */
export function isClaimable(restaurant: {
  status: RestaurantStatus;
  organizationId: string | null;
}): boolean {
  return (
    restaurant.organizationId === null &&
    CLAIMABLE_STATUSES.includes(restaurant.status)
  );
}

/**
 * Filter that matches a restaurant only if `organizationId` is allowed to
 * claim it: either it is an unowned prospect, or it already belongs to that
 * organization so a replayed checkout stays idempotent. Applying this as the
 * WHERE clause of the claiming update makes the check atomic — an update that
 * matches zero rows is a rejected claim.
 */
export function claimableWhere(
  slug: string,
  organizationId: string,
): Prisma.RestaurantWhereInput {
  return {
    slug,
    OR: [
      { organizationId: null, status: { in: CLAIMABLE_STATUSES } },
      { organizationId },
    ],
  };
}
