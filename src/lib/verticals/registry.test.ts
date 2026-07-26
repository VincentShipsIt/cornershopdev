import { describe, expect, it } from "bun:test";
import { deterministicDraft } from "@/lib/ai/site-generation";
import { Vertical } from "@/generated/prisma/enums";
import {
  sampleRestaurant,
  sampleSiteDraft,
  toRestaurantDraft,
} from "@/lib/restaurant";
import { beautyConfig } from "@/lib/verticals/beauty/config";
import {
  listMarketingVerticals,
  listVerticalIds,
  resolveVerticalByHostname,
  resolveVerticalBySlug,
  resolveVerticalConfig,
  verticalAssetNamespace,
  verticalSlug,
} from "@/lib/verticals/registry";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";

/**
 * Concrete configs are imported directly rather than pulled back out of the
 * registry: `resolveVerticalConfig` returns the variance-erased surface, so a
 * test that goes through it can only assert on the shared contract. Registry
 * lookup is covered on its own below; everything vertical-specific asserts
 * against the config it actually belongs to.
 */
describe("vertical registry", () => {
  it("uses the generated Prisma enum as its identifier source", () => {
    expect(listVerticalIds()).toEqual([Vertical.RESTAURANT, Vertical.BEAUTY]);
  });

  it("resolves every registered id back to the config that declares it", () => {
    for (const id of listVerticalIds()) {
      expect(resolveVerticalConfig(id).id).toBe(id);
    }
  });

  it("preserves the legacy restaurant draft through the compatibility shim", () => {
    expect(toRestaurantDraft(sampleSiteDraft)).toEqual(sampleRestaurant);
  });

  it("resolves restaurant templates through attributes", () => {
    expect(
      restaurantConfig.templates.resolve({
        cuisine: "Modern Italian",
        showMenuImages: false,
      }).id,
    ).toBe("warm");
  });

  it("resolves beauty templates by controlled service style", () => {
    expect(
      beautyConfig.templates.resolve({
        serviceStyle: "spa-luxe",
        showServiceImages: true,
      }).id,
    ).toBe("spa-luxe");
  });

  /**
   * Beauty is the only vertical that turns the on-page request form on: none of
   * its providers ships an embeddable widget, so without it a salon whose only
   * booking link is Booksy would have no on-page capture at all.
   */
  it("keeps the booking-request form vertical-scoped", () => {
    expect(
      beautyConfig.rendererCapabilities({
        serviceStyle: "barbershop",
        showServiceImages: false,
      }).showBookingRequestForm,
    ).toBe(true);
    expect(
      restaurantConfig.rendererCapabilities({
        cuisine: "Modern Italian",
        showMenuImages: false,
      }).showBookingRequestForm,
    ).toBe(false);
  });

  it("builds a vertical-neutral deterministic fallback", () => {
    const draft = deterministicDraft(
      {
        source: "Café Roma",
        sourceUrl: null,
        sourceLocale: "fr",
        name: "Café Roma",
        description: "",
        address: "",
        phone: "",
        heroImageUrl: null,
        pageText: "Café Roma",
        links: [],
      },
      restaurantConfig,
    );

    expect(draft.attributes).toEqual(restaurantConfig.attributeDefaults);
    expect(draft.catalogSections[0]?.name).toBe(
      restaurantConfig.vocabulary.catalog,
    );
    expect(draft.defaultLocale).toBe("fr");
  });

  /**
   * The same generic fallback, driven by a second vertical's config — this is
   * what proves `deterministicDraft` reads vocabulary and defaults off the
   * descriptor instead of knowing anything about restaurants.
   */
  it("builds the deterministic fallback for beauty from the same code path", () => {
    const draft = deterministicDraft(
      {
        source: "Atelier Coupe",
        sourceUrl: null,
        sourceLocale: "fr",
        name: "Atelier Coupe",
        description: "",
        address: "",
        phone: "",
        heroImageUrl: null,
        pageText: "Atelier Coupe",
        links: [],
      },
      beautyConfig,
    );

    expect(draft.attributes).toEqual(beautyConfig.attributeDefaults);
    expect(draft.catalogSections[0]?.name).toBe(
      beautyConfig.vocabulary.catalog,
    );
  });
});

/**
 * The lookups that make a niche domain a config entry instead of a new route.
 * `proxy.ts` and the storefront page are both built entirely on these, so a
 * regression here is a niche serving the wrong site or no site at all.
 */
describe("niche routing", () => {
  it("round-trips every registered vertical through its slug", () => {
    for (const id of listVerticalIds()) {
      expect(resolveVerticalBySlug(verticalSlug(id))).toBe(id);
    }
  });

  /**
   * The slug arrives from a URL segment and from the `?vertical=` a storefront
   * puts on its own CTA, so it is untrusted input on both paths.
   */
  it("rejects a slug no vertical declares", () => {
    expect(resolveVerticalBySlug("not-a-registered-vertical")).toBeNull();
    expect(resolveVerticalBySlug("")).toBeNull();
  });

  it("resolves a niche's own domain to that niche", () => {
    expect(resolveVerticalByHostname("restofront.com")).toBe(
      Vertical.RESTAURANT,
    );
    expect(resolveVerticalByHostname("www.restofront.com")).toBe(
      Vertical.RESTAURANT,
    );
  });

  /**
   * Hosts arrive cased however the client sent them and carry a port in
   * development, where a niche is reached at `restofront.localhost:3000`.
   */
  it("normalises case and port before matching", () => {
    expect(resolveVerticalByHostname("RestoFront.com:3000")).toBe(
      Vertical.RESTAURANT,
    );
  });

  /**
   * A miss here is what lets the request fall through to the customer domain
   * table in `proxy.ts`. If this ever matched loosely, a customer's verified
   * custom domain would be answered with a marketing page instead of their site.
   */
  it("claims nothing it was not given", () => {
    expect(resolveVerticalByHostname("cornershop.dev")).toBeNull();
    expect(resolveVerticalByHostname("pizzeria-luigi.com")).toBeNull();
    expect(resolveVerticalByHostname("notrestofront.com")).toBeNull();
    expect(resolveVerticalByHostname("")).toBeNull();
  });

  /**
   * Every niche writes into the one `assets.cornershop.dev` bucket, so a
   * collision here would let two niches overwrite each other's images.
   */
  it("gives every niche its own asset folder, named after its domain", () => {
    expect(verticalAssetNamespace(Vertical.RESTAURANT)).toBe("restofrontcom");
    expect(verticalAssetNamespace(Vertical.BEAUTY)).toBe(
      verticalSlug(Vertical.BEAUTY),
    );

    const namespaces = listVerticalIds().map(verticalAssetNamespace);
    expect(new Set(namespaces).size).toBe(namespaces.length);
    for (const namespace of namespaces) {
      expect(namespace).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("lets no two verticals register the same hostname", () => {
    const claimed = listVerticalIds().flatMap(
      (id) => resolveVerticalConfig(id).marketing.hostnames,
    );
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  /**
   * The factory homepage renders this list directly. Registered-but-unlaunched
   * verticals stay private until their domain and niche positioning are ready.
   */
  it("lists only launched niches for the homepage", () => {
    const listed = listMarketingVerticals();
    expect(listed).toEqual(
      listVerticalIds()
        .filter((id) => Boolean(resolveVerticalConfig(id).marketing.domain))
        .sort((a, b) =>
          resolveVerticalConfig(a).marketing.brand.name.localeCompare(
            resolveVerticalConfig(b).marketing.brand.name,
          ),
        ),
    );
    expect(listed).not.toContain(Vertical.BEAUTY);
  });

  it("registers the selected Restofrontapp mark and favicon assets", () => {
    expect(restaurantConfig.marketing.brand.name).toBe("Restofrontapp");
    expect(restaurantConfig.marketing.brand.initials).toBe("RA");
    expect(restaurantConfig.marketing.brand.mark).toEqual({
      src: "/brand/restofrontapp/mark.png",
      faviconSrc: "/brand/restofrontapp/favicon-32.png",
      appleTouchIconSrc: "/brand/restofrontapp/apple-touch-icon.png",
    });
  });

  /**
   * The two halves of launching a niche, tied together. A niche with a domain is
   * selling, and a selling niche writes to its customers — if it has no sender of
   * its own, `emailSender` falls through to the deploy-wide `EMAIL_FROM` and a
   * salon owner gets their sign-in link from Cornershopdev. Adding the domain and
   * forgetting the sender is exactly the omission that produces that, so it fails
   * here instead of in someone's inbox.
   */
  it("gives every launched niche a sender of its own", () => {
    for (const id of listVerticalIds()) {
      const { domain, email } = resolveVerticalConfig(id).marketing;
      if (!domain) continue;
      expect(email).not.toBeNull();
      expect(email?.from).toContain("@");
      expect(email?.replyTo).toContain("@");
    }
  });
});
