import { emailReplyTo, emailSender } from "@/lib/resend";
import { listOutreachVerticals } from "@/lib/lead-generation/registry";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";
import { configuredOutreachController } from "@/lib/electronic-outreach-eligibility";

export const OUTREACH_MIGRATIONS = [
  "20260819120000_outreach_inbound_mailbox",
  "20260820200000_site_contact_privacy_and_catalog_availability",
] as const;
export const RESTOFRONT_OUTREACH_FROM =
  "Vincent from Restofrontapp <vincent@send.restofront.com>";
export const RESTOFRONT_OUTREACH_REPLY_TO = "vincent@restofront.com";
export const REQUIRED_RESEND_WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
] as const;
export const REQUIRED_RESEND_INBOUND_WEBHOOK_EVENTS = [
  "email.received",
] as const;

type Environment = Record<string, string | undefined>;

export type OutreachEnvironmentReadiness = {
  ready: boolean;
  checks: {
    database: boolean;
    resendApiKey: boolean;
    resendWebhookSecret: boolean;
    claimTokenSecret: boolean;
    legalController: boolean;
    workflow: boolean;
    appOrigin: boolean;
    sender: boolean;
    replyTo: boolean;
  };
  missingOrInvalid: string[];
  webhookEndpoint: string | null;
  inboundWebhookEndpoint: string | null;
  verticals: Array<{
    vertical: VerticalId;
    brand: string;
    senderConfigured: boolean;
    replyToConfigured: boolean;
  }>;
};

export type ResendWebhookSummary = {
  endpoint: string;
  status: "enabled" | "disabled";
  events: string[] | null;
};

export type ResendDomainSummary = {
  name: string;
  status: string;
  capabilities?: { sending?: string; receiving?: string };
};

export function evaluateOutreachEnvironment(
  env: Environment,
  options: { expectedAppOrigin?: string } = {},
): OutreachEnvironmentReadiness {
  const webhookEndpoint = resolveWebhookEndpoint(env.NEXT_PUBLIC_APP_URL);
  const inboundWebhookEndpoint = resolveInboundWebhookEndpoint(
    env.NEXT_PUBLIC_APP_URL,
  );
  const verticals = listOutreachVerticals().map((vertical) => {
    const marketing = resolveVerticalConfig(vertical).marketing;
    return {
      vertical,
      brand: marketing.brand.name,
      senderConfigured:
        Boolean(marketing.email?.from) &&
        emailSender(vertical, env) === marketing.email?.from,
      replyToConfigured:
        Boolean(marketing.email?.replyTo) &&
        emailReplyTo(vertical, env) === marketing.email?.replyTo,
    };
  });
  const checks = {
    database: Boolean(env.DATABASE_URL),
    resendApiKey: Boolean(env.RESEND_API_KEY),
    resendWebhookSecret: Boolean(env.RESEND_WEBHOOK_SECRET),
    claimTokenSecret: Boolean(
      env.CLAIM_TOKEN_SECRET && env.CLAIM_TOKEN_SECRET.length >= 32,
    ),
    legalController: Boolean(configuredOutreachController(env)),
    workflow:
      env.WORKFLOW_ENABLED === "true" &&
      env.WORKFLOW_TARGET_WORLD === "@workflow/world-postgres" &&
      isPostgresUrl(env.WORKFLOW_POSTGRES_URL) &&
      env.WORKFLOW_POSTGRES_JOB_PREFIX === "cornershopdev_" &&
      isBoundedPositiveInteger(env.WORKFLOW_POSTGRES_MAX_POOL_SIZE) &&
      isBoundedPositiveInteger(env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY),
    appOrigin:
      Boolean(webhookEndpoint) &&
      (!options.expectedAppOrigin ||
        webhookEndpoint === resolveWebhookEndpoint(options.expectedAppOrigin)),
    sender:
      verticals.length > 0 &&
      verticals.every((vertical) => vertical.senderConfigured),
    replyTo:
      verticals.length > 0 &&
      verticals.every((vertical) => vertical.replyToConfigured),
  };
  const variableByCheck = {
    database: "DATABASE_URL",
    resendApiKey: "RESEND_API_KEY",
    resendWebhookSecret: "RESEND_WEBHOOK_SECRET",
    claimTokenSecret: "CLAIM_TOKEN_SECRET",
    legalController: "OUTREACH_LEGAL_CONTROLLER",
    workflow: "WORKFLOW_*",
    appOrigin: "NEXT_PUBLIC_APP_URL",
    sender: "VERTICAL_MARKETING_EMAIL_FROM",
    replyTo: "VERTICAL_MARKETING_EMAIL_REPLY_TO",
  } satisfies Record<keyof typeof checks, string>;
  const missingOrInvalid = Object.entries(checks).flatMap(([name, ready]) =>
    ready ? [] : [variableByCheck[name as keyof typeof variableByCheck]],
  );

  return {
    ready: missingOrInvalid.length === 0,
    checks,
    missingOrInvalid,
    webhookEndpoint,
    inboundWebhookEndpoint,
    verticals,
  };
}

export function hasRequiredResendDomains(
  domains: ResendDomainSummary[],
): boolean {
  return listOutreachVerticals().every((vertical) => {
    const email = resolveVerticalConfig(vertical).marketing.email;
    if (!email) return false;
    const senderDomain = emailDomain(email.from);
    const replyDomain = emailDomain(email.replyTo);
    if (!senderDomain || !replyDomain) return false;
    return (
      domains.some(
        (domain) =>
          domain.name.toLowerCase() === senderDomain &&
          domain.status === "verified" &&
          domain.capabilities?.sending === "enabled",
      ) &&
      domains.some(
        (domain) =>
          domain.name.toLowerCase() === replyDomain &&
          domain.status === "verified" &&
          domain.capabilities?.receiving === "enabled",
      )
    );
  });
}

function emailDomain(value: string): string | null {
  const match = value.toLowerCase().match(/<?[^<>\s@]+@([^<>\s]+)>?$/);
  return match?.[1]?.replace(/>$/, "") ?? null;
}

function isPostgresUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function isBoundedPositiveInteger(value: string | undefined): boolean {
  if (!value || !/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100;
}

export function hasRequiredResendWebhook(
  webhooks: ResendWebhookSummary[],
  expectedEndpoint: string,
): boolean {
  return hasWebhookEvents(
    webhooks,
    expectedEndpoint,
    REQUIRED_RESEND_WEBHOOK_EVENTS,
  );
}

export function hasRequiredResendInboundWebhook(
  webhooks: ResendWebhookSummary[],
  expectedEndpoint: string,
): boolean {
  return hasWebhookEvents(
    webhooks,
    expectedEndpoint,
    REQUIRED_RESEND_INBOUND_WEBHOOK_EVENTS,
  );
}

function hasWebhookEvents(
  webhooks: ResendWebhookSummary[],
  expectedEndpoint: string,
  requiredEvents: readonly string[],
): boolean {
  return webhooks.some((webhook) => {
    if (webhook.status !== "enabled" || webhook.endpoint !== expectedEndpoint) {
      return false;
    }
    const events = new Set(webhook.events ?? []);
    return requiredEvents.every((event) => events.has(event));
  });
}

function resolveWebhookEndpoint(appUrl: string | undefined): string | null {
  return resolveHttpsPath(appUrl, "/api/webhooks/resend");
}

function resolveInboundWebhookEndpoint(
  appUrl: string | undefined,
): string | null {
  return resolveHttpsPath(appUrl, "/api/webhooks/resend/inbound");
}

function resolveHttpsPath(
  appUrl: string | undefined,
  pathname: string,
): string | null {
  if (!appUrl) return null;
  try {
    const url = new URL(pathname, appUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
