import type { SiteDraftView } from "@/lib/site-draft";

const schemaTypes = {
  plumber: "Plumber",
  electrician: "Electrician",
  builder: "GeneralContractor",
  repair: "HomeAndConstructionBusiness",
  artisan: "ProfessionalService",
  "general-trades": "HomeAndConstructionBusiness",
} as const;

type LocalServiceJsonLd = {
  "@context": "https://schema.org";
  "@type": string;
  name: string;
  description?: string;
  telephone?: string;
  url?: string;
  image?: string;
  address?: { "@type": "PostalAddress"; streetAddress: string };
  openingHours?: string[];
  areaServed?: Array<{ "@type": "Place"; name: string }>;
  hasCredential?: Array<{
    "@type": "EducationalOccupationalCredential";
    credentialCategory: string;
    recognizedBy?: { "@type": "Organization"; name: string };
  }>;
  makesOffer?: Array<{
    "@type": "Offer";
    itemOffered: { "@type": "Service"; name: string; description?: string };
  }>;
  sameAs?: string[];
  potentialAction?: Array<{
    "@type": "CommunicateAction";
    name: string;
    target: string;
  }>;
};

export function buildLocalServiceJsonLd(
  draft: SiteDraftView,
): LocalServiceJsonLd {
  const attributes = record(draft.attributes);
  const tradeType =
    typeof attributes.tradeType === "string" &&
    attributes.tradeType in schemaTypes
      ? (attributes.tradeType as keyof typeof schemaTypes)
      : "general-trades";
  const serviceAreas = stringArray(attributes.serviceAreas);
  const credentials = objectArray(attributes.credentials);
  const services = draft.catalogSections.flatMap((section) =>
    section.items
      .filter((item) => item.available)
      .map((item) => ({
        "@type": "Offer" as const,
        itemOffered: {
          "@type": "Service" as const,
          name: item.name,
          ...(item.description.trim()
            ? { description: item.description.trim() }
            : {}),
        },
      })),
  );
  const actions = draft.integrations
    .filter(
      (integration) =>
        integration.enabled &&
        (integration.type === "quote" || integration.type === "contact"),
    )
    .map((integration) => ({
      "@type": "CommunicateAction" as const,
      name: integration.label,
      target: integration.url,
    }));
  const socialLinks = draft.integrations
    .filter(
      (integration) => integration.enabled && integration.type === "social",
    )
    .map((integration) => integration.url);
  const hours = draft.businessHours
    .map((entry) => `${entry.days} ${entry.hours}`.trim())
    .filter(Boolean);

  return compact({
    "@context": "https://schema.org",
    "@type": schemaTypes[tradeType],
    name: draft.name,
    description: draft.description.trim() || undefined,
    telephone: draft.phone.trim() || undefined,
    url: draft.sourceUrl ?? undefined,
    image: draft.heroImageUrl ?? undefined,
    address: draft.address.trim()
      ? { "@type": "PostalAddress", streetAddress: draft.address.trim() }
      : undefined,
    openingHours: hours.length > 0 ? hours : undefined,
    areaServed:
      serviceAreas.length > 0
        ? serviceAreas.map((name) => ({ "@type": "Place", name }))
        : undefined,
    hasCredential:
      credentials.length > 0
        ? credentials.flatMap((credential) => {
            const name = text(credential.name);
            if (!name) return [];
            const issuer = text(credential.issuer);
            return [
              {
                "@type": "EducationalOccupationalCredential" as const,
                credentialCategory: name,
                ...(issuer
                  ? {
                      recognizedBy: {
                        "@type": "Organization" as const,
                        name: issuer,
                      },
                    }
                  : {}),
              },
            ];
          })
        : undefined,
    makesOffer: services.length > 0 ? services : undefined,
    sameAs: socialLinks.length > 0 ? socialLinks : undefined,
    potentialAction: actions.length > 0 ? actions : undefined,
  });
}

export function serializeLocalServiceJsonLd(draft: SiteDraftView): string {
  return JSON.stringify(buildLocalServiceJsonLd(draft)).replaceAll(
    "<",
    "\\u003c",
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record).filter(Boolean) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
