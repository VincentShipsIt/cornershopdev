import { createHash, randomBytes } from "node:crypto";
import { domainToASCII } from "node:url";
import { normalizeAccountEmail } from "@/lib/account-email";
import { buildClaimInvitationEmail } from "@/lib/claim-invitation-email";
import { getDb } from "@/lib/db";
import { getResend } from "@/lib/resend";
import { isClaimable } from "@/lib/site-claim";
import type { VerticalId } from "@/lib/verticals/types";

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
  now?: Date;
}): Promise<IssuedClaimInvitation> {
  const email = normalizeAccountEmail(input.email);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + CLAIM_INVITATION_TTL_MS);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashClaimInvitationToken(token);
  const db = getDb();

  let issued:
    | {
        id: string;
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
            },
          });
          if (!site || !isClaimable(site)) throw notClaimable();
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
          // bearer token can authorize this site at a time. A checkout-bound
          // invitation is never silently revoked: the checkout route owns its
          // Stripe session lifecycle.
          await tx.claimInvitation.updateMany({
            where: {
              siteId: site.id,
              acceptedAt: null,
              revokedAt: null,
              OR: [
                { checkoutSessionId: null },
                // Checkout sessions are explicitly capped at the invitation
                // expiry, so an expired binding is safe to retire.
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
              proofMethod: input.proofMethod,
              expiresAt,
            },
            select: { id: true },
          });
          await tx.auditEvent.create({
            data: {
              type: "claim.invitation.created",
              actor: input.actor,
              metadata: {
                invitationId: invitation.id,
                proofMethod: input.proofMethod,
                expiresAt: expiresAt.toISOString(),
              },
              siteId: site.id,
            },
          });

          return {
            id: invitation.id,
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

  return { ...issued, token, email, expiresAt };
}

export type CheckoutClaimInvitation = {
  id: string;
  email: string;
  siteId: string;
  siteSlug: string;
  checkoutSessionId: string | null;
  expiresAt: Date;
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
    };
  });
}

/**
 * Stores the Stripe session ID after the network call. Rebinding is a
 * compare-and-swap: only the session observed before the Stripe call can be
 * replaced, while a concurrent request that created the same idempotent Stripe
 * session remains safe.
 */
export async function bindClaimInvitationToCheckout(input: {
  invitation: CheckoutClaimInvitation;
  stripeCheckoutSessionId: string;
  expectedCheckoutSessionId: string | null;
  now?: Date;
}): Promise<string> {
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
        OR: [
          { checkoutSessionId: input.expectedCheckoutSessionId },
          { checkoutSessionId: input.stripeCheckoutSessionId },
        ],
      },
      data: { checkoutSessionId: input.stripeCheckoutSessionId },
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
        return current.checkoutSessionId;
      }
      throw new ClaimFlowError(
        "invitation_used",
        409,
        "Another checkout replaced this one. Reopen the ownership email and try again.",
      );
    }
    await tx.auditEvent.create({
      data: {
        type: "claim.checkout.started",
        actor: "claimant:invitation",
        metadata: { invitationId: input.invitation.id },
        siteId: input.invitation.siteId,
      },
    });
    return input.stripeCheckoutSessionId;
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
