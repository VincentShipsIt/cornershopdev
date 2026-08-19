import { Webhook } from "svix";

export type SignedResendWebhook =
  | { ok: true; svixId: string; payload: unknown }
  | { ok: false; status: 400; error: string };

/**
 * Verifies a Resend/Svix-signed POST. Callers own missing-secret and
 * persistence alerts; this only answers "was the envelope authentic?"
 */
export function verifyResendWebhook(
  request: Request,
  rawBody: string,
  secret: string | undefined,
): SignedResendWebhook {
  if (!secret) {
    return { ok: false, status: 400, error: "Resend webhook is not configured" };
  }
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, status: 400, error: "Invalid signature" };
  }
  try {
    const payload: unknown = new Webhook(secret).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    return { ok: true, svixId, payload };
  } catch {
    return { ok: false, status: 400, error: "Invalid signature" };
  }
}

export function resendInboundWebhookSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env.RESEND_INBOUND_WEBHOOK_SECRET || env.RESEND_WEBHOOK_SECRET;
}
