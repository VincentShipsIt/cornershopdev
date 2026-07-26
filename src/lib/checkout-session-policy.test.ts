import { describe, expect, it } from "bun:test";
import { checkoutSessionAction } from "@/lib/checkout-session-policy";

describe("bound Checkout session lifecycle", () => {
  it("reuses an open session for the same plan", () => {
    expect(
      checkoutSessionAction(
        { status: "open", url: "https://checkout.test", priceId: "price_a" },
        "price_a",
      ),
    ).toBe("reuse");
  });

  it("expires an open session before changing plans", () => {
    expect(
      checkoutSessionAction(
        { status: "open", url: "https://checkout.test", priceId: "price_a" },
        "price_b",
      ),
    ).toBe("expire_and_replace");
    expect(
      checkoutSessionAction(
        { status: "open", url: null, priceId: "price_a" },
        "price_a",
      ),
    ).toBe("expire_and_replace");
  });

  it("replaces expired sessions and never duplicates a completed payment", () => {
    expect(
      checkoutSessionAction(
        { status: "expired", url: null, priceId: "price_a" },
        "price_b",
      ),
    ).toBe("replace");
    expect(
      checkoutSessionAction(
        { status: "complete", url: null, priceId: "price_a" },
        "price_b",
      ),
    ).toBe("await_provisioning");
  });
});
