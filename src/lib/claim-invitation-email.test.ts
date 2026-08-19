import { describe, expect, it } from "bun:test";
import { buildClaimInvitationEmail } from "@/lib/claim-invitation-email";

describe("claim invitation email", () => {
  it("uses the site niche and escapes stored business names", () => {
    const email = buildClaimInvitationEmail({
      claimUrl:
        "https://cornershop.dev/claim/chez-lea#claim_token=secret&next=<bad>",
      siteName: 'Chez <Léa> "Bistro"',
      vertical: "RESTAURANT",
      expiresAt: new Date("2026-07-28T12:00:00.000Z"),
      siteUrl: "https://chez-lea.restofront.com",
    });

    expect(email.from).toContain("Restofront");
    expect(email.subject).toBe('Verify ownership of Chez <Léa> "Bistro"');
    expect(email.html).toContain("Chez &lt;Léa&gt; &quot;Bistro&quot;");
    expect(email.html).not.toContain("next=<bad>");
    expect(email.html).toContain("claim_token=secret&amp;next=&lt;bad&gt;");
    expect(email.html).toContain("https://chez-lea.restofront.com");
    expect(email.html).not.toContain("/preview/");
  });
});
