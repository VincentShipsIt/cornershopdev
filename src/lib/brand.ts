/**
 * A wordmark: the name a visitor reads and either its production mark or the
 * initials used before that mark exists. Every niche declares one in its
 * `marketing` block; the factory's own is below.
 */
export type BrandIdentity = {
  name: string;
  initials: string;
  mark?: {
    src: string;
    faviconSrc: string;
    appleTouchIconSrc: string;
  };
};

/**
 * Cornershopdev itself — used only on cornershop.dev and on screens reached from
 * a host that belongs to no niche. A small business that arrived through a niche
 * storefront should never see this: they bought Restofrontapp, not a factory.
 */
export const FACTORY_BRAND: BrandIdentity = {
  name: "Cornershopdev",
  initials: "CS",
};
