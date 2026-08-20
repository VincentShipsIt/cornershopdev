import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

type ProviderOutcome = "success" | "failure";
const providerOutcomes: ProviderOutcome[] = [];
let providerSequence = 0;
const providerSend = mock(async () => {
  const outcome = providerOutcomes.shift() ?? "success";
  if (outcome === "failure") {
    return {
      data: null,
      error: { message: "provider rejected fixture delivery" },
    };
  }
  providerSequence += 1;
  return {
    data: { id: `resend-auth-${providerSequence}` },
    error: null,
  };
});

const enabled = process.env.AUTH_MAGIC_LINK_RETRY_POSTGRES_TEST === "1";
if (enabled) {
  mock.module("server-only", () => ({}));
  mock.module("@/lib/resend", () => ({
    getResend: () => ({ emails: { send: providerSend } }),
    emailSender: () => "Cornershopdev Test <test@example.test>",
    emailReplyTo: () => undefined,
  }));
}
const fixtureIds = {
  users: [] as string[],
  organizations: [] as string[],
  sites: [] as string[],
};

let db: ReturnType<typeof import("@/lib/db").getDb>;
let deliverMagicLink: typeof import("@/lib/magic-link-delivery").deliverMagicLink;
let recordResendAuthEvent: typeof import("@/lib/auth-delivery-event-recorder").recordResendAuthEvent;
let hashAuthToken: typeof import("@/lib/session").hashAuthToken;

describe.skipIf(!enabled)("magic-link PostgreSQL retry generations", () => {
  beforeAll(async () => {
    const database = await import("@/lib/db");
    const delivery = await import("@/lib/magic-link-delivery");
    const recorder = await import("@/lib/auth-delivery-event-recorder");
    const session = await import("@/lib/session");
    db = database.getDb();
    deliverMagicLink = delivery.deliverMagicLink;
    recordResendAuthEvent = recorder.recordResendAuthEvent;
    hashAuthToken = session.hashAuthToken;
  });

  beforeEach(() => {
    providerOutcomes.length = 0;
    providerSend.mockClear();
  });

  afterAll(async () => {
    if (!db) return;
    await db.site.deleteMany({ where: { id: { in: fixtureIds.sites } } });
    await db.organization.deleteMany({
      where: { id: { in: fixtureIds.organizations } },
    });
    await db.user.deleteMany({ where: { id: { in: fixtureIds.users } } });
  });

  test("retries a finalized failure while its credential remains revoked", async () => {
    const account = await createAccount("finalized");
    providerOutcomes.push("failure", "success");
    const failed = await issue(account, "failed-token", 0);

    expect(failed).toMatchObject({
      deliveryStatus: "FAILED",
      retryCount: 0,
    });
    expect(failed.revokedAt).toBeInstanceOf(Date);
    expect(
      await db.verification.count({
        where: { identifier: failed.tokenHash },
      }),
    ).toBe(0);

    const replacement = await issue(account, "replacement-token", 1, failed.id);
    expect(replacement).toMatchObject({
      deliveryStatus: "SENT",
      retryCount: 1,
      rotationGeneration: failed.rotationGeneration + 1,
      revokedAt: null,
    });
  });

  test("retries a signed bounced delivery and never restores its credential", async () => {
    const account = await createAccount("bounced");
    const bounced = await issue(account, "bounced-token", 0);
    expect(bounced.providerMessageId).toBeString();
    await recordResendAuthEvent({
      eventId: `event-${randomUUID()}`,
      eventType: "email.bounced",
      occurredAt: new Date(),
      providerMessageId: bounced.providerMessageId!,
      taggedAuthMagicLinkId: bounced.id,
    });
    const terminal = await db.authMagicLink.findUniqueOrThrow({
      where: { id: bounced.id },
    });
    expect(terminal).toMatchObject({ deliveryStatus: "BOUNCED" });
    expect(terminal.revokedAt).toBeInstanceOf(Date);
    expect(
      await db.verification.count({
        where: { identifier: terminal.tokenHash },
      }),
    ).toBe(0);

    const replacement = await issue(
      account,
      "bounce-replacement-token",
      1,
      bounced.id,
    );
    expect(replacement).toMatchObject({
      deliveryStatus: "SENT",
      retryCount: 1,
      revokedAt: null,
    });
  });

  test("does not replay an older failed generation after a successor exists", async () => {
    const account = await createAccount("stale");
    providerOutcomes.push("failure", "failure");
    const original = await issue(account, "stale-original-token", 0);
    const successor = await issue(
      account,
      "stale-successor-token",
      1,
      original.id,
    );
    const staleToken = "stale-replay-token";
    await createVerification(staleToken);

    await expect(
      deliverMagicLink({
        email: account.email,
        token: staleToken,
        url: "http://127.0.0.1:3000/api/auth/magic-link",
        metadata: {
          userId: account.userId,
          retryCount: 1,
          replacesId: original.id,
        },
      }),
    ).rejects.toThrow("already retried");
    expect(
      await db.verification.count({
        where: { identifier: hashAuthToken(staleToken) },
      }),
    ).toBe(0);
    expect(
      await db.user.findUniqueOrThrow({
        where: { id: account.userId },
        select: { authLinkSequence: true },
      }),
    ).toEqual({ authLinkSequence: successor.rotationGeneration });
  });

  test("serializes concurrent retries to exactly one successor", async () => {
    const account = await createAccount("concurrent");
    providerOutcomes.push("failure", "success");
    const failed = await issue(account, "concurrent-original-token", 0);
    const tokenA = "concurrent-retry-a";
    const tokenB = "concurrent-retry-b";
    await Promise.all([createVerification(tokenA), createVerification(tokenB)]);

    const attempts = await Promise.allSettled([
      deliverMagicLink({
        email: account.email,
        token: tokenA,
        url: "http://127.0.0.1:3000/api/auth/magic-link",
        metadata: {
          userId: account.userId,
          retryCount: 1,
          replacesId: failed.id,
        },
      }),
      deliverMagicLink({
        email: account.email,
        token: tokenB,
        url: "http://127.0.0.1:3000/api/auth/magic-link",
        metadata: {
          userId: account.userId,
          retryCount: 1,
          replacesId: failed.id,
        },
      }),
    ]);

    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(providerSend).toHaveBeenCalledTimes(2);
    expect(
      await db.authMagicLink.count({
        where: { userId: account.userId, rotationGeneration: 2 },
      }),
    ).toBe(1);
    expect(
      await db.authMagicLink.count({
        where: { userId: account.userId, revokedAt: null },
      }),
    ).toBe(1);
    expect(
      await db.verification.count({
        where: {
          identifier: { in: [hashAuthToken(tokenA), hashAuthToken(tokenB)] },
        },
      }),
    ).toBe(1);
  });
});

type AccountFixture = { userId: string; email: string };

async function createAccount(label: string): Promise<AccountFixture> {
  const suffix = randomUUID();
  const userId = `auth-retry-user-${label}-${suffix}`;
  const organizationId = `auth-retry-org-${label}-${suffix}`;
  const siteId = `auth-retry-site-${label}-${suffix}`;
  const email = `${userId}@example.test`;
  fixtureIds.users.push(userId);
  fixtureIds.organizations.push(organizationId);
  fixtureIds.sites.push(siteId);
  await db.user.create({
    data: {
      id: userId,
      email,
      name: "Auth retry owner",
      memberships: {
        create: {
          role: "owner",
          organization: {
            create: { id: organizationId, name: "Auth retry fixture" },
          },
        },
      },
    },
  });
  await db.site.create({
    data: {
      id: siteId,
      slug: `auth-retry-${label}-${suffix}`,
      name: "Auth retry fixture",
      vertical: "RESTAURANT",
      status: "CLAIMED",
      organizationId,
    },
  });
  return { userId, email };
}

async function createVerification(token: string): Promise<void> {
  await db.verification.create({
    data: {
      id: `verification-${randomUUID()}`,
      identifier: hashAuthToken(token),
      value: token,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

async function issue(
  account: AccountFixture,
  token: string,
  retryCount: number,
  replacesId?: string,
) {
  await createVerification(token);
  await deliverMagicLink({
    email: account.email,
    token,
    url: "http://127.0.0.1:3000/api/auth/magic-link",
    metadata: {
      userId: account.userId,
      retryCount,
      replacesId,
    },
  });
  return db.authMagicLink.findUniqueOrThrow({
    where: { tokenHash: hashAuthToken(token) },
  });
}
