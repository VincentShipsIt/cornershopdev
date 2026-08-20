import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const enabled = process.env.CLAIM_INVITATIONS_POSTGRES_TEST === "1";
if (enabled) mock.module("server-only", () => ({}));
const suffix = randomUUID();
const siteId = `claim-retry-site-${suffix}`;
const slug = `claim-retry-${suffix}`;
const email = `owner@claim-retry-${suffix}.example.test`;

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
  });

  afterAll(async () => {
    if (db) await db.site.deleteMany({ where: { id: siteId } });
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
      > =>
        result.status === "fulfilled",
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
