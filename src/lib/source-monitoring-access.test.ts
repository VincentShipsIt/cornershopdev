import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

let mode: "owner" | "operator" | "denied" = "denied";
mock.module("@/lib/authorization", () => ({
  getSiteAccess: async (slug: string) =>
    mode === "owner"
      ? {
          ok: true,
          site: { id: "site_1", slug },
          user: { id: "user_1", email: "owner@example.com" },
        }
      : { ok: false, status: 403, message: "Forbidden" },
  getSuperadminAccess: async () =>
    mode === "operator"
      ? { id: "operator_1", email: "ops@example.com" }
      : null,
}));
mock.module("@/lib/db", () => ({
  getDb: () => ({
    site: {
      findUnique: async () => ({ id: "site_1", slug: "example" }),
    },
  }),
}));

const { getSourceMonitoringAccess } = await import(
  "@/lib/source-monitoring-access"
);

describe("source monitoring review authorization", () => {
  beforeEach(() => {
    mode = "denied";
  });

  it("allows the owning site member", async () => {
    mode = "owner";
    expect(await getSourceMonitoringAccess("example")).toMatchObject({
      ok: true,
      actor: { id: "user_1", role: "owner" },
      site: { id: "site_1" },
    });
  });

  it("allows a dual-gated platform operator", async () => {
    mode = "operator";
    expect(await getSourceMonitoringAccess("example")).toMatchObject({
      ok: true,
      actor: { id: "operator_1", role: "operator" },
      site: { id: "site_1" },
    });
  });

  it("rejects everyone else", async () => {
    expect(await getSourceMonitoringAccess("example")).toEqual({
      ok: false,
      status: 403,
      message: "Forbidden",
    });
  });
});
