import { describe, expect, it } from "bun:test";
import { fromRestaurantDraft, sampleRestaurant } from "@/lib/restaurant";
import { DraftRevisionConflictError } from "@/lib/site-persistence";
import type {
  OwnerDraftSaveOptions,
  PersistableSiteDraft,
} from "@/lib/site-persistence";
import type { VerticalId } from "@/lib/verticals/types";
import { regenerateAndPersistRestaurantTranslation } from "@/lib/translation-regeneration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("translation regeneration revision contract", () => {
  it("rejects a concurrent owner save that lands while AI is running", async () => {
    let currentRevision = 7;
    const generation = deferred<typeof sampleRestaurant>();
    const regeneration = regenerateAndPersistRestaurantTranslation({
      slug: sampleRestaurant.slug,
      locale: "en",
      vertical: "RESTAURANT",
      actor: { id: "owner_1", email: "owner@example.test" },
      expectedRevision: 7,
      draft: sampleRestaurant,
      regenerate: async () => generation.promise,
      toPersistableDraft: fromRestaurantDraft,
      persist: async (_slug, _draft, _vertical, options) => {
        if (options.expectedRevision !== currentRevision) {
          throw new DraftRevisionConflictError(currentRevision);
        }
        currentRevision += 1;
        return { revision: currentRevision };
      },
    });

    currentRevision = 8;
    generation.resolve(sampleRestaurant);

    await expect(regeneration).rejects.toMatchObject({
      name: "DraftRevisionConflictError",
      currentRevision: 8,
    });
  });

  it("returns the persisted revision for the owner's next save", async () => {
    let currentRevision = 3;
    const persist = async (
      _slug: string,
      _draft: PersistableSiteDraft,
      _vertical: VerticalId,
      options: OwnerDraftSaveOptions,
    ) => {
      if (options.expectedRevision !== currentRevision) {
        throw new DraftRevisionConflictError(currentRevision);
      }
      currentRevision += 1;
      return { revision: currentRevision };
    };
    const result = await regenerateAndPersistRestaurantTranslation({
      slug: sampleRestaurant.slug,
      locale: "en",
      vertical: "RESTAURANT",
      actor: { id: "owner_1", email: "owner@example.test" },
      expectedRevision: currentRevision,
      draft: sampleRestaurant,
      regenerate: async (draft) => draft,
      toPersistableDraft: fromRestaurantDraft,
      persist,
    });

    expect(result.revision).toBe(4);
    const nextSave = await persist(
      sampleRestaurant.slug,
      fromRestaurantDraft(sampleRestaurant),
      "RESTAURANT",
      { expectedRevision: result.revision },
    );
    expect(nextSave.revision).toBe(5);
  });
});
