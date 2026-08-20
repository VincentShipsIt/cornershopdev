import { describe, expect, it } from "bun:test";
import { Vertical } from "@/generated/prisma/enums";
import {
  assertVerticalPublicationEnabled,
  PUBLICATION_UNAVAILABLE_MESSAGE,
  publicationCapabilityFailureResponse,
} from "@/lib/site-publication-capability";

describe("site publication capability", () => {
  it("returns the API conflict response and service error for private pilots", async () => {
    for (const vertical of [Vertical.FOOD_RETAIL, Vertical.LOCAL_SERVICE]) {
      const response = publicationCapabilityFailureResponse(vertical);

      expect(response?.status).toBe(409);
      expect(await response?.json()).toEqual({
        error: PUBLICATION_UNAVAILABLE_MESSAGE,
      });
      expect(() => assertVerticalPublicationEnabled(vertical)).toThrow(
        PUBLICATION_UNAVAILABLE_MESSAGE,
      );
    }
  });

  it("preserves restaurant and beauty publication behavior", () => {
    for (const vertical of [Vertical.RESTAURANT, Vertical.BEAUTY]) {
      expect(publicationCapabilityFailureResponse(vertical)).toBeNull();
      expect(() => assertVerticalPublicationEnabled(vertical)).not.toThrow();
    }
  });
});
