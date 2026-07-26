import { describe, expect, it } from "bun:test";
import { buildMagicLinkEmail } from "@/lib/magic-link-email";

describe("magic-link email identity", () => {
  it("supports a platform-only superadmin with no customer site", () => {
    const email = buildMagicLinkEmail({
      verifyUrl: "https://cornershop.dev/api/auth/verify?token=signed",
      isSuperadmin: true,
      site: null,
    });

    expect(email.subject).toBe("Open the Cornershopdev operator console");
    expect(email.from).not.toContain("Restofrontapp");
    expect(email.html).toContain("operator console");
  });

  it("keeps customer sign-in under the owning niche", () => {
    const email = buildMagicLinkEmail({
      verifyUrl: "https://cornershop.dev/api/auth/verify?token=signed",
      isSuperadmin: false,
      site: { name: "Chez Lea", vertical: "RESTAURANT" },
    });

    expect(email.subject).toBe("Open Chez Lea in Restofrontapp");
    expect(email.from).toContain("Restofrontapp");
    expect(email.html).toContain("Chez Lea dashboard");
  });
});
