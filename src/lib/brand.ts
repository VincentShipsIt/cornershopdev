/**
 * A wordmark: the name a visitor reads and the initials in the badge beside it.
 * Every niche declares one in its `marketing` block; the factory's own is below.
 */
export type BrandIdentity = {
  name: string;
  initials: string;
};

/**
 * Cornershopdev itself — used only on cornershop.dev and on screens reached from
 * a host that belongs to no niche. A small business that arrived through a niche
 * storefront should never see this: they bought Restofront, not a factory.
 */
export const FACTORY_BRAND: BrandIdentity = {
  name: "Cornershopdev",
  initials: "CS",
};
