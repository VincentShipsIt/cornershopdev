import { Vertical } from "@/generated/prisma/enums";
import {
  fromRestaurantDraft,
  toRestaurantDraft,
  type RestaurantDraft,
  type RestaurantSiteDraft,
} from "@/lib/restaurant";
import {
  persistSiteImport,
  type PersistedSiteImport,
} from "@/lib/site-persistence";

/**
 * Restaurant-shaped adapter over the generic import write path. The flat
 * `RestaurantDraft` is a presentation shape; storage only ever sees the nested
 * site shape, so the conversion happens here and nowhere else.
 */
export {
  createImportJob,
  updateImportJob,
  recordImportFailure,
  ImportConflictError,
  ImportDatabaseUnavailableError,
} from "@/lib/site-persistence";

export type PersistedRestaurantImport = Omit<
  PersistedSiteImport<RestaurantSiteDraft>,
  "draft"
> & { draft: RestaurantDraft };

export async function persistRestaurantImport(input: {
  draft: RestaurantDraft;
  source: string;
  importJobId: string;
}): Promise<PersistedRestaurantImport> {
  const { draft, ...rest } = await persistSiteImport<RestaurantSiteDraft>({
    draft: fromRestaurantDraft(input.draft),
    vertical: Vertical.RESTAURANT,
    source: input.source,
    importJobId: input.importJobId,
  });

  return { ...rest, draft: toRestaurantDraft(draft) };
}
