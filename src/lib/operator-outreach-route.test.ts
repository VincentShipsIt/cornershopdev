import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

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
const auditEvents: Array<Record<string, unknown>> = [];
const operatorAuditEvents: Array<Record<string, unknown>> = [];
const workflowStart = mock(async () => ({ runId: "wrun_test_1" }));
let dispatchReserved = false;
const reserveDispatch = mock(async () => {
  if (existingDispatch) {
    return { ...existingDispatch, attempt: 1, acquired: false };
  }
  if (dispatchReserved) {
    return {
      id: "dispatch_1",
      status: "QUEUED" as const,
      workflowRunId: null,
      attempt: 1,
      acquired: false,
    };
  }
  dispatchReserved = true;
  auditEvents.push({ type: "outreach.initial.requested" });
  return {
    id: "dispatch_1",
    status: "QUEUED" as const,
    workflowRunId: null,
    attempt: 1,
    acquired: true,
  };
});
const markDispatchStarted = mock(async () => {
  auditEvents.push({ type: "outreach.initial.queued" });
});
const markDispatchFinished = mock(async () => {});

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
mock.module("@/lib/rate-limit", () => ({
  limitOperatorOutreachSend: async () => ({ success: true }),
  limitOperatorOutreachPause: async () => ({ success: true }),
}));
mock.module("@/lib/outreach-readiness", () => ({
  evaluateOutreachEnvironment: () => ({ ready: true }),
}));
mock.module("@/lib/outreach-dispatch", () => ({
  reserveInitialOutreachDispatch: reserveDispatch,
  markInitialOutreachDispatchStarted: markDispatchStarted,
  markInitialOutreachDispatchFinished: markDispatchFinished,
}));
mock.module("@/lib/outreach", () => ({
  listOutreachMessages: async () => [],
}));
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
      upsert: async ({
        update,
        create,
      }: {
        update: { value: boolean };
        create: { value: boolean };
      }) => {
        paused = (paused ? update : create).value;
        return { value: paused };
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
    $transaction: async (
      operation:
        | Array<Promise<unknown>>
        | ((transaction: {
            $queryRaw: () => Promise<Array<{ acquired: boolean }>>;
            operatorSetting: {
              upsert: (input: {
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
      if (Array.isArray(operation)) return Promise.all(operation);
      return operation({
        $queryRaw: async () => [{ acquired: true }],
        operatorSetting: {
          upsert: async ({ update, create }) => {
            paused = (paused ? update : create).value;
            return { value: paused };
          },
        },
        operatorAuditEvent: {
          create: async ({ data }) => {
            operatorAuditEvents.push(data);
            return data;
          },
        },
      });
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
    auditEvents.length = 0;
    operatorAuditEvents.length = 0;
    dispatchReserved = false;
    workflowStart.mockClear();
    reserveDispatch.mockClear();
    markDispatchStarted.mockClear();
    markDispatchFinished.mockClear();
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
        metadata: { paused: true },
      },
    ]);
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
        dispatchId: "dispatch_1",
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
    expect(reserveDispatch).toHaveBeenCalledTimes(1);
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it("launches only the request that acquires the concurrent reservation", async () => {
    const [first, duplicate] = await Promise.all([
      POST(request("https://cornershop.dev"), context()),
      POST(request("https://cornershop.dev"), context()),
    ]);

    expect([first.status, duplicate.status].sort()).toEqual([200, 202]);
    expect(reserveDispatch).toHaveBeenCalledTimes(2);
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
    expect(reserveDispatch).not.toHaveBeenCalled();
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
