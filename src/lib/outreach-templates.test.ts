import { describe, expect, it } from "bun:test";
import {
  buildFollowUp1Email,
  buildOutreachEmail,
  buildPreviewReadyEmail,
} from "@/lib/outreach-templates";

const baseInput = {
  siteName: 'Chez <Léa> "Bistro"',
  vertical: "RESTAURANT" as const,
  previewUrl: "https://cornershop.dev/preview/chez-lea",
  claimUrl:
    "https://cornershop.dev/claim/chez-lea#claim_token=secret&next=<bad>",
};

describe("preview ready email", () => {
  it("uses the site niche and escapes stored business names", () => {
    const email = buildPreviewReadyEmail(baseInput);

    expect(email.from).toContain("Restofront");
    expect(email.subject).toContain('Chez <Léa> "Bistro"');
    expect(email.html).toContain("Chez &lt;Léa&gt; &quot;Bistro&quot;");
    expect(email.html).not.toContain("next=<bad>");
    expect(email.html).toContain("claim_token=secret&amp;next=&lt;bad&gt;");
  });

  it("embeds both the preview and claim links", () => {
    const email = buildPreviewReadyEmail(baseInput);

    expect(email.html).toContain(
      "https://cornershop.dev/preview/chez-lea",
    );
    expect(email.text).toContain("https://cornershop.dev/preview/chez-lea");
    expect(email.text).toContain(baseInput.claimUrl);
  });

  it("includes a plain-text body distinct from the html body", () => {
    const email = buildPreviewReadyEmail(baseInput);

    expect(email.text).not.toContain("<div");
    expect(email.text.length).toBeGreaterThan(0);
  });
});

describe("follow up 1 email", () => {
  it("escapes stored business names and links to the same preview and claim urls", () => {
    const email = buildFollowUp1Email(baseInput);

    expect(email.subject).toContain('Chez <Léa> "Bistro"');
    expect(email.html).toContain("Chez &lt;Léa&gt; &quot;Bistro&quot;");
    expect(email.html).not.toContain("next=<bad>");
    expect(email.text).toContain(baseInput.previewUrl);
  });
});

describe("buildOutreachEmail", () => {
  it("dispatches to the preview_ready builder", () => {
    const email = buildOutreachEmail("preview_ready", baseInput);
    expect(email.subject).toBe(buildPreviewReadyEmail(baseInput).subject);
  });

  it("dispatches to the follow_up_1 builder", () => {
    const email = buildOutreachEmail("follow_up_1", baseInput);
    expect(email.subject).toBe(buildFollowUp1Email(baseInput).subject);
  });
});
