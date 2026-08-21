import type { PersistableSiteDraft } from "@/lib/site-persistence";

/**
 * Source-page images are discovery candidates, not publishable draft content.
 * Imports persist them separately as immutable PhotoAssets; an owner must then
 * approve and select an asset before it is projected back into the draft.
 */
export function withoutUnreviewedSourcePhotos<TDraft extends PersistableSiteDraft>(
  draft: TDraft,
): TDraft {
  return {
    ...draft,
    heroImageUrl: null,
    heroOriginalImageUrl: null,
    heroImageProvenance: null,
    galleryImages: [],
    catalogSections: draft.catalogSections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        imageUrl: null,
        originalImageUrl: null,
        imageProvenance: null,
      })),
    })),
  } as TDraft;
}
