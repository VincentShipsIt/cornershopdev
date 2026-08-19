import { describe, expect, it } from "bun:test";
import { FACTORY_BRAND } from "@/lib/brand";
import {
  businessInitials,
  customerHostname,
  factoryMetadataOrigin,
  previewMetadata,
  previewOgCard,
} from "@/lib/preview-metadata";

const osteria = {
  name: "Osteria Luna",
  description:
    "A neighbourhood osteria serving handmade pasta, charcoal-grilled fish and the kind of long lunches that quietly become dinner.",
  slug: "osteria-luna",
  defaultLocale: "en",
  eyebrow: "Seasonal Italian kitchen · Valletta",
  heroImageUrl:
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1800&q=88",
  palette: {
    background: "#f4efe5",
    foreground: "#1d241f",
    accent: "#a5482d",
  },
};

const factoryOrigin = "https://cornershop.dev";

describe("previewMetadata", () => {
  it("unfurls a live customer host as the business, not the factory", () => {
    const metadata = previewMetadata(osteria, {
      isLiveSurface: true,
      locales: ["en", "fr"],
      verifiedHostname: "osteria-luna.example",
      factoryOrigin,
      factoryName: FACTORY_BRAND.name,
    });

    expect(metadata.title).toEqual({ absolute: "Osteria Luna" });
    expect(metadata.description).toBe(osteria.description);
    expect(metadata.metadataBase).toEqual(
      new URL("https://osteria-luna.example"),
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates).toEqual({
      canonical: "/",
      languages: { en: "/", fr: "/fr" },
    });
    expect(metadata.openGraph).toEqual({
      title: "Osteria Luna",
      description: osteria.description,
      siteName: "Osteria Luna",
      type: "website",
      url: "https://osteria-luna.example/",
    });
    expect(metadata.twitter).toEqual({
      card: "summary_large_image",
      title: "Osteria Luna",
      description: osteria.description,
    });
    expect(metadata.openGraph?.siteName).not.toBe("Cornershopdev");
    expect(metadata.openGraph?.siteName).not.toBe(FACTORY_BRAND.name);
  });

  it("keeps unpublished and prospect previews noindex on the factory origin", () => {
    const metadata = previewMetadata(osteria, {
      isLiveSurface: false,
      locales: ["en", "fr"],
      verifiedHostname: "osteria-luna.example",
      factoryOrigin,
      factoryName: FACTORY_BRAND.name,
    });

    expect(metadata.title).toEqual({
      absolute: "Osteria Luna — Private preview",
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.metadataBase).toEqual(new URL(factoryOrigin));
    expect(metadata.alternates).toEqual({
      canonical: "/preview/osteria-luna",
      languages: {
        en: "/preview/osteria-luna",
        fr: "/preview/osteria-luna/fr",
      },
    });
    expect(metadata.openGraph).toEqual({
      title: "Osteria Luna — Private preview",
      description: osteria.description,
      siteName: "Cornershopdev",
      type: "website",
      url: "https://cornershop.dev/preview/osteria-luna",
    });
    expect(metadata.twitter?.title).toBe("Osteria Luna — Private preview");
  });

  it("falls back to the factory preview URL when a live site has no verified domain", () => {
    const metadata = previewMetadata(osteria, {
      isLiveSurface: true,
      locale: "fr",
      locales: ["en", "fr"],
      verifiedHostname: null,
      factoryOrigin,
      factoryName: FACTORY_BRAND.name,
    });

    expect(metadata.openGraph?.siteName).toBe("Osteria Luna");
    expect(metadata.metadataBase).toEqual(new URL(factoryOrigin));
    expect(metadata.alternates?.canonical).toBe("/preview/osteria-luna/fr");
    expect(metadata.openGraph?.url).toBe(
      "https://cornershop.dev/preview/osteria-luna/fr",
    );
  });
});

describe("previewOgCard", () => {
  it("uses the published hero on a live customer surface", () => {
    expect(
      previewOgCard(osteria, { isLiveSurface: true }),
    ).toEqual({
      kind: "live",
      name: "Osteria Luna",
      tagline: "Seasonal Italian kitchen · Valletta",
      initials: "OL",
      heroImageUrl: osteria.heroImageUrl,
      palette: osteria.palette,
    });
  });

  it("falls back to a brand-colored card when a live site has no hero", () => {
    expect(
      previewOgCard(
        { ...osteria, heroImageUrl: "  " },
        { isLiveSurface: true },
      ),
    ).toMatchObject({
      kind: "live",
      heroImageUrl: null,
      tagline: osteria.eyebrow,
      palette: osteria.palette,
    });
  });

  it("does not promote an unpublished prospect with a restaurant hero", () => {
    expect(
      previewOgCard(osteria, { isLiveSurface: false }),
    ).toEqual({
      kind: "unpublished",
      name: "Osteria Luna",
    });
  });
});

describe("preview metadata helpers", () => {
  it("reads a customer hostname and ignores factory and niche hosts", () => {
    expect(
      customerHostname(
        new Headers({ "x-forwarded-host": " Osteria-Luna.Example:443 " }),
      ),
    ).toBe("osteria-luna.example");
    expect(
      customerHostname(new Headers({ host: "cornershop.dev" })),
    ).toBeNull();
    expect(
      customerHostname(new Headers({ host: "restofront.com" })),
    ).toBeNull();
  });

  it("derives the factory metadata origin from NEXT_PUBLIC_APP_URL", () => {
    expect(factoryMetadataOrigin("https://cornershop.dev/dashboard")).toBe(
      "https://cornershop.dev",
    );
    expect(factoryMetadataOrigin("not a url")).toBe("https://cornershop.dev");
  });

  it("takes initials from the first two words", () => {
    expect(businessInitials("Le Petit Meunier")).toBe("LP");
    expect(businessInitials("Noma")).toBe("NO");
  });
});
