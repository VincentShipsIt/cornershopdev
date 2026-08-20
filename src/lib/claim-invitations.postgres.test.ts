import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const enabled = process.env.CLAIM_INVITATIONS_POSTGRES_TEST === "1";
if (enabled) mock.module("server-only", () => ({}));
const suffix = randomUUID();
const siteId = `claim-retry-site-${suffix}`;
const slug = `claim-retry-${suffix}`;
const email = `owner@claim-retry-${suffix}.example.test`;
const foodSiteId = `claim-food-private-site-${suffix}`;
const foodSlug = `claim-food-private-${suffix}`;
const outreachSiteId = `claim-outreach-site-${suffix}`;
const outreachSlug = `claim-outreach-${suffix}`;
const outreachEmail = `owner@claim-outreach-${suffix}.example.test`;
const outreachDispatchId = `claim-outreach-dispatch-${suffix}`;

let db: ReturnType<typeof import("@/lib/db").getDb>;
let claim: typeof import("@/lib/claim-invitations");

describe.skipIf(!enabled)("claim invitation PostgreSQL replacement CAS", () => {
  beforeAll(async () => {
    const database = await import("@/lib/db");
    claim = await import("@/lib/claim-invitations");
    db = database.getDb();
    await db.site.create({
      data: {
        id: siteId,
        slug,
        name: "Claim retry fixture",
        description: "A claim invitation retry concurrency fixture.",
        email,
        sourceUrl: `https://claim-retry-${suffix}.example.test/`,
        vertical: "RESTAURANT",
        status: "PREVIEW_READY",
      },
    });
    await db.site.create({
      data: {
        id: foodSiteId,
        slug: foodSlug,
        name: "Private food-retail claim fixture",
        description: "An unlaunched food-retail claim gate fixture.",
        email: `owner@${foodSlug}.example.test`,
        sourceUrl: `https://${foodSlug}.example.test/`,
        vertical: "FOOD_RETAIL",
        status: "PREVIEW_READY",
      },
    });
    await db.site.create({
      data: {
        id: outreachSiteId,
        slug: outreachSlug,
        name: "Outreach claim authorization fixture",
        description: "A delivery-time claim authorization fixture.",
        leadContactEmail: outreachEmail,
        sourceUrl: `https://${outreachSlug}.example.test/`,
        vertical: "RESTAURANT",
        status: "PREVIEW_READY",
        attributes: {
          leadEligibility: {
            state: "ELIGIBLE",
            evidence: {
              channel_basis: "VERIFIED_WRITTEN_CONSENT",
              recipient: outreachEmail,
              controller: "Corner Shop Labs Ltd",
              channel: "EMAIL",
              purpose: "CLAIM_INVITATION_AND_FOLLOW_UP",
              evidence_timestamp: "2026-08-20T09:00:00+02:00",
              evidence_source: "consent:claim-outreach-1234",
            },
            updatedAt: "2026-08-20T09:00:00+02:00",
            updatedBy: "operator:fixture",
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (db) {
      await db.site.deleteMany({
        where: { id: { in: [siteId, foodSiteId, outreachSiteId] } },
      });
    }
  });

  test("rejects FOOD_RETAIL invitation issuance before any claim can charge", async () => {
    await expect(
      claim.issueClaimInvitation({
        siteSlug: foodSlug,
        email: `owner@${foodSlug}.example.test`,
        proofMethod: "DOMAIN_EMAIL",
        actor: "claimant:self-serve",
      }),
    ).rejects.toMatchObject({ code: "not_claimable", status: 409 });
    expect(
      await db.claimInvitation.count({ where: { siteId: foodSiteId } }),
    ).toBe(0);
  });

  test("rechecks channel evidence before outreach claim issuance", async () => {
    const review = await db.$transaction(async (transaction) => {
      await transaction.site.update({
        where: { id: outreachSiteId },
        data: {
          attributes: {
            leadEligibility: {
              state: "ELIGIBLE",
              evidence: {
                contact_basis: "generic corporate",
                public_source: `https://${outreachSlug}.example.test/contact`,
              },
              updatedAt: new Date().toISOString(),
              updatedBy: "operator:fixture",
            },
          },
        },
      });
      const currentReview = await transaction.auditEvent.create({
        data: {
          siteId: outreachSiteId,
          type: "site.review.completed",
          actor: "operator:fixture",
        },
      });
      await transaction.outreachDispatch.create({
        data: {
          id: outreachDispatchId,
          idempotencyKey: `lead-outreach:${outreachSiteId}:preview_ready`,
          siteId: outreachSiteId,
          template: "preview_ready",
          recipient: outreachEmail,
          reviewedAt: currentReview.createdAt,
          requestedBy: "operator:fixture",
        },
      });
      return currentReview;
    });

    const previousSecret = process.env.CLAIM_TOKEN_SECRET;
    process.env.CLAIM_TOKEN_SECRET =
      "test-secret-that-is-at-least-32-characters";
    try {
      await expect(
        claim.issueClaimInvitation({
          siteSlug: outreachSlug,
          email: outreachEmail,
          proofMethod: "OPERATOR_APPROVAL",
          actor: "operator:fixture",
          outreachKey: `lead-outreach:${outreachSiteId}:preview_ready`,
          outreachDispatch: {
            id: outreachDispatchId,
            attempt: 1,
            recipient: outreachEmail,
            reviewedAt: review.createdAt.toISOString(),
            stage: "preview_ready",
          },
        }),
      ).rejects.toThrow("Outreach lead changed before invitation issuance");
    } finally {
      if (previousSecret === undefined) delete process.env.CLAIM_TOKEN_SECRET;
      else process.env.CLAIM_TOKEN_SECRET = previousSecret;
    }

    expect(
      await db.claimInvitation.count({ where: { siteId: outreachSiteId } }),
    ).toBe(0);
  });

  test("allows one concurrent successor and never revokes it from a stale retry", async () => {
    const original = await claim.issueClaimInvitation({
      siteSlug: slug,
      email,
      proofMethod: "DOMAIN_EMAIL",
      actor: "claimant:self-serve",
    });
    await db.claimInvitation.update({
      where: { id: original.id },
      data: {
        deliveryStatus: "FAILED",
        deliveryFailureCode: "provider_error",
        revokedAt: new Date(),
      },
    });

    const attempts = await Promise.allSettled([
      claim.resendClaimInvitation({
        siteSlug: slug,
        invitationId: original.id,
        actor: "operator:first",
      }),
      claim.resendClaimInvitation({
        siteSlug: slug,
        invitationId: original.id,
        actor: "operator:second",
      }),
    ]);
    const fulfilled = attempts.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof claim.resendClaimInvitation>>
      > => result.status === "fulfilled",
    );
    const rejected = attempts.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(claim.ClaimFlowError);
    expect((rejected[0]?.reason as { status: number }).status).toBe(409);

    const successor = fulfilled[0]!.value;
    const send = mock(async () => ({
      data: { id: `resend-${successor.id}` },
      error: null,
      headers: null,
    }));
    await claim.deliverClaimInvitation(successor, "http://127.0.0.1:3000", {
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);

    await expect(
      claim.resendClaimInvitation({
        siteSlug: slug,
        invitationId: original.id,
        actor: "operator:stale",
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(
      await db.claimInvitation.findMany({
        where: { siteId },
        orderBy: [{ retryCount: "asc" }, { id: "asc" }],
        select: {
          id: true,
          retryCount: true,
          replacesInvitationId: true,
          deliveryStatus: true,
          revokedAt: true,
        },
      }),
    ).toEqual([
      expect.objectContaining({
        id: original.id,
        retryCount: 0,
        replacesInvitationId: null,
        deliveryStatus: "FAILED",
      }),
      expect.objectContaining({
        id: successor.id,
        retryCount: 1,
        replacesInvitationId: original.id,
        deliveryStatus: "SENT",
        revokedAt: null,
      }),
    ]);
    expect(
      await db.claimInvitation.count({
        where: { siteId, acceptedAt: null, revokedAt: null },
      }),
    ).toBe(1);
  });
});
