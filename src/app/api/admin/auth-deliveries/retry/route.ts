import { z } from "zod";
import { getSuperadminAccess } from "@/lib/authorization";
import { retryMagicLink } from "@/lib/magic-links";
import { limitOperatorAuthRetry } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

const schema = z.object({ id: z.string().min(1).max(128) });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const operator = await getSuperadminAccess();
  if (!operator) return Response.json({ error: "Not found" }, { status: 404 });
  const rateLimit = await limitOperatorAuthRetry(request);
  if (!rateLimit.success) {
    return Response.json({ error: "Retry limit reached" }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid delivery" }, { status: 400 });
  }
  try {
    await retryMagicLink(parsed.data.id, operator.id, request.headers);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Delivery cannot be retried" }, { status: 409 });
  }
}
