import type { VerticalId } from "@/lib/verticals/types";

export type AccessFailure = {
  ok: false;
  status: 401 | 403 | 503;
  message: string;
};

export type SessionIdentity = {
  id: string;
  userId: string;
  purpose: "ADMIN" | "WORKSPACE_SELECTION" | "SITE";
  organizationId: string | null;
  siteSlug: string | null;
};

export type SiteAccessRecord = {
  id: string;
  slug: string;
  vertical: VerticalId;
  organizationId: string;
  user: {
    id: string;
    email: string;
  };
};

export type SiteAccess = {
  ok: true;
  session: {
    userId: string;
    siteSlug: string;
  };
  site: Omit<SiteAccessRecord, "user">;
  user: SiteAccessRecord["user"];
};

export type SuperadminAccess = {
  id: string;
  email: string;
};

export type AuthorizationAdapter = {
  isDatabaseConfigured: () => boolean;
  getSession: () => Promise<SessionIdentity | null>;
  findSiteForMember: (
    siteSlug: string,
    userId: string,
  ) => Promise<SiteAccessRecord | null>;
  findUser: (userId: string) => Promise<{
    id: string;
    email: string;
    platformRole: "USER" | "SUPERADMIN";
  } | null>;
  isSuperadminEmail: (email: string) => boolean;
};

export function createAuthorizationPolicy(adapter: AuthorizationAdapter) {
  return {
    async getSiteAccess(
      siteSlug: string,
    ): Promise<SiteAccess | AccessFailure> {
      const session = await adapter.getSession();
      if (!session) {
        return { ok: false, status: 401, message: "Unauthorized" };
      }
      if (
        session.purpose !== "SITE" ||
        !session.siteSlug ||
        session.siteSlug !== siteSlug
      ) {
        return { ok: false, status: 403, message: "Forbidden" };
      }
      if (!adapter.isDatabaseConfigured()) {
        return {
          ok: false,
          status: 503,
          message: "Account database is not configured",
        };
      }

      const record = await adapter.findSiteForMember(
        siteSlug,
        session.userId,
      );
      if (!record) {
        return { ok: false, status: 403, message: "Forbidden" };
      }
      if (record.organizationId !== session.organizationId) {
        return { ok: false, status: 403, message: "Forbidden" };
      }

      const { user, ...site } = record;
      return {
        ok: true,
        session: { userId: session.userId, siteSlug },
        site,
        user,
      };
    },

    async getSuperadminAccess(): Promise<SuperadminAccess | null> {
      const session = await adapter.getSession();
      if (!session || !adapter.isDatabaseConfigured()) return null;

      const user = await adapter.findUser(session.userId);
      if (
        !user ||
        user.platformRole !== "SUPERADMIN" ||
        !adapter.isSuperadminEmail(user.email)
      ) {
        return null;
      }
      return { id: user.id, email: user.email };
    },
  };
}
