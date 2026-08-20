import * as outreachReadiness from "@/lib/outreach-readiness";
import * as rateLimit from "@/lib/rate-limit";

/**
 * Bun's `mock.module` is process-global and replaces the whole module.
 * Snapshot real exports at load time, then tests override only the functions
 * they need so later files still see every named export.
 */
const allowRateLimit = async () => ({
  success: true,
  remaining: 99,
  reset: Date.now() + 60_000,
});

const evaluateOutreachEnvironmentActual =
  outreachReadiness.evaluateOutreachEnvironment;
const hasRequiredResendWebhookActual =
  outreachReadiness.hasRequiredResendWebhook;
const hasRequiredResendInboundWebhookActual =
  outreachReadiness.hasRequiredResendInboundWebhook;
const hasRequiredResendDomainsActual =
  outreachReadiness.hasRequiredResendDomains;

export const outreachReadinessTestModule = {
  OUTREACH_MIGRATIONS: outreachReadiness.OUTREACH_MIGRATIONS,
  RESTOFRONT_OUTREACH_FROM: outreachReadiness.RESTOFRONT_OUTREACH_FROM,
  RESTOFRONT_OUTREACH_REPLY_TO: outreachReadiness.RESTOFRONT_OUTREACH_REPLY_TO,
  REQUIRED_RESEND_WEBHOOK_EVENTS: [
    ...outreachReadiness.REQUIRED_RESEND_WEBHOOK_EVENTS,
  ],
  REQUIRED_RESEND_INBOUND_WEBHOOK_EVENTS: [
    ...outreachReadiness.REQUIRED_RESEND_INBOUND_WEBHOOK_EVENTS,
  ],
  hasRequiredResendWebhook: hasRequiredResendWebhookActual,
  hasRequiredResendInboundWebhook: hasRequiredResendInboundWebhookActual,
  hasRequiredResendDomains: hasRequiredResendDomainsActual,
  evaluateOutreachEnvironment: (
    env: Parameters<typeof evaluateOutreachEnvironmentActual>[0],
    options?: Parameters<typeof evaluateOutreachEnvironmentActual>[1],
  ) => {
    if (env === process.env) {
      return {
        ready: true,
        checks: {
          database: true,
          resendApiKey: true,
          resendWebhookSecret: true,
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
        verticals: [
          {
            vertical: "RESTAURANT" as const,
            brand: "Restofrontapp",
            senderConfigured: true,
            replyToConfigured: true,
          },
        ],
      };
    }
    return evaluateOutreachEnvironmentActual(env, options);
  },
};

export const rateLimitTestModule = {
  limitPublicPreview: rateLimit.limitPublicPreview,
  limitBookingRequest: rateLimit.limitBookingRequest,
  limitAnalyticsEvent: rateLimit.limitAnalyticsEvent,
  limitClaimInvitationRequest: rateLimit.limitClaimInvitationRequest,
  limitClaimCheckout: rateLimit.limitClaimCheckout,
  limitTranslationRegeneration: rateLimit.limitTranslationRegeneration,
  limitOperatorClaimInvitation: rateLimit.limitOperatorClaimInvitation,
  limitOperatorLeadMutation: allowRateLimit,
  limitMagicLinkRequest: rateLimit.limitMagicLinkRequest,
  limitOperatorAuthRetry: rateLimit.limitOperatorAuthRetry,
  limitOperatorLeadBatch: allowRateLimit,
  limitOperatorOutreachPause: allowRateLimit,
  limitOperatorOutreachSend: allowRateLimit,
};
