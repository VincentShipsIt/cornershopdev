import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import {
  CHECKOUT_RETURN_COOKIE,
  verifyHashedToken,
} from "@/lib/claim-security";
import { getDb } from "@/lib/db";
import { secureCookieRequired } from "@/lib/first-customer-test-mode";
import { ownerMembershipWhere } from "@/lib/owner-membership";

const checkoutBootstrapSchema = z.object({
  sessionId: z.string().startsWith("cs_").max(256),
  claimInvitationId: z.string().min(1).max(128),
  poll: z.boolean(),
});

export function checkoutAuthPlugin(): BetterAuthPlugin {
  return {
    id: "cornershop-checkout-auth",
    endpoints: {
      bootstrapCheckoutSession: createAuthEndpoint(
        "/checkout/bootstrap",
        {
          method: "POST",
          requireHeaders: true,
          body: checkoutBootstrapSchema,
        },
        async (ctx) => {
          const returnToken = ctx.getCookie(CHECKOUT_RETURN_COOKIE);
          const invitation = await getDb().claimInvitation.findUnique({
            where: { id: ctx.body.claimInvitationId },
            select: {
              email: true,
              acceptedAt: true,
              checkoutSessionId: true,
              checkoutReturnTokenHash: true,
              checkoutReturnExpiresAt: true,
              site: {
                select: {
                  id: true,
                  organizationId: true,
                  subscription: { select: { id: true } },
                  organization: {
                    select: {
                      memberships: {
                        where: ownerMembershipWhere(),
                        select: {
                          userId: true,
                          user: { select: { email: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          const membership = invitation?.site.organization?.memberships.find(
            (row) =>
              normalizeAccountEmail(row.user.email) ===
              normalizeAccountEmail(invitation.email),
          );
          if (
            !returnToken ||
            !invitation?.checkoutReturnTokenHash ||
            !invitation.checkoutReturnExpiresAt ||
            invitation.checkoutReturnExpiresAt <= new Date() ||
            invitation.checkoutSessionId !== ctx.body.sessionId ||
            !verifyHashedToken(
              returnToken,
              invitation.checkoutReturnTokenHash,
            ) ||
            !invitation.acceptedAt ||
            !invitation.site.subscription ||
            !invitation.site.organizationId ||
            !membership
          ) {
            throw new APIError("FORBIDDEN", {
              message: "Invalid checkout return",
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            membership.userId,
            false,
            {
              purpose: "SITE",
              organizationId: invitation.site.organizationId,
              siteId: invitation.site.id,
            },
          );
          const user = await ctx.context.internalAdapter
            .updateUser(membership.userId, { emailVerified: true })
            .catch(async (error) => {
              await ctx.context.internalAdapter
                .deleteSession(session.token)
                .catch(() => undefined);
              throw error;
            });
          const consumed = await getDb().claimInvitation
            .updateMany({
              where: {
                id: ctx.body.claimInvitationId,
                checkoutSessionId: ctx.body.sessionId,
                checkoutReturnTokenHash: invitation.checkoutReturnTokenHash,
              },
              data: {
                checkoutReturnTokenHash: null,
                checkoutReturnExpiresAt: null,
              },
            })
            .catch(async (error) => {
              await ctx.context.internalAdapter
                .deleteSession(session.token)
                .catch(() => undefined);
              throw error;
            });
          if (consumed.count !== 1) {
            await ctx.context.internalAdapter
              .deleteSession(session.token)
              .catch(() => undefined);
            throw new APIError("FORBIDDEN", {
              message: "Checkout return already used",
            });
          }

          await setSessionCookie(ctx, { session, user });
          ctx.setCookie(CHECKOUT_RETURN_COOKIE, "", {
            httpOnly: true,
            secure: secureCookieRequired(),
            sameSite: "lax",
            maxAge: 0,
            path: "/",
          });

          const url = "/dashboard?checkout=success";
          return ctx.json({ ready: true, url });
        },
      ),
    },
  };
}
