import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

type EmailEnvironment = Record<string, string | undefined>;

function nicheEmail(vertical: VerticalId | null | undefined) {
  return vertical ? resolveVerticalConfig(vertical).marketing.email : null;
}

/** Resolve the site owner's sending identity without loading a mail provider. */
export function emailSender(
  vertical?: VerticalId | null,
  environment: EmailEnvironment = process.env,
): string {
  return (
    nicheEmail(vertical)?.from ||
    environment.EMAIL_FROM ||
    "Cornershopdev <onboarding@resend.dev>"
  );
}

/** Resolve the monitored reply mailbox without loading a mail provider. */
export function emailReplyTo(
  vertical?: VerticalId | null,
  environment: EmailEnvironment = process.env,
): string | undefined {
  return (
    nicheEmail(vertical)?.replyTo || environment.EMAIL_REPLY_TO || undefined
  );
}
