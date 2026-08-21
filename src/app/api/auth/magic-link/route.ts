import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import { requestMagicLink } from "@/lib/magic-links";
import { limitMagicLinkRequest } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

const schema = z.object({ email: z.string().email().max(320) });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = normalizeAccountEmail(parsed.data.email);
  const rateLimit = await limitMagicLinkRequest(request, email);
  if (!rateLimit.success) {
    return Response.json(
      { error: "Please wait before requesting another link." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Accounts are temporarily unavailable." },
      { status: 503 },
    );
  }

  // Delivery failures and unknown accounts deliberately share the same response.
  // Durable outcomes are visible only in the operator console.
  await requestMagicLink(email, request.headers).catch(() => undefined);
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
