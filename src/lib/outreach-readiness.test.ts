import { describe, expect, it } from "bun:test";
import {
  evaluateOutreachEnvironment,
  hasRequiredResendDomains,
  hasRequiredResendInboundWebhook,
  hasRequiredResendWebhook,
  OUTREACH_MIGRATIONS,
  REQUIRED_RESEND_INBOUND_WEBHOOK_EVENTS,
  REQUIRED_RESEND_WEBHOOK_EVENTS,
} from "@/lib/outreach-readiness";

const configuredEnvironment = {
  DATABASE_URL: "postgresql://user:private@example.test/cornershopdev",
  RESEND_API_KEY: "re_private_value",
  RESEND_WEBHOOK_SECRET: "whsec_private_value",
  CLAIM_TOKEN_SECRET: "a-private-value-that-is-at-least-32-characters",
  OUTREACH_LEGAL_CONTROLLER: "Corner Shop Labs Ltd",
  GOOGLE_PLACES_API_KEY: "test-google-places-key",
  NEXT_PUBLIC_APP_URL: "https://cornershop.dev",
  WORKFLOW_ENABLED: "true",
  WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
  WORKFLOW_POSTGRES_URL: "postgresql://workflow:private@example.test/workflow",
  WORKFLOW_POSTGRES_JOB_PREFIX: "cornershopdev_",
  WORKFLOW_POSTGRES_MAX_POOL_SIZE: "10",
  WORKFLOW_POSTGRES_WORKER_CONCURRENCY: "5",
};

describe("outreach environment readiness", () => {
  it("preflights both mailbox delivery and private-contact migrations", () => {
    expect(OUTREACH_MIGRATIONS).toEqual([
      "20260819120000_outreach_inbound_mailbox",
      "20260820200000_site_contact_privacy_and_catalog_availability",
    ]);
  });

  it("accepts the registered Restofront identity and complete runtime contract", () => {
    expect(evaluateOutreachEnvironment(configuredEnvironment)).toEqual({
      ready: true,
      checks: {
        database: true,
        resendApiKey: true,
        resendWebhookSecret: true,
        claimTokenSecret: true,
        legalController: true,
        leadDiscoveryProvider: true,
        workflow: true,
        appOrigin: true,
        sender: true,
        replyTo: true,
      },
      missingOrInvalid: [],
      webhookEndpoint: "https://cornershop.dev/api/webhooks/resend",
      inboundWebhookEndpoint:
        "https://cornershop.dev/api/webhooks/resend/inbound",
      verticals: [
        {
          vertical: "RESTAURANT",
          brand: "Restofrontapp",
          senderConfigured: true,
          replyToConfigured: true,
        },
      ],
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
      configuredEnvironment.CLAIM_TOKEN_SECRET,
      configuredEnvironment.OUTREACH_LEGAL_CONTROLLER,
      configuredEnvironment.GOOGLE_PLACES_API_KEY,
      configuredEnvironment.WORKFLOW_POSTGRES_URL,
    ]) {
      expect(serialized).not.toContain(value);
    }
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

  it("requires a specific configured legal outreach controller", () => {
    for (const controller of [undefined, "generic corporate"]) {
      const readiness = evaluateOutreachEnvironment({
        ...configuredEnvironment,
        OUTREACH_LEGAL_CONTROLLER: controller,
      });
      expect(readiness.ready).toBe(false);
      expect(readiness.checks.legalController).toBe(false);
      expect(readiness.missingOrInvalid).toContain("OUTREACH_LEGAL_CONTROLLER");
    }
  });

  it("requires an approved lead-enumeration provider and blocks public OSMF Nominatim", () => {
    for (const providerEnvironment of [
      {},
      {
        LEAD_DISCOVERY_NOMINATIM_BASE_URL:
          "https://nominatim.openstreetmap.org/search",
      },
    ]) {
      const readiness = evaluateOutreachEnvironment({
        ...configuredEnvironment,
        GOOGLE_PLACES_API_KEY: undefined,
        ...providerEnvironment,
      });
      expect(readiness.ready).toBe(false);
      expect(readiness.checks.leadDiscoveryProvider).toBe(false);
      expect(readiness.missingOrInvalid).toContain(
        "GOOGLE_PLACES_API_KEY|LEAD_DISCOVERY_NOMINATIM_BASE_URL",
      );
    }

    const selfHosted = evaluateOutreachEnvironment({
      ...configuredEnvironment,
      GOOGLE_PLACES_API_KEY: undefined,
      LEAD_DISCOVERY_NOMINATIM_BASE_URL:
        "https://nominatim.internal.example/search",
    });
    expect(selfHosted.checks.leadDiscoveryProvider).toBe(true);
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

describe("Resend niche identity readiness", () => {
  it("requires verified sending and receiving capabilities without sending mail", () => {
    expect(
      hasRequiredResendDomains([
        {
          name: "send.restofront.com",
          status: "verified",
          capabilities: { sending: "enabled", receiving: "disabled" },
        },
        {
          name: "restofront.com",
          status: "verified",
          capabilities: { sending: "disabled", receiving: "enabled" },
        },
      ]),
    ).toBe(true);
    expect(
      hasRequiredResendDomains([
        {
          name: "send.restofront.com",
          status: "verified",
          capabilities: { sending: "enabled", receiving: "disabled" },
        },
        {
          name: "restofront.com",
          status: "pending",
          capabilities: { sending: "disabled", receiving: "enabled" },
        },
      ]),
    ).toBe(false);
  });
});
