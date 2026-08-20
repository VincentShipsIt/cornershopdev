import { describe, expect, it } from "bun:test";
import {
  evaluateOutreachEnvironment,
  hasRequiredResendInboundWebhook,
  hasRequiredResendWebhook,
  isOutreachPreflightReady,
  REQUIRED_RESEND_INBOUND_WEBHOOK_EVENTS,
  REQUIRED_RESEND_WEBHOOK_EVENTS,
} from "@/lib/outreach-readiness";

const configuredEnvironment = {
  DATABASE_URL: "postgresql://user:private@example.test/cornershopdev",
  RESEND_API_KEY: "re_private_value",
  RESEND_WEBHOOK_SECRET: "whsec_delivery_private_value",
  RESEND_INBOUND_WEBHOOK_SECRET: "whsec_inbound_private_value",
  CLAIM_TOKEN_SECRET: "a-private-value-that-is-at-least-32-characters",
  NEXT_PUBLIC_APP_URL: "https://cornershop.dev",
  WORKFLOW_ENABLED: "true",
  WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
  WORKFLOW_POSTGRES_URL: "postgresql://workflow:private@example.test/workflow",
  WORKFLOW_POSTGRES_JOB_PREFIX: "cornershopdev_",
  WORKFLOW_POSTGRES_MAX_POOL_SIZE: "10",
  WORKFLOW_POSTGRES_WORKER_CONCURRENCY: "5",
};

describe("outreach environment readiness", () => {
  it("accepts the registered Restofront identity and complete runtime contract", () => {
    expect(evaluateOutreachEnvironment(configuredEnvironment)).toEqual({
      ready: true,
      checks: {
        database: true,
        resendApiKey: true,
        resendDeliveryWebhookSecret: true,
        resendInboundWebhookSecret: true,
        claimTokenSecret: true,
        workflow: true,
        appOrigin: true,
        sender: true,
        replyTo: true,
      },
      missingOrInvalid: [],
      webhookEndpoint: "https://cornershop.dev/api/webhooks/resend",
      inboundWebhookEndpoint:
        "https://cornershop.dev/api/webhooks/resend/inbound",
    });
  });

  it("reports names and booleans without exposing configured values", () => {
    const result = evaluateOutreachEnvironment({
      ...configuredEnvironment,
      RESEND_WEBHOOK_SECRET: undefined,
      WORKFLOW_ENABLED: "false",
    });
    const serialized = JSON.stringify(result);

    expect(result.ready).toBe(false);
    expect(result.missingOrInvalid).toEqual([
      "RESEND_WEBHOOK_SECRET",
      "WORKFLOW_*",
    ]);
    for (const value of [
      configuredEnvironment.DATABASE_URL,
      configuredEnvironment.RESEND_API_KEY,
      configuredEnvironment.RESEND_WEBHOOK_SECRET,
      configuredEnvironment.RESEND_INBOUND_WEBHOOK_SECRET,
      configuredEnvironment.CLAIM_TOKEN_SECRET,
      configuredEnvironment.WORKFLOW_POSTGRES_URL,
    ]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("requires an explicit inbound signing secret", () => {
    const readiness = evaluateOutreachEnvironment({
      ...configuredEnvironment,
      RESEND_INBOUND_WEBHOOK_SECRET: undefined,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.resendInboundWebhookSecret).toBe(false);
    expect(readiness.missingOrInvalid).toContain(
      "RESEND_INBOUND_WEBHOOK_SECRET (present and distinct)",
    );
  });

  it("rejects a shared delivery and inbound signing secret without exposing it", () => {
    const readiness = evaluateOutreachEnvironment({
      ...configuredEnvironment,
      RESEND_INBOUND_WEBHOOK_SECRET:
        configuredEnvironment.RESEND_WEBHOOK_SECRET,
    });
    const serialized = JSON.stringify(readiness);

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.resendDeliveryWebhookSecret).toBe(true);
    expect(readiness.checks.resendInboundWebhookSecret).toBe(false);
    expect(readiness.missingOrInvalid).toContain(
      "RESEND_INBOUND_WEBHOOK_SECRET (present and distinct)",
    );
    expect(serialized).not.toContain(configuredEnvironment.RESEND_WEBHOOK_SECRET);
  });

  it("rejects a preview origin when production requires the canonical origin", () => {
    const readiness = evaluateOutreachEnvironment(
      {
        ...configuredEnvironment,
        NEXT_PUBLIC_APP_URL: "https://preview.cornershop.dev",
      },
      { expectedAppOrigin: "https://cornershop.dev" },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.appOrigin).toBe(false);
    expect(readiness.missingOrInvalid).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("rejects URL credentials so preflight output cannot expose them", () => {
    const credentialedOrigin = new URL("https://cornershop.dev");
    credentialedOrigin.username = "test-operator";
    credentialedOrigin.password = "test-password";
    const readiness = evaluateOutreachEnvironment({
      ...configuredEnvironment,
      NEXT_PUBLIC_APP_URL: credentialedOrigin.toString(),
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.appOrigin).toBe(false);
    expect(readiness.webhookEndpoint).toBeNull();
    expect(JSON.stringify(readiness)).not.toContain("test-password");
  });

  it("rejects malformed or unbounded Workflow worker configuration", () => {
    for (const override of [
      { WORKFLOW_POSTGRES_JOB_PREFIX: "shared_" },
      { WORKFLOW_POSTGRES_MAX_POOL_SIZE: "0" },
      { WORKFLOW_POSTGRES_WORKER_CONCURRENCY: "not-a-number" },
      { WORKFLOW_POSTGRES_URL: "https://example.test" },
    ]) {
      const readiness = evaluateOutreachEnvironment({
        ...configuredEnvironment,
        ...override,
      });
      expect(readiness.ready).toBe(false);
      expect(readiness.checks.workflow).toBe(false);
    }
  });
});

describe("Resend webhook readiness", () => {
  it("requires one enabled exact endpoint with every delivery event", () => {
    expect(
      hasRequiredResendWebhook(
        [
          {
            endpoint: "https://cornershop.dev/api/webhooks/resend",
            status: "enabled",
            events: [...REQUIRED_RESEND_WEBHOOK_EVENTS],
          },
        ],
        "https://cornershop.dev/api/webhooks/resend",
      ),
    ).toBe(true);
    expect(
      hasRequiredResendInboundWebhook(
        [
          {
            endpoint: "https://cornershop.dev/api/webhooks/resend/inbound",
            status: "enabled",
            events: [...REQUIRED_RESEND_INBOUND_WEBHOOK_EVENTS],
          },
        ],
        "https://cornershop.dev/api/webhooks/resend/inbound",
      ),
    ).toBe(true);
  });

  it("rejects a disabled, partial, or differently addressed webhook", () => {
    const expected = "https://cornershop.dev/api/webhooks/resend";
    expect(
      hasRequiredResendWebhook(
        [{ endpoint: expected, status: "disabled", events: ["email.sent"] }],
        expected,
      ),
    ).toBe(false);
    expect(
      hasRequiredResendWebhook(
        [{ endpoint: expected, status: "enabled", events: ["email.sent"] }],
        expected,
      ),
    ).toBe(false);
    expect(
      hasRequiredResendWebhook(
        [
          {
            endpoint: "https://example.test/api/webhooks/resend",
            status: "enabled",
            events: [...REQUIRED_RESEND_WEBHOOK_EVENTS],
          },
        ],
        expected,
      ),
    ).toBe(false);
  });
});

describe("complete outreach preflight", () => {
  const readyChecks = {
    configurationReady: true,
    migrationApplied: true,
    schemaReady: true,
    workflowDatabaseReachable: true,
    deliveryWebhookRegistered: true,
    inboundWebhookRegistered: true,
  };

  it("requires the inbound webhook as well as delivery, schema, and Workflow", () => {
    expect(isOutreachPreflightReady(readyChecks)).toBe(true);
    expect(
      isOutreachPreflightReady({
        ...readyChecks,
        inboundWebhookRegistered: false,
      }),
    ).toBe(false);
  });
});

describe("production outreach deployment", () => {
  it("loads both endpoint-specific signing secrets as required parameters", async () => {
    const deployScript = await Bun.file(
      new URL("../../deploy/aws/deploy.sh", import.meta.url),
    ).text();
    const requiredParameters = deployScript.match(
      /required_parameters=\(([\s\S]*?)\)\noptional_parameters=/,
    )?.[1];

    expect(requiredParameters).toContain("RESEND_WEBHOOK_SECRET");
    expect(requiredParameters).toContain("RESEND_INBOUND_WEBHOOK_SECRET");
  });
});
