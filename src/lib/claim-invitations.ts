import { createHash, createHmac, randomBytes } from "node:crypto";
import { domainToASCII } from "node:url";
import { normalizeAccountEmail } from "@/lib/account-email";
import { buildClaimInvitationEmail } from "@/lib/claim-invitation-email";
import { getDb } from "@/lib/db";
import { publicSiteOrigin } from "@/lib/domain-routing";
import { getResend } from "@/lib/resend";
import { isClaimable } from "@/lib/site-claim";
import { isOutreachMessageRetryable } from "@/lib/outreach-delivery-policy";
import {
  lockOutreachDelivery,
  lockOutreachDispatchById,
  lockOutreachMessageByKey,
  lockOutreachSite,
} from "@/lib/outreach-lock";
import { isOperatorReviewCurrent } from "@/lib/operator-lead-status";
import type { VerticalId } from "@/lib/verticals/types";
import { isVerticalOutreachConfigured } from "@/lib/lead-generation/registry";
import {
  GLOBAL_OUTREACH_PAUSE_KEY,
  isOutreachPaused,
  siteOutreachPauseKey,
} from "@/lib/outreach-pause";

export const CLAIM_INVITATION_TTL_MS = 48 * 60 * 60_000;
export const MIN_CLAIM_CHECKOUT_TTL_MS = 31 * 60_000;
const retryableInvitationCodes = new Set(["P2002", "P2034"]);

export type ClaimProofMethodValue =
  | "DOMAIN_EMAIL"
  | "OPERATOR_APPROVAL";

export type ClaimFlowErrorCode =
  | "checkout_in_progress"
  | "invalid_invitation"
  | "invalid_ownership_proof"
  | "invitation_used"
  | "not_claimable";

export class ClaimFlowError extends Error {
  constructor(
    public readonly code: ClaimFlowErrorCode,
    public readonly status: 403 | 409,
    message: string,
  ) {
    super(message);
    this.name = "ClaimFlowError";
  }
}

type ClaimSite = {
  id: string;
  slug: string;
  name: string;
  vertical: VerticalId;
  sourceUrl: string | null;
  email: string | null;
  status: "PROSPECT" | "PREVIEW_READY" | "CLAIMED" | "LIVE" | "PAUSED";
  organizationId: string | null;
};

export function hashClaimInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function claimInvitationTokenForOutreach(
  outreachKey: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const secret = environment.CLAIM_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CLAIM_TOKEN_SECRET is not configured for outreach");
  }
  return createHmac("sha256", secret)
    .update(`restofront-outreach-claim:${outreachKey}`, "utf8")
    .digest("base64url");
}

export function buildClaimCheckoutIdempotencyKey(input: {
  invitationId: string;
  plan: "starter" | "growth";
  previousSessionId: string | null;
  expiresAt: number;
}): string {
  return [
    "claim",
    input.invitationId,
    input.plan,
    input.previousSessionId ?? "initial",
    input.expiresAt,
  ].join("-");
}

/**
 * Intentionally conservative. A mailbox proves self-serve ownership only when
 * it is the exact imported business email or lives on the exact source website
 * hostname after removing a leading `www.`. We do not guess registrable domains
 * (`co.uk`, hosted subdomains, etc.); ambiguous prospects use operator approval.
 */
export function hasDomainEmailOwnershipProof(
  site: Pick<ClaimSite, "sourceUrl" | "email">,
  candidateEmail: string,
): boolean {
  const email = normalizeAccountEmail(candidateEmail);
  if (site.email) {
    try {
      if (normalizeAccountEmail(site.email) === email) return true;
    } catch {
      // Imported contact data can be malformed; it must never widen proof.
    }
  }

  if (!site.sourceUrl) return false;
  try {
    const sourceDomain = normalizeDomain(
      new URL(site.sourceUrl).hostname,
      true,
    );
    const emailDomain = normalizeDomain(email.slice(email.lastIndexOf("@") + 1));
    return sourceDomain.length > 0 && sourceDomain === emailDomain;
  } catch {
    return false;
  }
}

function normalizeDomain(value: string, stripLeadingWww = false): string {
  const ascii = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ""));
  return stripLeadingWww ? ascii.replace(/^www\./, "") : ascii;
}

export type IssuedClaimInvitation = {
  id: string;
  token: string;
  email: string;
  expiresAt: Date;
  site: {
    id: string;
    slug: string;
    name: string;
    vertical: VerticalId;
  };
};

export async function issueClaimInvitation(input: {
  siteSlug: string;
  email: string;
  proofMethod: ClaimProofMethodValue;
  actor: string;
  auditType?: "claim.invitation.created" | "claim.invitation.resent";
  replacesInvitationId?: string;
  outreachKey?: string;
  outreachDispatch?: {
    id: string;
    attempt: number;
    recipient: string;
    reviewedAt: string;
    stage: "preview_ready" | "follow_up_1";
  };
  now?: Date;
}): Promise<IssuedClaimInvitation> {
  const email = normalizeAccountEmail(input.email);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + CLAIM_INVITATION_TTL_MS);
  const token = input.outreachKey
    ? claimInvitationTokenForOutreach(input.outreachKey)
    : randomBytes(32).toString("base64url");
  const tokenHash = hashClaimInvitationToken(token);
  const db = getDb();

  let issued:
    | {
      id: string;
      expiresAt: Date;
      site: {
          id: string;
          slug: string;
          name: string;
          vertical: VerticalId;
        };
      }
    | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      issued = await db.$transaction(
        async (tx) => {
          let authorizedDispatch: { siteId: string } | null = null;
          if (input.outreachDispatch) {
            await lockOutreachDelivery(tx);
            await lockOutreachDispatchById(tx, input.outreachDispatch.id);
            const dispatch = await tx.outreachDispatch.findUnique({
              where: { id: input.outreachDispatch.id },
              select: {
                siteId: true,
                recipient: true,
                reviewedAt: true,
                status: true,
                attempt: true,
              },
            });
            const expectedStatus =
              input.outreachDispatch.stage === "preview_ready"
                ? "QUEUED"
                : "SENT";
            if (
              !dispatch ||
              normalizeAccountEmail(dispatch.recipient) !== email ||
              dispatch.reviewedAt.toISOString() !==
                input.outreachDispatch.reviewedAt ||
              dispatch.status !== expectedStatus ||
              dispatch.attempt !== input.outreachDispatch.attempt
            ) {
              throw new Error("Outreach dispatch authorization expired");
            }
            authorizedDispatch = dispatch;
            await lockOutreachSite(tx, dispatch.siteId);
          }
          const site = await tx.site.findUnique({
            where: { slug: input.siteSlug },
            select: {
              id: true,
              slug: true,
              name: true,
              vertical: true,
              sourceUrl: true,
              email: true,
              status: true,
              organizationId: true,
              updatedAt: true,
              auditEvents: {
                where: { type: "site.review.completed" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
              },
            },
          });
          if (!site || !isClaimable(site)) throw notClaimable();
          if (authorizedDispatch && authorizedDispatch.siteId !== site.id) {
            throw new Error("Outreach dispatch site mismatch");
          }
          if (input.outreachDispatch) {
            const pauseSettings = await tx.operatorSetting.findMany({
              where: {
                key: {
                  in: [
                    GLOBAL_OUTREACH_PAUSE_KEY,
                    siteOutreachPauseKey(site.id),
                  ],
                },
              },
              select: { key: true, value: true },
            });
            const latestReview = site.auditEvents[0]?.createdAt ?? null;
            if (
              isOutreachPaused(pauseSettings, site.id) ||
              !isVerticalOutreachConfigured(site.vertical) ||
              !site.email ||
              normalizeAccountEmail(site.email) !== email ||
              latestReview?.toISOString() !==
                input.outreachDispatch.reviewedAt ||
              !isOperatorReviewCurrent(latestReview, site.updatedAt)
            ) {
              throw new Error("Outreach lead changed before invitation issuance");
            }
          }
          if (
            input.proofMethod === "DOMAIN_EMAIL" &&
            !hasDomainEmailOwnershipProof(site, email)
          ) {
            throw new ClaimFlowError(
              "invalid_ownership_proof",
              403,
              "Use the business email shown on the source website, or ask for concierge approval.",
            );
          }
          if (input.outreachKey) {
            const existing = await tx.claimInvitation.findUnique({
              where: { outreachKey: input.outreachKey },
              select: {
                id: true,
                siteId: true,
                email: true,
                tokenHash: true,
                proofMethod: true,
                expiresAt: true,
                verifiedAt: true,
                acceptedAt: true,
                revokedAt: true,
                checkoutSessionId: true,
              },
            });
            if (existing) {
              if (
                existing.siteId !== site.id ||
                existing.tokenHash !== tokenHash ||
                existing.proofMethod !== input.proofMethod
              ) {
                throw new Error("Outreach invitation identity mismatch");
              }
              if (
                existing.acceptedAt ||
                existing.revokedAt ||
                existing.expiresAt <= now
              ) {
                throw new Error("Outreach invitation is no longer active");
              }
              if (existing.email !== email) {
                const dispatch = input.outreachDispatch;
                const messageKey = `lead-outreach:${site.id}:preview_ready`;
                if (
                  !dispatch ||
                  dispatch.stage !== "preview_ready" ||
                  dispatch.attempt <= 1 ||
                  existing.verifiedAt ||
                  existing.checkoutSessionId
                ) {
                  throw new Error("Outreach invitation identity mismatch");
                }
                await lockOutreachMessageByKey(tx, messageKey);
                const failedMessage = await tx.outreachMessage.findUnique({
                  where: { idempotencyKey: messageKey },
                  select: {
                    status: true,
                    providerEventAt: true,
                    createdAt: true,
                  },
                });
                if (
                  !failedMessage ||
                  !isOutreachMessageRetryable(failedMessage, now)
                ) {
                  throw new Error("Outreach invitation identity mismatch");
                }
                await tx.claimInvitation.update({
                  where: { id: existing.id },
                  data: { email },
                });
                await tx.auditEvent.create({
                  data: {
                    type: "claim.invitation.retargeted",
                    actor: input.actor,
                    metadata: {
                      invitationId: existing.id,
                      dispatchId: dispatch.id,
                      attempt: dispatch.attempt,
                    },
                    siteId: site.id,
                  },
                });
              }
              return {
                id: existing.id,
                expiresAt: existing.expiresAt,
                site: {
                  id: site.id,
                  slug: site.slug,
                  name: site.name,
                  vertical: site.vertical,
                },
              };
            }
          }
          const checkoutInProgress = await tx.claimInvitation.findFirst({
            where: {
              siteId: site.id,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
              checkoutSessionId: { not: null },
            },
            select: { id: true },
          });
          if (checkoutInProgress) {
            throw new ClaimFlowError(
              "checkout_in_progress",
              409,
              "Checkout already started. Reopen the ownership email to continue or change plans.",
            );
          }

          // Revoke every earlier unaccepted path, not only invitations for the
          // same email. Combined with the partial unique index, exactly one
          // bearer token can authorize this site at a time.
          await tx.claimInvitation.updateMany({
            where: {
              siteId: site.id,
              acceptedAt: null,
              revokedAt: null,
              OR: [
                { checkoutSessionId: null },
                // Stripe Checkout is explicitly capped at this invitation's
                // expiry, so an expired binding cannot still collect payment.
                { expiresAt: { lte: now } },
              ],
            },
            data: { revokedAt: now },
          });
          const invitation = await tx.claimInvitation.create({
            data: {
              siteId: site.id,
              email,
              tokenHash,
              outreachKey: input.outreachKey,
              proofMethod: input.proofMethod,
              expiresAt,
            },
            select: { id: true },
          });
          await tx.auditEvent.create({
            data: {
              type: input.auditType ?? "claim.invitation.created",
              actor: input.actor,
              metadata: {
                invitationId: invitation.id,
                replacesInvitationId: input.replacesInvitationId ?? null,
                proofMethod: input.proofMethod,
                expiresAt: expiresAt.toISOString(),
              },
              siteId: site.id,
            },
          });

          return {
            id: invitation.id,
            expiresAt,
            site: {
              id: site.id,
              slug: site.slug,
              name: site.name,
              vertical: site.vertical,
            },
          };
        },
        { isolationLevel: "Serializable" },
      );
      break;
    } catch (error) {
      if (attempt < 2 && isRetryableInvitationError(error)) continue;
      throw error;
    }
  }
  if (!issued) throw new Error("Claim invitation could not be issued");

  return { ...issued, token, email };
}

export async function resendClaimInvitation(input: {
  siteSlug: string;
  invitationId: string;
  actor: string;
}): Promise<IssuedClaimInvitation> {
  const invitation = await getDb().claimInvitation.findFirst({
    where: {
      id: input.invitationId,
      site: { slug: input.siteSlug },
      acceptedAt: null,
    },
    select: { id: true, email: true },
  });
  if (!invitation) throw invalidInvitation();

  return issueClaimInvitation({
    siteSlug: input.siteSlug,
    email: invitation.email,
    proofMethod: "OPERATOR_APPROVAL",
    actor: input.actor,
    auditType: "claim.invitation.resent",
    replacesInvitationId: invitation.id,
  });
}

export async function revokeClaimInvitation(input: {
  siteSlug: string;
  invitationId: string;
  actor: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  return getDb().$transaction(async (tx) => {
    const invitation = await tx.claimInvitation.findFirst({
      where: {
        id: input.invitationId,
        site: { slug: input.siteSlug },
      },
      select: { id: true, siteId: true, acceptedAt: true, revokedAt: true },
    });
    if (!invitation) throw invalidInvitation();
    if (invitation.acceptedAt || invitation.revokedAt) return false;

    const revoked = await tx.claimInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) return false;
    await tx.auditEvent.create({
      data: {
        type: "claim.invitation.revoked",
        actor: input.actor,
        metadata: { invitationId: invitation.id },
        siteId: invitation.siteId,
      },
    });
    return true;
  });
}

export type CheckoutClaimInvitation = {
  id: string;
  email: string;
  siteId: string;
  siteSlug: string;
  checkoutSessionId: string | null;
  expiresAt: Date;
  stripePriceId: string | null;
  checkoutAttempt: number;
};

/**
 * Validates the bearer token immediately before Stripe Checkout. Verification
 * and its audit row are atomic; repeated reads stay idempotent and do not flood
 * the audit trail.
 */
export async function authorizeClaimInvitationForCheckout(input: {
  siteSlug: string;
  token: string;
  now?: Date;
}): Promise<CheckoutClaimInvitation> {
  const now = input.now ?? new Date();
  const tokenHash = hashClaimInvitationToken(input.token);

  return getDb().$transaction(async (tx) => {
    const invitation = await tx.claimInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        verifiedAt: true,
        acceptedAt: true,
        revokedAt: true,
        checkoutSessionId: true,
        stripePriceId: true,
        checkoutAttempt: true,
        siteId: true,
        site: {
          select: {
            slug: true,
            status: true,
            organizationId: true,
          },
        },
      },
    });
    if (!invitation || invitation.site.slug !== input.siteSlug) {
      throw invalidInvitation();
    }
    if (!isClaimable(invitation.site)) throw notClaimable();
    if (invitation.acceptedAt) {
      throw new ClaimFlowError(
        "invitation_used",
        409,
        "This invitation has already been accepted.",
      );
    }
    if (invitation.revokedAt || invitation.expiresAt <= now) {
      throw invalidInvitation();
    }
    if (
      !invitation.checkoutSessionId &&
      invitation.expiresAt.getTime() - now.getTime() <
        MIN_CLAIM_CHECKOUT_TTL_MS
    ) {
      throw invalidInvitation();
    }

    if (!invitation.verifiedAt) {
      const verified = await tx.claimInvitation.updateMany({
        where: {
          id: invitation.id,
          verifiedAt: null,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { verifiedAt: now },
      });
      if (verified.count !== 1) throw invalidInvitation();
      await tx.auditEvent.create({
        data: {
          type: "claim.invitation.verified",
          actor: "claimant:invitation",
          metadata: { invitationId: invitation.id },
          siteId: invitation.siteId,
        },
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      siteId: invitation.siteId,
      siteSlug: invitation.site.slug,
      checkoutSessionId: invitation.checkoutSessionId,
      expiresAt: invitation.expiresAt,
      stripePriceId: invitation.stripePriceId,
      checkoutAttempt: invitation.checkoutAttempt,
    };
  });
}

/**
 * Compare-and-swaps a Checkout attempt and its short-lived browser-return
 * credential. A stale request cannot overwrite a newer attempt.
 */
export async function bindClaimInvitationToCheckout(input: {
  invitation: CheckoutClaimInvitation;
  stripeCheckoutSessionId: string;
  stripePriceId: string;
  checkoutAttempt: number;
  checkoutReturnTokenHash: string;
  checkoutReturnExpiresAt: Date;
  now?: Date;
}): Promise<{
  checkoutSessionId: string;
  didBind: boolean;
}> {
  const now = input.now ?? new Date();
  return getDb().$transaction(async (tx) => {
    const bound = await tx.claimInvitation.updateMany({
      where: {
        id: input.invitation.id,
        siteId: input.invitation.siteId,
        email: input.invitation.email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        checkoutSessionId: input.invitation.checkoutSessionId,
        checkoutAttempt: input.invitation.checkoutAttempt,
      },
      data: {
        checkoutSessionId: input.stripeCheckoutSessionId,
        stripePriceId: input.stripePriceId,
        checkoutAttempt: input.checkoutAttempt,
        checkoutReturnTokenHash: input.checkoutReturnTokenHash,
        checkoutReturnExpiresAt: input.checkoutReturnExpiresAt,
      },
    });
    if (bound.count !== 1) {
      const current = await tx.claimInvitation.findUnique({
        where: { id: input.invitation.id },
        select: {
          acceptedAt: true,
          revokedAt: true,
          expiresAt: true,
          checkoutSessionId: true,
        },
      });
      if (
        current &&
        !current.acceptedAt &&
        !current.revokedAt &&
        current.expiresAt > now &&
        current.checkoutSessionId
      ) {
        return {
          checkoutSessionId: current.checkoutSessionId,
          didBind: false,
        };
      }
      throw new ClaimFlowError(
        "invitation_used",
        409,
        "Another checkout replaced this one. Reopen the ownership email and try again.",
      );
    }
    if (input.checkoutAttempt > input.invitation.checkoutAttempt) {
      await tx.auditEvent.create({
        data: {
          type: "claim.checkout.started",
          actor: "claimant:invitation",
          metadata: {
            invitationId: input.invitation.id,
            attempt: input.checkoutAttempt,
          },
          siteId: input.invitation.siteId,
        },
      });
    }
    return {
      checkoutSessionId: input.stripeCheckoutSessionId,
      didBind: true,
    };
  });
}

export async function deliverClaimInvitation(
  invitation: IssuedClaimInvitation,
  appOrigin: string,
): Promise<void> {
  const claimUrl = new URL(`/claim/${encodeURIComponent(invitation.site.slug)}`, appOrigin);
  // The fragment is never sent in HTTP requests or Referer headers. The claim
  // page reads it into memory and removes it immediately, preventing embedded
  // third-party imagery in the preview from learning the bearer token.
  claimUrl.hash = new URLSearchParams({
    claim_token: invitation.token,
  }).toString();
  const message = buildClaimInvitationEmail({
    claimUrl: claimUrl.toString(),
    siteName: invitation.site.name,
    vertical: invitation.site.vertical,
    expiresAt: invitation.expiresAt,
    siteUrl: publicSiteOrigin({
      slug: invitation.site.slug,
      vertical: invitation.site.vertical,
    }),
  });
  const { error } = await getResend().emails.send(
    {
      from: message.from,
      to: invitation.email,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
    },
    {
      headers: {
        "Idempotency-Key": `claim-invitation-${invitation.id}`,
      },
    },
  );
  if (error) throw new Error(error.message);
}

/**
 * Rejections are recorded outside any transaction that throws. Metadata never
 * includes the raw token or claimant email.
 */
export async function recordClaimRejection(input: {
  siteSlug: string;
  reason: string;
  actor: string;
  invitationId?: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const db = getDb();
    const site = await db.site.findUnique({
      where: { slug: input.siteSlug },
      select: { id: true },
    });
    if (!site) return;
    await db.auditEvent.create({
      data: {
        type: "claim.invitation.rejected",
        actor: input.actor,
        metadata: {
          reason: input.reason,
          invitationId: input.invitationId ?? null,
        },
        siteId: site.id,
      },
    });
  } catch (error) {
    console.error("[claim-invitation] rejection audit failed", {
      siteSlug: input.siteSlug,
      reason: input.reason,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function revokeUndeliveredInvitation(
  invitation: IssuedClaimInvitation,
): Promise<void> {
  const now = new Date();
  await getDb().$transaction(async (tx) => {
    await tx.claimInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.auditEvent.create({
      data: {
        type: "claim.invitation.rejected",
        actor: "system:email",
        metadata: {
          reason: "delivery_failed",
          invitationId: invitation.id,
        },
        siteId: invitation.site.id,
      },
    });
  });
}

function invalidInvitation(): ClaimFlowError {
  return new ClaimFlowError(
    "invalid_invitation",
    403,
    "This claim invitation is invalid or expired.",
  );
}

function notClaimable(): ClaimFlowError {
  return new ClaimFlowError(
    "not_claimable",
    409,
    "This site already has an owner or is not available to claim.",
  );
}

function isRetryableInvitationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    retryableInvitationCodes.has(error.code)
  );
}
