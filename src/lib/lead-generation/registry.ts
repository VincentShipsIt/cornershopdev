import { Vertical } from "@/generated/prisma/enums";
import { beautyLeadDiscovery } from "@/lib/lead-generation/beauty";
import { restaurantLeadDiscovery } from "@/lib/lead-generation/restaurant";
import type { LeadDiscoveryAdapter } from "@/lib/lead-generation/types";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

/**
 * Deliberately exhaustive over the Prisma enum. Adding LOCAL_SERVICE,
 * FOOD_RETAIL, or another configured vertical cannot silently inherit the
 * restaurant search vocabulary: TypeScript requires its own adapter here.
 */
const leadDiscoveryRegistry = {
  [Vertical.RESTAURANT]: restaurantLeadDiscovery,
  [Vertical.BEAUTY]: beautyLeadDiscovery,
} satisfies Record<VerticalId, LeadDiscoveryAdapter>;

export function resolveLeadDiscoveryAdapter(
  vertical: VerticalId,
): LeadDiscoveryAdapter {
  return leadDiscoveryRegistry[vertical];
}

export function isVerticalOutreachConfigured(vertical: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(leadDiscoveryRegistry, vertical)) {
    return false;
  }
  const marketing = resolveVerticalConfig(vertical as VerticalId).marketing;
  return Boolean(marketing.domain && marketing.email);
}

export function listOutreachVerticals(): VerticalId[] {
  return (Object.keys(leadDiscoveryRegistry) as VerticalId[]).filter(
    isVerticalOutreachConfigured,
  );
}

export function listLeadDiscoveryAdapters(): LeadDiscoveryAdapter[] {
  return Object.values(leadDiscoveryRegistry);
}
