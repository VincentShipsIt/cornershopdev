import "server-only";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { resolveSessionBinding } from "@/lib/auth-session-binding";
import {
  betterAuthAllowedHosts,
  betterAuthTrustedOrigins,
  resolveBetterAuthSecret,
} from "@/lib/better-auth-config";
import { checkoutAuthPlugin } from "@/lib/checkout-auth-plugin";
import { getDb } from "@/lib/db";
import { deliverMagicLink } from "@/lib/magic-link-delivery";
import {
  hashAuthToken,
  MAGIC_LINK_TTL_MS,
  SESSION_COOKIE,
} from "@/lib/session";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";

const sessionLifetimeSeconds = 30 * 24 * 60 * 60;
const configuredAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "Cornershopdev",
  secret: resolveBetterAuthSecret(),
  baseURL: {
    allowedHosts: betterAuthAllowedHosts(),
    fallback: configuredAppUrl,
    protocol: "auto",
  },
  trustedOrigins: betterAuthTrustedOrigins(),
  database: prismaAdapter(getDb(), {
    provider: "postgresql",
    transaction: true,
  }),
  user: {
    additionalFields: {
      platformRole: {
        type: ["USER", "SUPERADMIN"],
        required: true,
        defaultValue: "USER",
        input: false,
      },
    },
  },
  session: {
    expiresIn: sessionLifetimeSeconds,
    updateAge: 24 * 60 * 60,
    additionalFields: {
      purpose: {
        type: ["ADMIN", "WORKSPACE_SELECTION", "SITE"],
        required: true,
        defaultValue: "WORKSPACE_SELECTION",
        input: false,
      },
      organizationId: {
        type: "string",
        required: false,
        input: false,
      },
      siteId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (data) => {
          const user = await getDb().user.findUnique({
            where: { id: data.userId },
            select: {
              email: true,
              platformRole: true,
              memberships: {
                select: {
                  organization: {
                    select: {
                      sites: {
                        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                        select: { id: true, organizationId: true },
                      },
                    },
                  },
                },
              },
            },
          });
          if (!user) throw new Error("Authentication account is unavailable.");

          const workspaces = user.memberships.flatMap(
            (membership) => membership.organization.sites,
          );
          const requested = data as typeof data & {
            purpose?: unknown;
            organizationId?: unknown;
            siteId?: unknown;
          };
          const requestedSite =
            requested.purpose === "SITE" &&
            typeof requested.organizationId === "string" &&
            typeof requested.siteId === "string"
              ? workspaces.find(
                  (site) =>
                    site.id === requested.siteId &&
                    site.organizationId === requested.organizationId,
                )
              : null;
          const binding = requestedSite
            ? {
                purpose: "SITE" as const,
                organizationId: requestedSite.organizationId,
                siteId: requestedSite.id,
              }
            : resolveSessionBinding({
                operator:
                  user.platformRole === "SUPERADMIN" &&
                  isConfiguredSuperadminEmail(user.email),
                workspaces,
              });
          if (!binding) {
            throw new Error("Workspace access is no longer available.");
          }
          return { data: { ...data, ...binding } };
        },
        after: async (session) => {
          const record = session as typeof session & {
            purpose?: string;
            organizationId?: string | null;
            siteId?: string | null;
          };
          await getDb().authEvent.create({
            data: {
              type: "auth.session.created",
              actor: "better-auth",
              subjectUserId: session.userId,
              sessionId: session.id,
              siteId: record.siteId ?? null,
              metadata: {
                provider: "better-auth",
                purpose: record.purpose ?? "WORKSPACE_SELECTION",
                organizationId: record.organizationId ?? null,
                expiresAt: session.expiresAt.toISOString(),
              },
            },
          });
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_TTL_MS / 1_000,
      disableSignUp: true,
      storeToken: {
        type: "custom-hasher",
        hash: async (token) => hashAuthToken(token),
      },
      sendMagicLink: deliverMagicLink,
    }),
    checkoutAuthPlugin(),
  ],
  advanced: {
    trustedProxyHeaders: true,
    cookiePrefix: "cornershopdev",
    cookies: {
      session_token: {
        name: SESSION_COOKIE,
        attributes: {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
        },
      },
    },
  },
  telemetry: { enabled: false },
});
