import { describe, expect, it } from "bun:test";
import {
  GLOBAL_OUTREACH_PAUSE_KEY,
  isOutreachPaused,
  siteOutreachPauseKey,
} from "@/lib/outreach-pause";

describe("outreach pause scopes", () => {
  it("stops every lead for the global switch and only one lead for its switch", () => {
    expect(
      isOutreachPaused(
        [{ key: GLOBAL_OUTREACH_PAUSE_KEY, value: true }],
        "site_1",
      ),
    ).toBe(true);
    expect(
      isOutreachPaused(
        [{ key: siteOutreachPauseKey("site_1"), value: true }],
        "site_1",
      ),
    ).toBe(true);
    expect(
      isOutreachPaused(
        [{ key: siteOutreachPauseKey("site_1"), value: true }],
        "site_2",
      ),
    ).toBe(false);
  });

  it("fails closed for a malformed pause value", () => {
    expect(
      isOutreachPaused(
        [
          { key: GLOBAL_OUTREACH_PAUSE_KEY, value: "true" },
          { key: siteOutreachPauseKey("site_1"), value: false },
        ],
        "site_1",
      ),
    ).toBe(true);
  });
});
