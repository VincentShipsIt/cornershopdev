import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Vertical } from "@/generated/prisma/enums";
import { saveAuthorizedSiteDraft } from "@/lib/owner-site-save";
import { sampleRestaurant } from "@/lib/restaurant";
import { DraftRevisionConflictError } from "@/lib/site-persistence";

let currentRevision = 7;
const updateSiteDraft = mock(
  async (
    _slug: string,
    _draft: unknown,
    _vertical: Vertical,
    options?: { expectedRevision?: number },
  ) => {
    if (options?.expectedRevision !== currentRevision) {
      throw new DraftRevisionConflictError(currentRevision);
    }
    currentRevision += 1;
    return { revision: currentRevision };
  },
);

const access = {
  site: { vertical: Vertical.RESTAURANT },
  user: { id: "owner_1", email: "owner@example.test" },
};

describe("owner site save revision contract", () => {
  beforeEach(() => {
    currentRevision = 7;
    updateSiteDraft.mockClear();
  });

  it("requires a non-negative integer expectedRevision", async () => {
    const response = await saveRequest(sampleRestaurant);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "A valid expectedRevision is required to save this draft",
      code: "EXPECTED_REVISION_REQUIRED",
    });
    expect(updateSiteDraft).not.toHaveBeenCalled();
  });

  it("returns 409 when a second independently loaded tab makes its first save", async () => {
    const firstTabRevision = currentRevision;
    const secondTabRevision = currentRevision;

    const first = await saveRequest({
      ...sampleRestaurant,
      description: "The first independently loaded owner tab wins this save.",
      expectedRevision: firstTabRevision,
    });
    const firstPayload = await first.json();
    expect(firstPayload).toMatchObject({ revision: 8 });
    expect(first.status).toBe(200);

    const second = await saveRequest({
      ...sampleRestaurant,
      description: "The stale second owner tab must not overwrite that save.",
      expectedRevision: secondTabRevision,
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      error: "This draft was updated elsewhere. Reload before saving again.",
      code: "DRAFT_REVISION_CONFLICT",
      currentRevision: 8,
    });
  });
});

function saveRequest(body: Record<string, unknown> | typeof sampleRestaurant) {
  return saveAuthorizedSiteDraft(
    sampleRestaurant.slug,
    access,
    body,
    updateSiteDraft,
  );
}
