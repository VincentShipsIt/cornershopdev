import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  buildImportUrls,
  importFailureMessage,
  normalizeImportSource,
  slugCollisionCandidate,
  storedImportSource,
  type ImportUrls,
} from "@/lib/restaurant-import";
import {
  restaurantDraftSchema,
  slugify,
  type RestaurantDraft,
} from "@/lib/restaurant";

const retryablePrismaCodes = new Set(["P2002", "P2034"]);
const mutableImportStatuses = new Set(["PROSPECT", "PREVIEW_READY"]);

export type PersistedRestaurantImport = {
  draft: RestaurantDraft;
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
    super("This restaurant is already owned and cannot be replaced by an import");
    this.name = "ImportConflictError";
  }
}

export async function createImportJob(source: string): Promise<{
  id: string;
  sourceKey: string;
}> {
  const db = requireImportDatabase();
  const sourceKey = normalizeImportSource(source);
  return db.importJob.create({
    data: {
      source: storedImportSource(source),
      sourceKey,
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

export async function persistRestaurantImport(input: {
  draft: RestaurantDraft;
  source: string;
  importJobId: string;
}): Promise<PersistedRestaurantImport> {
  const db = requireImportDatabase();
  const draft = restaurantDraftSchema.parse(input.draft);
  const sourceKey = normalizeImportSource(draft.sourceUrl ?? input.source);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const identityConditions: Prisma.SiteWhereInput[] = [
            { sourceKey },
          ];
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
            slugify(draft.slug) || slugify(draft.name) || "restaurant";
          let slug = existing?.slug ?? requestedSlug;

          if (!existing) {
            for (let collisionIndex = 0; collisionIndex < 100; collisionIndex += 1) {
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

          const restaurant = existing
            ? await tx.site.update({
                where: { id: existing.id },
                data: restaurantUpdateData(draft, sourceKey),
                select: { id: true, slug: true },
              })
            : await tx.site.create({
                data: restaurantCreateData(draft, sourceKey, slug),
                select: { id: true, slug: true },
              });

          await tx.auditEvent.create({
            data: {
              type: existing
                ? "restaurant.import.updated"
                : "restaurant.import.created",
              actor: "system:import",
              metadata: {
                importJobId: input.importJobId,
                source: storedImportSource(input.source),
                sourceKey,
                previousStatus: existing?.status ?? null,
              },
              siteId: restaurant.id,
            },
          });
          await tx.importJob.update({
            where: { id: input.importJobId },
            data: {
              sourceKey,
              status: "READY",
              error: null,
              completedAt: new Date(),
              siteId: restaurant.id,
            },
          });

          const canonicalDraft = restaurantDraftSchema.parse({
            ...draft,
            slug: restaurant.slug,
          });
          return {
            draft: canonicalDraft,
            importJobId: input.importJobId,
            urls: buildImportUrls(restaurant.slug),
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

  throw new Error("The restaurant import could not be persisted");
}

function requireImportDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new ImportDatabaseUnavailableError();
  }
  return getDb();
}

function restaurantUpdateData(
  draft: RestaurantDraft,
  sourceKey: string,
): Prisma.SiteUpdateInput {
  return {
    ...restaurantScalarData(draft, sourceKey),
    integrations: {
      deleteMany: {},
      create: integrationCreateData(draft),
    },
    catalogSections: {
      deleteMany: {},
      create: menuSectionCreateData(draft),
    },
  };
}

function restaurantCreateData(
  draft: RestaurantDraft,
  sourceKey: string,
  slug: string,
): Prisma.SiteCreateInput {
  return {
    slug,
    ...restaurantScalarData(draft, sourceKey),
    integrations: { create: integrationCreateData(draft) },
    catalogSections: { create: menuSectionCreateData(draft) },
  };
}

function restaurantScalarData(draft: RestaurantDraft, sourceKey: string) {
  return {
    name: draft.name,
    description: draft.description,
    address: draft.address,
    phone: draft.phone,
    sourceUrl: draft.sourceUrl,
    sourceKey,
    heroImageUrl: draft.heroImageUrl,
    heroOriginalImageUrl: draft.heroOriginalImageUrl,
    heroImageProvenance: toDatabaseImageProvenance(
      draft.heroImageProvenance,
    ),
    attributes: {
      cuisine: draft.cuisine,
      showMenuImages: draft.showMenuImages,
    },
    autoEnhanceImages: draft.autoEnhanceImages,
    defaultLocale: draft.defaultLocale,
    translations: draft.translations,
    status: "PREVIEW_READY" as const,
  };
}

function integrationCreateData(draft: RestaurantDraft) {
  return draft.integrations.map((integration) => ({
    type: toDatabaseIntegrationType(integration.type),
    label: integration.label,
    provider: integration.provider,
    url: integration.url,
  }));
}

function menuSectionCreateData(draft: RestaurantDraft) {
  return draft.menuSections.map((section, sectionIndex) => ({
    name: section.name,
    description: section.description,
    position: sectionIndex,
    items: {
      create: section.items.map((item, itemIndex) => ({
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        attributes: {
          dietaryLabels: item.dietaryLabels,
        },
        imageUrl: item.imageUrl,
        originalImageUrl: item.originalImageUrl,
        imageProvenance: toDatabaseImageProvenance(
          item.imageProvenance,
        ),
        position: itemIndex,
      })),
    },
  }));
}

function toDatabaseIntegrationType(
  value: RestaurantDraft["integrations"][number]["type"],
): "BOOKING" | "ORDERING" | "DELIVERY" | "SOCIAL" {
  return value.toUpperCase() as
    | "BOOKING"
    | "ORDERING"
    | "DELIVERY"
    | "SOCIAL";
}

function toDatabaseImageProvenance(
  value: RestaurantDraft["heroImageProvenance"],
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
