import { Vertical } from "@/generated/prisma/enums";
import { emailReplyTo, emailSender } from "@/lib/resend";

export const OUTREACH_MIGRATION =
  "20260819084000_outreach_operator_safety";
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

type Environment = Record<string, string | undefined>;

export type OutreachEnvironmentReadiness = {
  ready: boolean;
  checks: {
    database: boolean;
    resendApiKey: boolean;
    resendWebhookSecret: boolean;
    claimTokenSecret: boolean;
    workflow: boolean;
    appOrigin: boolean;
    sender: boolean;
    replyTo: boolean;
  };
  missingOrInvalid: string[];
  webhookEndpoint: string | null;
};

export type ResendWebhookSummary = {
  endpoint: string;
  status: "enabled" | "disabled";
  events: string[] | null;
};

export function evaluateOutreachEnvironment(
  env: Environment,
  options: { expectedAppOrigin?: string } = {},
): OutreachEnvironmentReadiness {
  const webhookEndpoint = resolveWebhookEndpoint(env.NEXT_PUBLIC_APP_URL);
  const checks = {
    database: Boolean(env.DATABASE_URL),
    resendApiKey: Boolean(env.RESEND_API_KEY),
    resendWebhookSecret: Boolean(env.RESEND_WEBHOOK_SECRET),
    claimTokenSecret: Boolean(
      env.CLAIM_TOKEN_SECRET && env.CLAIM_TOKEN_SECRET.length >= 32,
    ),
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
      emailSender(Vertical.RESTAURANT, env) === RESTOFRONT_OUTREACH_FROM,
    replyTo:
      emailReplyTo(Vertical.RESTAURANT, env) ===
      RESTOFRONT_OUTREACH_REPLY_TO,
  };
  const variableByCheck = {
    database: "DATABASE_URL",
    resendApiKey: "RESEND_API_KEY",
    resendWebhookSecret: "RESEND_WEBHOOK_SECRET",
    claimTokenSecret: "CLAIM_TOKEN_SECRET",
    workflow: "WORKFLOW_*",
    appOrigin: "NEXT_PUBLIC_APP_URL",
    sender: "RESTOFRONT_SENDER_IDENTITY",
    replyTo: "RESTOFRONT_REPLY_TO_IDENTITY",
  } satisfies Record<keyof typeof checks, string>;
  const missingOrInvalid = Object.entries(checks).flatMap(([name, ready]) =>
    ready
      ? []
      : [variableByCheck[name as keyof typeof variableByCheck]],
  );

  return {
    ready: missingOrInvalid.length === 0,
    checks,
    missingOrInvalid,
    webhookEndpoint,
  };
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
  return webhooks.some((webhook) => {
    if (webhook.status !== "enabled" || webhook.endpoint !== expectedEndpoint) {
      return false;
    }
    const events = new Set(webhook.events ?? []);
    return REQUIRED_RESEND_WEBHOOK_EVENTS.every((event) => events.has(event));
  });
}

function resolveWebhookEndpoint(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    const url = new URL("/api/webhooks/resend", appUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
