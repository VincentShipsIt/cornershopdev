import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Vertical } from "@/generated/prisma/enums";

mock.module("server-only", () => ({}));

let accessedVertical: Vertical = Vertical.FOOD_RETAIL;
let billingCalls = 0;
let publishCalls = 0;
let rollbackCalls = 0;

mock.module("@/lib/authorization", () => ({
  getSiteAccess: async (slug: string) => ({
    ok: true,
    site: { id: "site_1", slug, vertical: accessedVertical },
    user: { id: "owner_1", email: "owner@example.test" },
  }),
  accessFailureResponse: () => new Response(null, { status: 403 }),
}));
mock.module("@/lib/billing-access", () => ({
  getSiteBillingAccess: async () => {
    billingCalls += 1;
    return { ok: true };
  },
  billingAccessFailureResponse: () => new Response(null, { status: 402 }),
}));
mock.module("@/lib/site-publication", () => ({
  publishSiteDraft: async () => {
    publishCalls += 1;
    return {
      id: "version_1",
      version: 1,
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
      theme: { id: "warm", version: "restaurant-renderer-v1" },
    };
  },
  rollbackPublishedSiteVersion: async () => {
    rollbackCalls += 1;
    return {
      id: "version_2",
      version: 2,
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
      theme: { id: "warm", version: "restaurant-renderer-v1" },
    };
  },
  SitePublicationCapabilityError: class SitePublicationCapabilityError extends Error {},
  SitePublicationStateError: class SitePublicationStateError extends Error {},
  SitePublicationTranslationError: class SitePublicationTranslationError extends Error {},
}));
mock.module("@/lib/operator-alerts", () => ({
  captureOperatorAlert: async () => undefined,
}));
mock.module("@/lib/request-origin", () => ({
  isSameOriginMutation: () => true,
}));

const { POST: publish } = await import(
  "@/app/api/sites/[slug]/publish/route"
);
const { POST: rollback } = await import(
  "@/app/api/sites/[slug]/rollback/route"
);

describe("site publication capability routes", () => {
  beforeEach(() => {
    accessedVertical = Vertical.FOOD_RETAIL;
    billingCalls = 0;
    publishCalls = 0;
    rollbackCalls = 0;
  });

  it("rejects food-retail publish and rollback before billing or service calls", async () => {
    const publishResponse = await publish(publishRequest(), routeContext());
    const rollbackResponse = await rollback(rollbackRequest(), routeContext());

    expect(publishResponse.status).toBe(409);
    expect(await publishResponse.json()).toEqual({
      error: "Publishing is not available for this vertical",
    });
    expect(rollbackResponse.status).toBe(409);
    expect(await rollbackResponse.json()).toEqual({
      error: "Publishing is not available for this vertical",
    });
    expect(billingCalls).toBe(0);
    expect(publishCalls).toBe(0);
    expect(rollbackCalls).toBe(0);
  });

  it("preserves the existing restaurant publish and rollback route flow", async () => {
    accessedVertical = Vertical.RESTAURANT;

    expect((await publish(publishRequest(), routeContext())).status).toBe(200);
    expect((await rollback(rollbackRequest(), routeContext())).status).toBe(200);
    expect(billingCalls).toBe(2);
    expect(publishCalls).toBe(1);
    expect(rollbackCalls).toBe(1);
  });
});

function routeContext() {
  return { params: Promise.resolve({ slug: "owner-site" }) };
}

function publishRequest() {
  return new Request("https://cornershop.dev/api/sites/owner-site/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changeSummary: "Reviewed owner update",
      expectedRevision: 3,
    }),
  });
}

function rollbackRequest() {
  return new Request("https://cornershop.dev/api/sites/owner-site/rollback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteVersionId: "version_1" }),
  });
}
