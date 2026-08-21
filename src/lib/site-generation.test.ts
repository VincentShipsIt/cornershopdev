import { describe, expect, it } from "bun:test";
import {
  selectCatalogSource,
  selectSourceBackedEmail,
} from "@/lib/ai/site-generation";

describe("model-assisted source facts", () => {
  it("does not reconstruct an unused deterministic catalog", () => {
    expect(
      selectCatalogSource(
        false,
        () => {
          throw new Error("unused deterministic catalog failed");
        },
        () => ["model catalog"],
      ),
    ).toEqual(["model catalog"]);
  });

  it("prefers a non-empty reconstructed business email", () => {
    expect(
      selectSourceBackedEmail(
        "source@example.com",
        "model@example.com",
        "Contact model@example.com",
      ),
    ).toBe("source@example.com");
  });

  it("uses a model-extracted email only when collected source text contains it", () => {
    expect(
      selectSourceBackedEmail(
        "",
        "Hello@Example.com",
        "For bookings email hello@example.com today.",
      ),
    ).toBe("hello@example.com");
    expect(
      selectSourceBackedEmail(
        "",
        "invented@example.com",
        "Call the business for bookings.",
      ),
    ).toBe("");
  });

  it("matches complete validated source addresses rather than substrings", () => {
    expect(
      selectSourceBackedEmail(
        "",
        "foo@example.com",
        "Contact info@foo@example.com or bookings@example.com.",
      ),
    ).toBe("");
    expect(
      selectSourceBackedEmail(
        "",
        "BOOKINGS@EXAMPLE.COM",
        "Contact info@foo@example.com or bookings@example.com.",
      ),
    ).toBe("bookings@example.com");
    expect(
      selectSourceBackedEmail(
        "not an email",
        "bookings@example.com?subject=unsafe",
        "Contact bookings@example.com.",
      ),
    ).toBe("");
  });
});
