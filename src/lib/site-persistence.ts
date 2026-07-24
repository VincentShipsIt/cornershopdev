import { Prisma } from "@/generated/prisma/client";
import { Vertical } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import {
  buildImportUrls,
  importFailureMessage,
  normalizeImportSource,
  slugCollisionCandidate,
  storedImportSource,
  type ImportUrls,
} from "@/lib/restaurant-import";
import { slugify } from "@/lib/verticals/restaurant/schema";
import { getVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

const retryablePrismaCodes = new Set(["P2002", "P2034"]);
const mutableImportStatuses = new Set(["PROSPECT", "PREVIEW_READY"]);

/**
 * The vertical-agnostic surface every vertical's draft schema produces. Verticals
 * are free to add fields; the write path only ever reads these, and everything
 * vertical-specific travels inside the `attributes` bags.
 */
export type PersistableSiteDraft = {
  slug: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  sourceUrl: string | null;
  heroImageUrl: string | null;
  heroOriginalImageUrl?: string | null;
  heroImageProvenance?: "official" | "owner" | "permissioned-ugc" | null;
  attributes: Record<string, unknown>;
  autoEnhanceImages: boolean;
  defaultLocale: string;
  translations: unknown[];
  catalogSections: Array<{
    name: string;
    description: string;
    items: Array<{
      name: string;
      description: string;
      price: number | null;
      currency: string;
      attributes: Record<string, unknown>;
      imageUrl: string | null;
      originalImageUrl?: string | null;
      imageProvenance?: "official" | "owner" | "permissioned-ugc" | null;
    }>;
  }>;
  integrations: Array<{
    type: "booking" | "ordering" | "delivery" | "social";
    label: string;
    provider: string | null;
    url: string;
    venueId?: string | null;
  }>;
};

export type PersistedSiteImport<TDraft extends PersistableSiteDraft> = {
  draft: TDraft;
  importJobId: string;
  urls: ImportUrls;
  created: boolean;
};

export class ImportDatabaseUnavailableError extends Error {
  constructor() {
    super("Preview persistence is temporarily unavailable");
    this.name = "ImportDatabaseUnavailableError";
  }
}

export class ImportConflictError extends Error {
  constructor() {
    super("This site is already owned and cannot be replaced by an import");
    this.name = "ImportConflictError";
  }
}

export async function createImportJob(
  source: string,
  vertical: VerticalId = Vertical.RESTAURANT,
): Promise<{ id: string; sourceKey: string }> {
  const db = requireImportDatabase();
  const sourceKey = normalizeImportSource(source);
  return db.importJob.create({
    data: {
      source: storedImportSource(source),
      sourceKey,
      vertical,
      status: "QUEUED",
      startedAt: new Date(),
    },
    select: { id: true, sourceKey: true },
  }) as Promise<{ id: string; sourceKey: string }>;
}

export async function updateImportJob(
  importJobId: string,
  data: {
    status?: "CRAWLING" | "EXTRACTING" | "GENERATING";
    workflowRunId?: string;
  },
): Promise<void> {
  await requireImportDatabase().importJob.update({
    where: { id: importJobId },
    data,
  });
}

export async function recordImportFailure(
  importJobId: string,
  error: unknown,
): Promise<string> {
  const message = importFailureMessage(error);
  await requireImportDatabase().importJob.update({
    where: { id: importJobId },
    data: {
      status: "FAILED",
      error: message,
      completedAt: new Date(),
    },
  });
  return message;
}

export async function persistSiteImport<TDraft extends PersistableSiteDraft>(input: {
  draft: TDraft;
  vertical: VerticalId;
  source: string;
  importJobId: string;
}): Promise<PersistedSiteImport<TDraft>> {
  const db = requireImportDatabase();
  const config = getVerticalConfig(input.vertical);
  const draft = config.draftSchema.parse(input.draft) as TDraft;
  const sourceKey = normalizeImportSource(draft.sourceUrl ?? input.source);
  const verticalSlug = input.vertical.toLowerCase();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const identityConditions: Prisma.SiteWhereInput[] = [{ sourceKey }];
          if (draft.sourceUrl) {
            identityConditions.push({ sourceUrl: draft.sourceUrl });
          }

          let existing = await tx.site.findFirst({
            where: { OR: identityConditions },
            select: {
              id: true,
              slug: true,
              sourceKey: true,
              sourceUrl: true,
              status: true,
            },
          });

          const requestedSlug =
            slugify(draft.slug) || slugify(draft.name) || verticalSlug;
          let slug = existing?.slug ?? requestedSlug;

          if (!existing) {
            for (
              let collisionIndex = 0;
              collisionIndex < 100;
              collisionIndex += 1
            ) {
              const candidate = slugCollisionCandidate(
                requestedSlug,
                collisionIndex,
              );
              const collision = await tx.site.findUnique({
                where: { slug: candidate },
                select: {
                  id: true,
                  slug: true,
                  sourceKey: true,
                  sourceUrl: true,
                  status: true,
                },
              });
              if (!collision) {
                slug = candidate;
                break;
              }

              const collisionSourceKey = collision.sourceKey
                ? collision.sourceKey
                : collision.sourceUrl
                  ? normalizeImportSource(collision.sourceUrl)
                  : null;
              if (collisionSourceKey === sourceKey) {
                existing = collision;
                slug = collision.slug;
                break;
              }

              if (collisionIndex === 99) {
                throw new Error("A unique preview URL could not be reserved");
              }
            }
          }

          if (existing && !mutableImportStatuses.has(existing.status)) {
            throw new ImportConflictError();
          }

          const site = existing
            ? await tx.site.update({
                where: { id: existing.id },
                data: {
                  ...siteScalarData(draft, input.vertical, sourceKey),
                  ...siteRelationReplaceData(draft, input.vertical),
                },
                select: { id: true, slug: true },
              })
            : await tx.site.create({
                data: {
                  slug,
                  ...siteScalarData(draft, input.vertical, sourceKey),
                  integrations: { create: integrationCreateData(draft) },
                  catalogSections: {
                    create: catalogSectionCreateData(draft, input.vertical),
                  },
                },
                select: { id: true, slug: true },
              });

          await tx.auditEvent.create({
            data: {
              type: existing ? "site.import.updated" : "site.import.created",
              actor: "system:import",
              metadata: {
                importJobId: input.importJobId,
                vertical: input.vertical,
                source: storedImportSource(input.source),
                sourceKey,
                previousStatus: existing?.status ?? null,
              },
              siteId: site.id,
            },
          });
          await tx.importJob.update({
            where: { id: input.importJobId },
            data: {
              sourceKey,
              vertical: input.vertical,
              status: "READY",
              error: null,
              completedAt: new Date(),
              siteId: site.id,
            },
          });

          const canonicalDraft = config.draftSchema.parse({
            ...draft,
            slug: site.slug,
          }) as TDraft;
          return {
            draft: canonicalDraft,
            importJobId: input.importJobId,
            urls: buildImportUrls(site.slug),
            created: !existing,
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt < 2 && isRetryablePrismaError(error)) continue;
      throw error;
    }
  }

  throw new Error("The site import could not be persisted");
}

/**
 * Owner-initiated edit of an already-persisted site. Shares the exact same column
 * and relation mapping as the import path so the two can never drift. Identity and
 * lifecycle columns (slug, vertical, sourceUrl, sourceKey, status) stay owned by the
 * import — an owner editing copy must never move a site between verticals, re-point
 * its import identity, or resurrect it into PREVIEW_READY after it has been claimed.
 */
export async function updateSiteDraft(
  slug: string,
  draft: PersistableSiteDraft,
  vertical: VerticalId,
): Promise<void> {
  const config = getVerticalConfig(vertical);
  const parsed = config.draftSchema.parse(draft) as PersistableSiteDraft;

  await requireImportDatabase().site.update({
    where: { slug },
    data: {
      ...editableSiteScalarData(parsed, vertical),
      ...siteRelationReplaceData(parsed, vertical),
    },
  });
}

function requireImportDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new ImportDatabaseUnavailableError();
  }
  return getDb();
}

function siteRelationReplaceData(
  draft: PersistableSiteDraft,
  vertical: VerticalId,
) {
  return {
    integrations: {
      deleteMany: {},
      create: integrationCreateData(draft),
    },
    catalogSections: {
      deleteMany: {},
      create: catalogSectionCreateData(draft, vertical),
    },
  };
}

function siteScalarData(
  draft: PersistableSiteDraft,
  vertical: VerticalId,
  sourceKey: string | null,
) {
  return {
    ...editableSiteScalarData(draft, vertical),
    // Identity and lifecycle columns: only the import path owns these. An owner
    // editing copy must never move a site between verticals, re-point its import
    // identity, or resurrect it into PREVIEW_READY after it has been claimed.
    vertical,
    sourceUrl: draft.sourceUrl,
    sourceKey,
    status: "PREVIEW_READY" as const,
  };
}

/** The subset of `Site` columns an owner edit is allowed to overwrite. */
function editableSiteScalarData(
  draft: PersistableSiteDraft,
  vertical: VerticalId,
) {
  const config = getVerticalConfig(vertical);
  return {
    name: draft.name,
    description: draft.description,
    address: draft.address,
    phone: draft.phone,
    heroImageUrl: draft.heroImageUrl,
    heroOriginalImageUrl: draft.heroOriginalImageUrl,
    heroImageProvenance: toDatabaseImageProvenance(draft.heroImageProvenance),
    // Parsed on the way in as well as on the way out: the attributes bag is the
    // only place vertical-specific data lives, so an unvalidated write here is a
    // read-path crash later.
    attributes: config.attributesSchema.parse(
      draft.attributes,
    ) as Prisma.InputJsonValue,
    autoEnhanceImages: draft.autoEnhanceImages,
    defaultLocale: draft.defaultLocale,
    translations: draft.translations as Prisma.InputJsonValue,
  };
}

function integrationCreateData(draft: PersistableSiteDraft) {
  return draft.integrations.map((integration) => ({
    type: toDatabaseIntegrationType(integration.type),
    label: integration.label,
    provider: integration.provider,
    url: integration.url,
    venueId: integration.venueId ?? null,
  }));
}

function catalogSectionCreateData(
  draft: PersistableSiteDraft,
  vertical: VerticalId,
) {
  const config = getVerticalConfig(vertical);
  return draft.catalogSections.map((section, sectionIndex) => ({
    name: section.name,
    description: section.description,
    position: sectionIndex,
    items: {
      create: section.items.map((item, itemIndex) => ({
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        attributes: config.itemAttributesSchema.parse(
          item.attributes,
        ) as Prisma.InputJsonValue,
        imageUrl: item.imageUrl,
        originalImageUrl: item.originalImageUrl,
        imageProvenance: toDatabaseImageProvenance(item.imageProvenance),
        position: itemIndex,
      })),
    },
  }));
}

function toDatabaseIntegrationType(
  value: PersistableSiteDraft["integrations"][number]["type"],
): "BOOKING" | "ORDERING" | "DELIVERY" | "SOCIAL" {
  return value.toUpperCase() as "BOOKING" | "ORDERING" | "DELIVERY" | "SOCIAL";
}

function toDatabaseImageProvenance(
  value: PersistableSiteDraft["heroImageProvenance"],
): "OFFICIAL" | "OWNER" | "PERMISSIONED_UGC" | undefined {
  if (!value) return undefined;
  if (value === "permissioned-ugc") return "PERMISSIONED_UGC";
  return value.toUpperCase() as "OFFICIAL" | "OWNER";
}

function isRetryablePrismaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    retryablePrismaCodes.has(error.code)
  );
}
