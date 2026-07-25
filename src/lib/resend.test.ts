import { describe, expect, it } from "bun:test";
import { emailSender, platformReplyTo } from "@/lib/resend";

describe("emailSender", () => {
  it("sends as the configured identity", () => {
    expect(
      emailSender({ EMAIL_FROM: "Vincent <vincent@send.cornershop.dev>" }),
    ).toBe("Vincent <vincent@send.cornershop.dev>");
  });

  it("falls back to the shared domain when unset or blank", () => {
    // deploy.sh drops empty parameters, but a half-filled local `.env` would
    // otherwise hand Resend an empty `from` and fail every send.
    expect(emailSender({})).toBe("Cornershopdev <onboarding@resend.dev>");
    expect(emailSender({ EMAIL_FROM: "" })).toBe(
      "Cornershopdev <onboarding@resend.dev>",
    );
  });
});

describe("platformReplyTo", () => {
  it("points replies at a mailbox a human reads", () => {
    expect(platformReplyTo({ EMAIL_REPLY_TO: "vincent@cornershop.dev" })).toBe(
      "vincent@cornershop.dev",
    );
  });

  it("stays undefined when unset, leaving the header off", () => {
    expect(platformReplyTo({})).toBeUndefined();
    expect(platformReplyTo({ EMAIL_REPLY_TO: "" })).toBeUndefined();
  });
});
