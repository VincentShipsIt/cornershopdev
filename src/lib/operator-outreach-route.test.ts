import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  outreachReadinessTestModule,
  rateLimitTestModule,
} from "@/lib/complete-test-module-mocks";

mock.module("server-only", () => ({}));

const outreachActual = await import("@/lib/outreach");
const outreachTestModule = {
  OutreachError: outreachActual.OutreachError,
  OutreachDeliveryUnknownError: outreachActual.OutreachDeliveryUnknownError,
  OutreachTerminalDeliveryError: outreachActual.OutreachTerminalDeliveryError,
  OUTREACH_DELIVERY_LEASE_MS: outreachActual.OUTREACH_DELIVERY_LEASE_MS,
  appOrigin: outreachActual.appOrigin,
  sendLeadEmail: outreachActual.sendLeadEmail,
  listOutreachMessages: outreachActual.listOutreachMessages,
};

let reviewed = true;
let vertical = "RESTAURANT";
let existingMessage: {
  id: string;
  status: string;
  providerEventAt: Date | null;
  createdAt: Date;
} | null = null;
let existingDispatch: {
  id: string;
  status: string;
  workflowRunId: string | null;
} | null = null;
let paused = false;
let leadPaused = false;
const auditEvents: Array<Record<string, unknown>> = [];
const operatorAuditEvents: Array<Record<string, unknown>> = [];
const workflowStart = mock(async () => ({ runId: "wrun_test_1" }));

type DispatchRow = {
  id: string;
  idempotencyKey: string;
  status: "QUEUED" | "SENT" | "FAILED";
  workflowRunId: string | null;
  attempt: number;
  updatedAt: Date;
};

let dispatchRow: DispatchRow | null = null;
let transactionTail: Promise<unknown> = Promise.resolve();

function selectDispatch(row: DispatchRow) {
  return {
    id: row.id,
    status: row.status,
    workflowRunId: row.workflowRunId,
    attempt: row.attempt,
    updatedAt: row.updatedAt,
  };
}

function dispatchFromExisting(): DispatchRow | null {
  if (!existingDispatch) return null;
  return {
    id: existingDispatch.id,
    idempotencyKey: "lead-outreach:site_1:preview_ready",
    status: existingDispatch.status as DispatchRow["status"],
    workflowRunId: existingDispatch.workflowRunId,
    attempt: 1,
    updatedAt: new Date(),
  };
}

function whereMatches(
  row: DispatchRow,
  where: Record<string, unknown>,
): boolean {
  if (where.id && row.id !== where.id) return false;
  if (where.status && row.status !== where.status) return false;
  if ("workflowRunId" in where && row.workflowRunId !== where.workflowRunId) {
    return false;
  }
  if (where.attempt !== undefined && row.attempt !== where.attempt) {
    return false;
  }
  const updatedAt = where.updatedAt;
  if (
    updatedAt &&
    typeof updatedAt === "object" &&
    updatedAt !== null &&
    "lte" in updatedAt &&
    row.updatedAt.getTime() > (updatedAt as { lte: Date }).lte.getTime()
  ) {
    return false;
  }
  return true;
}

const outreachDispatchApi = {
  upsert: async ({
    where,
    create,
  }: {
    where: { idempotencyKey: string };
    create: { id: string; idempotencyKey: string };
  }) => {
    if (!dispatchRow) dispatchRow = dispatchFromExisting();
    if (!dispatchRow) {
      dispatchRow = {
        id: create.id,
        idempotencyKey: create.idempotencyKey ?? where.idempotencyKey,
        status: "QUEUED",
        workflowRunId: null,
        attempt: 1,
        updatedAt: new Date(),
      };
    }
    return selectDispatch(dispatchRow);
  },
  updateMany: async ({
    where,
    data,
  }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    if (!dispatchRow || !whereMatches(dispatchRow, where)) {
      return { count: 0 };
    }
    const attempt = data.attempt;
    if (
      attempt &&
      typeof attempt === "object" &&
      attempt !== null &&
      "increment" in attempt
    ) {
      dispatchRow.attempt += Number(
        (attempt as { increment: number }).increment,
      );
    } else if (typeof attempt === "number") {
      dispatchRow.attempt = attempt;
    }
    for (const [key, value] of Object.entries(data)) {
      if (key === "attempt") continue;
      (dispatchRow as unknown as Record<string, unknown>)[key] = value;
    }
    dispatchRow.updatedAt = new Date();
    return { count: 1 };
  },
  findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
    if (!dispatchRow || dispatchRow.id !== where.id) {
      throw new Error("OutreachDispatch not found");
    }
    return selectDispatch(dispatchRow);
  },
};

mock.module("workflow/api", () => ({ start: workflowStart }));
mock.module("@/workflows/lead-outreach", () => ({
  leadOutreachWorkflow: async () => {},
}));
mock.module("@/lib/authorization", () => ({
  getSuperadminAccess: async () => ({
    id: "operator_1",
    email: "operator@example.test",
  }),
}));
mock.module("@/lib/rate-limit", () => rateLimitTestModule);
mock.module("@/lib/outreach-readiness", () => outreachReadinessTestModule);
mock.module("@/lib/outreach", () => outreachTestModule);
mock.module("@/lib/db", () => ({
  getDb: () => ({
    site: {
      findUnique: async () => ({
        id: "site_1",
        email: "owner@example.test",
        status: "PREVIEW_READY",
        vertical,
        updatedAt: new Date("2026-08-19T08:00:00.000Z"),
        auditEvents: reviewed
          ? [{ createdAt: new Date("2026-08-19T08:01:00.000Z") }]
          : [],
        outreachMessages: existingMessage ? [existingMessage] : [],
        outreachDispatches: existingDispatch ? [existingDispatch] : [],
      }),
    },
    operatorSetting: {
      findUnique: async () => (paused ? { value: true } : null),
      findMany: async () => [
        ...(paused ? [{ key: "outreach.paused", value: true }] : []),
        ...(leadPaused
          ? [{ key: "outreach.paused.site.site_1", value: true }]
          : []),
      ],
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { key: string };
        update: { value: boolean };
        create: { value: boolean };
      }) => {
        const next = (where.key === "outreach.paused" ? paused : leadPaused)
          ? update.value
          : create.value;
        if (where.key === "outreach.paused") paused = next;
        else leadPaused = next;
        return { value: next };
      },
    },
    operatorAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operatorAuditEvents.push(data);
        return data;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push(data);
        return data;
      },
    },
    outreachDispatch: outreachDispatchApi,
    $transaction: async (
      operation:
        | Array<Promise<unknown>>
        | ((transaction: {
            $queryRaw: () => Promise<Array<{ acquired: boolean }>>;
            outreachDispatch: typeof outreachDispatchApi;
            auditEvent: {
              create: (input: {
                data: Record<string, unknown>;
              }) => Promise<Record<string, unknown>>;
            };
            operatorSetting: {
              upsert: (input: {
                where: { key: string };
                update: { value: boolean };
                create: { value: boolean };
              }) => Promise<{ value: boolean }>;
            };
            operatorAuditEvent: {
              create: (input: {
                data: Record<string, unknown>;
              }) => Promise<Record<string, unknown>>;
            };
          }) => Promise<unknown>),
    ) => {
      const run = () => {
        if (Array.isArray(operation)) return Promise.all(operation);
        return operation({
          $queryRaw: async () => [{ acquired: true }],
          outreachDispatch: outreachDispatchApi,
          auditEvent: {
            create: async ({ data }) => {
              auditEvents.push(data);
              return data;
            },
          },
          operatorSetting: {
            upsert: async ({ where, update, create }) => {
              const next =
                (where.key === "outreach.paused" ? paused : leadPaused)
                  ? update.value
                  : create.value;
              if (where.key === "outreach.paused") paused = next;
              else leadPaused = next;
              return { value: next };
            },
          },
          operatorAuditEvent: {
            create: async ({ data }) => {
              operatorAuditEvents.push(data);
              return data;
            },
          },
        });
      };
      const queued = transactionTail.then(run, run);
      transactionTail = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
  }),
}));

const { POST } = await import(
  "@/app/api/admin/leads/[slug]/outreach/route"
);
const { POST: POSTPause } = await import(
  "@/app/api/admin/outreach/pause/route"
);

describe("explicit operator outreach action", () => {
  beforeEach(() => {
    reviewed = true;
    vertical = "RESTAURANT";
    existingMessage = null;
    existingDispatch = null;
    paused = false;
    leadPaused = false;
    dispatchRow = null;
    auditEvents.length = 0;
    operatorAuditEvents.length = 0;
    workflowStart.mockClear();
  });

  it("persists and audits the global pause before returning success", async () => {
    const response = await POSTPause(
      new Request("https://cornershop.dev/api/admin/outreach/pause", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://cornershop.dev",
        },
        body: JSON.stringify({ paused: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(paused).toBe(true);
    expect(operatorAuditEvents).toEqual([
      {
        type: "outreach.paused",
        actor: "operator:operator_1",
        metadata: { paused: true, scope: "global", siteId: null },
      },
    ]);
  });

  it("persists a per-lead pause and blocks only that reviewed lead", async () => {
    const pauseResponse = await POSTPause(
      new Request("https://cornershop.dev/api/admin/outreach/pause", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://cornershop.dev",
        },
        body: JSON.stringify({ paused: true, siteSlug: "chez-lea" }),
      }),
    );
    const sendResponse = await POST(
      request("https://cornershop.dev"),
      context(),
    );

    expect(pauseResponse.status).toBe(200);
    expect(leadPaused).toBe(true);
    expect(paused).toBe(false);
    expect(sendResponse.status).toBe(409);
    expect(operatorAuditEvents[0]).toMatchObject({
      type: "outreach.paused",
      metadata: { paused: true, scope: "lead", siteId: "site_1" },
    });
  });

  it("rejects a cookie-authorized mutation without same-origin evidence", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(workflowStart).not.toHaveBeenCalled();
    expect(auditEvents).toHaveLength(0);
  });

  it("queues one workflow only after an explicit reviewed same-origin request", async () => {
    const response = await POST(request("https://cornershop.dev"), context());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      ok: true,
      started: true,
      workflowRunId: "wrun_test_1",
      status: "QUEUED",
    });
    expect(workflowStart).toHaveBeenCalledTimes(1);
    expect(workflowStart).toHaveBeenCalledWith(expect.any(Function), [
      "site_1",
      {
        actor: "operator:operator_1",
        dispatchId: expect.any(String),
        dispatchAttempt: 1,
        recipient: "owner@example.test",
        reviewedAt: "2026-08-19T08:01:00.000Z",
      },
    ]);
    expect(auditEvents.map((event) => event.type)).toEqual([
      "outreach.initial.requested",
      "outreach.initial.queued",
    ]);
  });

  it("returns the persisted queued dispatch without launching twice", async () => {
    existingDispatch = {
      id: "dispatch_1",
      status: "QUEUED",
      workflowRunId: "wrun_existing",
    };
    const response = await POST(
      request("https://cornershop.dev"),
      context(),
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      started: false,
      dispatchId: "dispatch_1",
      workflowRunId: "wrun_existing",
      status: "QUEUED",
    });
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it("launches only the request that acquires the concurrent reservation", async () => {
    const [first, duplicate] = await Promise.all([
      POST(request("https://cornershop.dev"), context()),
      POST(request("https://cornershop.dev"), context()),
    ]);

    expect([first.status, duplicate.status].sort()).toEqual([200, 202]);
    expect(workflowStart).toHaveBeenCalledTimes(1);
    expect(auditEvents.map((event) => event.type)).toEqual([
      "outreach.initial.requested",
      "outreach.initial.queued",
    ]);
  });

  it("never dispatches the gated Beauty vertical", async () => {
    vertical = "BEAUTY";
    const response = await POST(
      request("https://cornershop.dev"),
      context(),
    );

    expect(response.status).toBe(409);
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it("does not start again when the initial message already exists", async () => {
    existingMessage = {
      id: "message_1",
      status: "DELIVERED",
      providerEventAt: new Date("2026-08-19T08:02:00.000Z"),
      createdAt: new Date("2026-08-19T08:01:30.000Z"),
    };
    const response = await POST(request("https://cornershop.dev"), context());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      started: false,
      messageId: "message_1",
      status: "DELIVERED",
    });
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it("blocks both unreviewed and globally paused sends", async () => {
    reviewed = false;
    const unreviewed = await POST(
      request("https://cornershop.dev"),
      context(),
    );
    reviewed = true;
    paused = true;
    const globallyPaused = await POST(
      request("https://cornershop.dev"),
      context(),
    );

    expect(unreviewed.status).toBe(409);
    expect(globallyPaused.status).toBe(409);
    expect(workflowStart).not.toHaveBeenCalled();
  });
});

function request(origin?: string): Request {
  return new Request(
    "https://cornershop.dev/api/admin/leads/chez-lea/outreach",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({
        action: "send_initial",
        recipient: "owner@example.test",
        reviewedAt: "2026-08-19T08:01:00.000Z",
      }),
    },
  );
}

function context() {
  return {
    params: Promise.resolve({ slug: "chez-lea" }),
  } as Parameters<typeof POST>[1];
}
