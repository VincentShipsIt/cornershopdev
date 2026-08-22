import { describe, expect, it } from "bun:test";
import { Vertical } from "@/generated/prisma/enums";
import {
  assertVerticalPublicationEnabled,
  publicationCapabilityFailureResponse,
} from "@/lib/site-publication-capability";

describe("site publication capability", () => {
  it("allows reviewed publication for every registered SMB vertical", () => {
    for (const vertical of Object.values(Vertical)) {
      expect(publicationCapabilityFailureResponse(vertical)).toBeNull();
      expect(() => assertVerticalPublicationEnabled(vertical)).not.toThrow();
    }
  });
});
