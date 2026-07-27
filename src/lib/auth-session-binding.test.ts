import { describe, expect, it } from "bun:test";
import {
  isSessionPurpose,
  resolveSessionBinding,
} from "@/lib/auth-session-binding";

describe("Better Auth session binding", () => {
  it("keeps operator sessions tenant-free", () => {
    expect(
      resolveSessionBinding({
        operator: true,
        workspaces: [{ id: "site_1", organizationId: "org_1" }],
      }),
    ).toEqual({
      purpose: "ADMIN",
      organizationId: null,
      siteId: null,
    });
  });

  it("binds a single-workspace customer session to that tenant", () => {
    expect(
      resolveSessionBinding({
        operator: false,
        workspaces: [{ id: "site_1", organizationId: "org_1" }],
      }),
    ).toEqual({
      purpose: "SITE",
      organizationId: "org_1",
      siteId: "site_1",
    });
  });

  it("leaves multi-workspace sessions unbound until selection", () => {
    expect(
      resolveSessionBinding({
        operator: false,
        workspaces: [
          { id: "site_1", organizationId: "org_1" },
          { id: "site_2", organizationId: "org_2" },
        ],
      }),
    ).toEqual({
      purpose: "WORKSPACE_SELECTION",
      organizationId: null,
      siteId: null,
    });
  });

  it("refuses customers without an owned workspace", () => {
    expect(
      resolveSessionBinding({
        operator: false,
        workspaces: [{ id: "site_1", organizationId: null }],
      }),
    ).toBeNull();
  });

  it("accepts only supported authorization purposes", () => {
    expect(isSessionPurpose("SITE")).toBe(true);
    expect(isSessionPurpose("OWNER")).toBe(false);
  });
});
