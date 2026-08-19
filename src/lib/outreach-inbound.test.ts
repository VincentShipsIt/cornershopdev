import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const alerts: Array<Record<string, unknown>> = [];
const auditEvents: Array<Record<string, unknown>> = [];
const messages: Array<Record<string, unknown>> = [];
const sites = [
  {
    id: "site_1",
    slug: "chez-lea",
    email: "owner@chez-lea.test",
    vertical: "RESTAURANT",
    updatedAt: new Date("2026-08-19T08:00:00.000Z"),
  },
];

const fetchReceived = mock(
  async (): Promise<{
    id: string;
    from: string;
    to: string[];
    subject: string;
    text: string | null;
    html: string | null;
    messageId: string | null;
    receivedFor: string[];
    headers: Record<string, string>;
  } | null> => ({
    id: "recv_1",
    from: "owner@chez-lea.test",
    to: ["vincent@restofront.com"],
    subject: "Re: Chez Léa, your new site is ready to preview",
    text: "Looks great — can we talk?",
    html: "<p>Looks great — can we talk?</p>",
    messageId: "<reply@chez-lea.test>",
    receivedFor: ["vincent@restofront.com"],
    headers: {
      "in-reply-to": "<outreach_abc@send.restofront.com>",
      references: "<outreach_abc@send.restofront.com>",
    },
  }),
);

mock.module("@/lib/resend", () => ({
  fetchReceivedResendEmail: fetchReceived,
  sendBoundedResendEmail: async () => ({
    data: null,
    error: { message: "unused", statusCode: null },
  }),
  getResend: () => ({ emails: { send: async () => ({ data: null, error: null }) } }),
  emailSender: () =>
    "Vincent from Restofrontapp <vincent@send.restofront.com>",
  emailReplyTo: () => "vincent@restofront.com",
  RESEND_SEND_TIMEOUT_MS: 8_000,
}));
mock.module("@/lib/operator-alerts", () => ({
  captureOperatorAlert: async (input: Record<string, unknown>) => {
    alerts.push(input);
    return "delivered" as const;
  },
}));
mock.module("@/lib/db", () => ({
  getDb: () => fakeDb,
}));

const fakeDb = {
  outreachMessage: {
    findUnique: async (input: {
      where: { providerMessageId?: string; rfcMessageId?: string };
    }) =>
      messages.find(
        (message) =>
          (input.where.providerMessageId &&
            message.providerMessageId === input.where.providerMessageId) ||
          (input.where.rfcMessageId &&
            message.rfcMessageId === input.where.rfcMessageId),
      ) ?? null,
    findFirst: async (input: {
      where: {
        OR?: Array<Record<string, unknown>>;
        siteId?: string;
        direction?: string;
      };
    }) => {
      if (input.where.OR) {
        return (
          messages.find((message) =>
            input.where.OR?.some((clause) =>
              Object.entries(clause).every(([key, value]) => {
                if (
                  value &&
                  typeof value === "object" &&
                  "in" in value &&
                  Array.isArray((value as { in: unknown[] }).in)
                ) {
                  return (value as { in: unknown[] }).in.includes(
                    message[key],
                  );
                }
                return message[key] === value;
              }),
            ),
          ) ?? null
        );
      }
      return (
        messages.find(
          (message) =>
            (!input.where.siteId || message.siteId === input.where.siteId) &&
            (!input.where.direction ||
              message.direction === input.where.direction),
        ) ?? null
      );
    },
    create: async (input: { data: Record<string, unknown> }) => {
      const created = { id: "inbound_1", ...input.data };
      messages.push(created);
      return created;
    },
  },
  site: {
    findFirst: async (input: {
      where: { email?: string; slug?: { in: string[] }; vertical?: string };
    }) => {
      return (
        sites.find((site) => {
          if (input.where.vertical && site.vertical !== input.where.vertical) {
            return false;
          }
          if (input.where.email && site.email !== input.where.email) {
            return false;
          }
          if (
            input.where.slug?.in &&
            !input.where.slug.in.includes(site.slug)
          ) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
  },
  auditEvent: {
    create: async (input: { data: Record<string, unknown> }) => {
      auditEvents.push(input.data);
      return input.data;
    },
  },
};

const { recordInboundOutreachMessage } = await import(
  "@/lib/outreach-inbound"
);

describe("inbound outreach mailbox", () => {
  beforeEach(() => {
    alerts.length = 0;
    auditEvents.length = 0;
    messages.length = 0;
    fetchReceived.mockClear();
    messages.push({
      id: "outreach_abc",
      siteId: "site_1",
      direction: "OUTBOUND",
      rfcMessageId: "outreach_abc@send.restofront.com",
      providerMessageId: "resend_message_1",
      threadKey: "lead:site_1",
    });
  });

  it("matches In-Reply-To, stores RECEIVED mail, and alerts the operator", async () => {
    const result = await recordInboundOutreachMessage({
      eventId: "svix_1",
      occurredAt: new Date("2026-08-19T09:00:00.000Z"),
      metadata: {
        emailId: "recv_1",
        from: "owner@chez-lea.test",
        to: ["vincent@restofront.com"],
        subject: "Re: preview",
        rfcMessageId: "<reply@chez-lea.test>",
        receivedFor: ["vincent@restofront.com"],
      },
    });

    expect(result).toEqual({
      handled: true,
      created: true,
      retry: false,
      siteId: "site_1",
      messageId: "inbound_1",
    });
    expect(messages.at(-1)).toMatchObject({
      direction: "INBOUND",
      status: "RECEIVED",
      threadKey: "lead:site_1",
      textBody: "Looks great — can we talk?",
    });
    expect(auditEvents.map((event) => event.type)).toEqual([
      "outreach.inbound.received",
    ]);
    expect(alerts[0]).toMatchObject({ kind: "OUTREACH_REPLY" });
  });

  it("is idempotent on the provider receiving id", async () => {
    messages.push({
      id: "inbound_existing",
      siteId: "site_1",
      providerMessageId: "recv_1",
    });
    const result = await recordInboundOutreachMessage({
      eventId: "svix_1",
      occurredAt: new Date("2026-08-19T09:00:00.000Z"),
      metadata: {
        emailId: "recv_1",
        from: "owner@chez-lea.test",
        to: ["vincent@restofront.com"],
        subject: "Re: preview",
        rfcMessageId: "<reply@chez-lea.test>",
        receivedFor: [],
      },
    });

    expect(result).toEqual({
      handled: true,
      created: false,
      retry: false,
      siteId: "site_1",
      messageId: "inbound_existing",
    });
    expect(fetchReceived).not.toHaveBeenCalled();
  });

  it("retries when Resend has not published the received body yet", async () => {
    fetchReceived.mockResolvedValueOnce(null);
    const result = await recordInboundOutreachMessage({
      eventId: "svix_1",
      occurredAt: new Date("2026-08-19T09:00:00.000Z"),
      metadata: {
        emailId: "recv_missing",
        from: "owner@chez-lea.test",
        to: ["vincent@restofront.com"],
        subject: "Re: preview",
        rfcMessageId: null,
        receivedFor: [],
      },
    });

    expect(result.retry).toBe(true);
    expect(result.handled).toBe(false);
  });
});
