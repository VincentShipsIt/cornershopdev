import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

mock.module("server-only", () => ({}));

const enabled = process.env.SOURCE_MONITORING_POSTGRES_TEST === "1";
const siteId = `monitor-site-${randomUUID()}`;
const organizationId = `monitor-org-${randomUUID()}`;
const userId = `monitor-user-${randomUUID()}`;
const slug = `monitor-${randomUUID()}`;
const previousStarter = process.env.STRIPE_STARTER_PRICE_ID;
const previousGrowth = process.env.STRIPE_GROWTH_PRICE_ID;

let db: ReturnType<typeof import("@/lib/db").getDb>;
let dispatchDueSourceMonitoring: typeof import("@/lib/source-monitoring").dispatchDueSourceMonitoring;
let reviewSourceMonitoringSuggestion: typeof import("@/lib/source-monitoring").reviewSourceMonitoringSuggestion;
let SourceMonitoringConflictError: typeof import("@/lib/source-monitoring").SourceMonitoringConflictError;

describe.skipIf(!enabled)("source monitoring PostgreSQL persistence", () => {
  beforeAll(async () => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_monitor_starter";
    process.env.STRIPE_GROWTH_PRICE_ID = "price_monitor_growth";
    const database = await import("@/lib/db");
    const monitoring = await import("@/lib/source-monitoring");
    db = database.getDb();
    dispatchDueSourceMonitoring = monitoring.dispatchDueSourceMonitoring;
    reviewSourceMonitoringSuggestion =
      monitoring.reviewSourceMonitoringSuggestion;
    SourceMonitoringConflictError = monitoring.SourceMonitoringConflictError;

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        memberships: {
          create: {
            organization: {
              create: {
                id: organizationId,
                name: "Monitoring integration",
              },
            },
          },
        },
      },
    });
    await db.site.create({
      data: {
        id: siteId,
        slug,
        name: "Monitoring Cafe",
        eyebrow: "Cafe",
        description: "A sufficiently long monitoring integration fixture.",
        address: "Old address",
        phone: "1111",
        sourceUrl: "https://example.com/",
        draftPalette: {
          background: "#ffffff",
          foreground: "#111111",
          accent: "#aa0000",
        },
        attributes: { cuisine: "Cafe", showMenuImages: false },
        status: "CLAIMED",
        organizationId,
        catalogSections: {
          create: {
            name: "Menu",
            description: "",
            position: 0,
          },
        },
        subscription: {
          create: {
            stripeCustomerId: `cus_${randomUUID()}`,
            stripeSubscriptionId: `sub_${randomUUID()}`,
            stripePriceId: "price_monitor_starter",
            status: "ACTIVE",
            organizationId,
          },
        },
      },
    });
  });

  afterAll(async () => {
    await db.site.deleteMany({ where: { id: siteId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: userId } });
    restoreEnvironment(
      "STRIPE_STARTER_PRICE_ID",
      previousStarter,
    );
    restoreEnvironment("STRIPE_GROWTH_PRICE_ID", previousGrowth);
  });

  test("claims one durable run for one schedule slot", async () => {
    const now = new Date("2026-07-27T10:00:00.000Z");
    const first = await dispatchDueSourceMonitoring(
      now,
      async (runId) => `workflow-${runId}`,
    );
    const replay = await dispatchDueSourceMonitoring(
      now,
      async (runId) => `workflow-replay-${runId}`,
    );
    expect(first).toEqual({ claimed: 1, started: 1, failedToStart: 0 });
    expect(replay).toEqual({ claimed: 0, started: 0, failedToStart: 0 });
    expect(
      await db.sourceMonitorRun.count({ where: { siteId } }),
    ).toBe(1);
  });

  test("applies an accepted suggestion to the draft but never publishes", async () => {
    const run = await db.sourceMonitorRun.create({
      data: {
        siteId,
        idempotencyKey: `${siteId}:manual-accept`,
        scheduledFor: new Date(),
        status: "SUCCEEDED",
        completedAt: new Date(),
        suggestionCount: 1,
      },
    });
    const suggestion = await db.sourceMonitorSuggestion.create({
      data: {
        siteId,
        runId: run.id,
        fingerprint: randomUUID(),
        field: "CONTACT",
        path: "contact",
        currentValue: { address: "Old address", phone: "1111" },
        suggestedValue: { address: "New address", phone: "2222" },
        evidence: [],
      },
    });
    await reviewSourceMonitoringSuggestion({
      siteId,
      suggestionId: suggestion.id,
      actor: {
        id: userId,
        email: `${userId}@example.test`,
        role: "owner",
      },
      action: "accept",
    });
    expect(
      await db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
          address: true,
          phone: true,
          publishedSiteVersionId: true,
          _count: { select: { siteVersions: true } },
        },
      }),
    ).toEqual({
      address: "New address",
      phone: "2222",
      publishedSiteVersionId: null,
      _count: { siteVersions: 0 },
    });
  });

  test("rejects stale suggestions instead of overwriting a later owner edit", async () => {
    const run = await db.sourceMonitorRun.create({
      data: {
        siteId,
        idempotencyKey: `${siteId}:manual-stale`,
        scheduledFor: new Date(),
        status: "SUCCEEDED",
        completedAt: new Date(),
        suggestionCount: 1,
      },
    });
    const suggestion = await db.sourceMonitorSuggestion.create({
      data: {
        siteId,
        runId: run.id,
        fingerprint: randomUUID(),
        field: "CONTACT",
        path: "contact",
        currentValue: { address: "Old address", phone: "1111" },
        suggestedValue: { address: "Bad overwrite", phone: "3333" },
        evidence: [],
      },
    });
    await expect(
      reviewSourceMonitoringSuggestion({
        siteId,
        suggestionId: suggestion.id,
        actor: {
          id: userId,
          email: `${userId}@example.test`,
          role: "owner",
        },
        action: "accept",
      }),
    ).rejects.toBeInstanceOf(SourceMonitoringConflictError);
    expect(
      await db.sourceMonitorSuggestion.findUniqueOrThrow({
        where: { id: suggestion.id },
        select: { status: true },
      }),
    ).toEqual({ status: "PENDING" });
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
