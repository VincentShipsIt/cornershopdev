import { getDb } from "@/lib/db";
import { integrationUrlDigest } from "@/lib/evidence-digests";
import { sampleSiteDraft } from "@/lib/restaurant";
import { e2e } from "./fixtures";

export async function seedFirstCustomerBrowserJourney() {
  await cleanupFirstCustomerBrowserJourney();
  const db = getDb();
  const user = await db.user.create({
    data: { email: e2e.ownerEmail, name: "Browser Journey Owner" },
  });
  const organization = await db.organization.create({
    data: {
      name: "Browser Journey Existing Organization",
      memberships: { create: { userId: user.id, role: "owner" } },
      sites: {
        create: {
          id: e2e.existingId,
          slug: e2e.existingSlug,
          name: e2e.existingName,
          vertical: "RESTAURANT",
          status: "CLAIMED",
        },
      },
    },
  });
  await db.organization.create({
    data: {
      name: "Browser Journey Unauthorized Organization",
      sites: {
        create: {
          id: e2e.unauthorizedId,
          slug: e2e.unauthorizedSlug,
          name: e2e.unauthorizedName,
          vertical: "RESTAURANT",
          status: "CLAIMED",
        },
      },
    },
  });
  await db.site.create({
    data: {
      id: e2e.targetId,
      slug: e2e.targetSlug,
      name: e2e.targetName,
      eyebrow: sampleSiteDraft.eyebrow,
      description: sampleSiteDraft.description,
      address: sampleSiteDraft.address,
      phone: sampleSiteDraft.phone,
      email: e2e.ownerEmail,
      sourceUrl: "https://restaurant.example.test/menu",
      heroImageUrl: sampleSiteDraft.heroImageUrl,
      heroOriginalImageUrl: sampleSiteDraft.heroOriginalImageUrl,
      heroImageProvenance: "OWNER",
      autoEnhanceImages: sampleSiteDraft.autoEnhanceImages,
      defaultLocale: sampleSiteDraft.defaultLocale,
      translations: sampleSiteDraft.translations,
      businessHours: sampleSiteDraft.businessHours,
      draftTheme: { id: "warm" },
      draftThemeVersion: "legacy-v1",
      draftPalette: sampleSiteDraft.palette,
      attributes: sampleSiteDraft.attributes,
      vertical: "RESTAURANT",
      status: "PREVIEW_READY",
      integrations: {
        create: sampleSiteDraft.integrations.map((integration, position) => ({
          type: integration.type.toUpperCase() as
            | "BOOKING"
            | "ORDERING"
            | "DELIVERY"
            | "SOCIAL",
          label: integration.label,
          provider: integration.provider,
          url: integration.url,
          enabled: integration.enabled,
          venueId: integration.venueId,
          position,
        })),
      },
      catalogSections: {
        create: sampleSiteDraft.catalogSections.map((section, sectionPosition) => ({
          name: section.name,
          description: section.description,
          position: sectionPosition,
          items: {
            create: section.items.map((item, itemPosition) => ({
              name: item.name,
              description: item.description,
              price: item.price,
              currency: item.currency,
              available: item.available,
              imageUrl: item.imageUrl,
              originalImageUrl: item.originalImageUrl,
              imageProvenance: "OWNER",
              attributes: item.attributes,
              position: itemPosition,
            })),
          },
        })),
      },
    },
  });
  return { userId: user.id, organizationId: organization.id };
}

export async function cleanupFirstCustomerBrowserJourney() {
  const db = getDb();
  await db.stripeWebhookEvent.deleteMany({
    where: { eventId: { startsWith: "evt_first_customer_" } },
  });
  await db.site.deleteMany({
    where: {
      id: { in: [e2e.targetId, e2e.existingId, e2e.unauthorizedId] },
    },
  });
  await db.organization.deleteMany({
    where: {
      name: {
        in: [
          "Browser Journey Existing Organization",
          "Browser Journey Unauthorized Organization",
        ],
      },
    },
  });
  await db.user.deleteMany({ where: { email: e2e.ownerEmail } });
}

async function inspectFirstCustomerBrowserJourney() {
  const db = getDb();
  const [site, integrations] = await Promise.all([
    db.site.findUniqueOrThrow({
      where: { id: e2e.targetId },
      select: {
        publishedSiteVersionId: true,
        status: true,
        claimInvitations: { select: { acceptedAt: true } },
        auditEvents: {
          where: { type: { in: ["site.draft.saved", "site.published"] } },
          select: { type: true },
        },
      },
    }),
    db.integration.findMany({
      where: { siteId: e2e.targetId },
      orderBy: { position: "asc" },
      select: { type: true, url: true, enabled: true },
    }),
  ]);
  return {
    status: site.status,
    publishedSiteVersionId: site.publishedSiteVersionId,
    invitationAccepted: site.claimInvitations.some(
      ({ acceptedAt }) => acceptedAt instanceof Date,
    ),
    auditTypes: site.auditEvents.map(({ type }) => type).sort(),
    integrationDigest: integrationUrlDigest(
      integrations.map((item) => ({
        type: item.type.toLowerCase(),
        url: item.url,
        enabled: item.enabled,
      })),
    ),
  };
}

const command = process.argv[2];
try {
  if (command === "seed") {
    await seedFirstCustomerBrowserJourney();
  } else if (command === "cleanup") {
    await cleanupFirstCustomerBrowserJourney();
  } else if (command === "inspect") {
    console.log(JSON.stringify(await inspectFirstCustomerBrowserJourney()));
  } else {
    throw new Error("Use seed, inspect, or cleanup.");
  }
} finally {
  await getDb().$disconnect().catch(() => undefined);
}
