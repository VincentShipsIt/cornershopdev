import type { VerticalId } from "@/lib/verticals/types";
import type { RestaurantDraft } from "@/lib/restaurant";
import type {
  OwnerDraftSaveOptions,
  OwnerDraftSaveResult,
  PersistableSiteDraft,
} from "@/lib/site-persistence";

export async function regenerateAndPersistRestaurantTranslation(input: {
  slug: string;
  locale: string;
  vertical: VerticalId;
  actor: { id: string; email: string };
  expectedRevision: number;
  draft: RestaurantDraft;
  regenerate: (
    draft: RestaurantDraft,
    locale: string,
  ) => Promise<RestaurantDraft>;
  toPersistableDraft: (draft: RestaurantDraft) => PersistableSiteDraft;
  persist: (
    slug: string,
    draft: PersistableSiteDraft,
    vertical: VerticalId,
    options: OwnerDraftSaveOptions,
  ) => Promise<OwnerDraftSaveResult>;
}): Promise<{ draft: RestaurantDraft; revision: number }> {
  const regenerated = await input.regenerate(input.draft, input.locale);
  const saved = await input.persist(
    input.slug,
    input.toPersistableDraft(regenerated),
    input.vertical,
    {
      actor: input.actor,
      auditType: "site.translation.regenerated",
      expectedRevision: input.expectedRevision,
    },
  );
  return { draft: regenerated, revision: saved.revision };
}
