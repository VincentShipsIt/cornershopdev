import { describe, expect, it } from "bun:test";
import { isOperatorLeadIngestAuthorized } from "@/lib/operator-lead-ingest-auth";

describe("operator lead ingest auth", () => {
  it("fails closed when the ingest token is missing", () => {
    const request = new Request("https://cornershop.dev/api/admin/leads/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer leftover-healthcheck" },
    });

    expect(
      isOperatorLeadIngestAuthorized(request, {
        ingestToken: "",
        healthcheckToken: "leftover-healthcheck",
      }),
    ).toBe(false);
    expect(
      isOperatorLeadIngestAuthorized(request, {
        ingestToken: undefined,
        healthcheckToken: "leftover-healthcheck",
      }),
    ).toBe(false);
  });

  it("does not accept HEALTHCHECK_TOKEN as the ingest credential", () => {
    const reused = "same-token-value-should-never-be-shared";
    const request = new Request("https://cornershop.dev/api/admin/leads/ingest", {
      method: "POST",
      headers: { Authorization: `Bearer ${reused}` },
    });

    expect(
      isOperatorLeadIngestAuthorized(request, {
        ingestToken: reused,
        healthcheckToken: reused,
      }),
    ).toBe(false);
  });

  it("accepts only the dedicated ingest bearer token", () => {
    const authorized = new Request(
      "https://cornershop.dev/api/admin/leads/ingest",
      {
        method: "POST",
        headers: { Authorization: "Bearer ingest-token" },
      },
    );
    const unauthorized = new Request(
      "https://cornershop.dev/api/admin/leads/ingest",
      {
        method: "POST",
        headers: { Authorization: "Bearer healthcheck-token" },
      },
    );

    expect(
      isOperatorLeadIngestAuthorized(authorized, {
        ingestToken: "ingest-token",
        healthcheckToken: "healthcheck-token",
      }),
    ).toBe(true);
    expect(
      isOperatorLeadIngestAuthorized(unauthorized, {
        ingestToken: "ingest-token",
        healthcheckToken: "healthcheck-token",
      }),
    ).toBe(false);
  });
});
