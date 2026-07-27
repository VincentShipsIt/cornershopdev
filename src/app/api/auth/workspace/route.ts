import { cookies } from "next/headers";
import { z } from "zod";
import { rotateSessionToWorkspace } from "@/lib/auth-sessions";
import { isSameOriginMutation } from "@/lib/request-origin";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

const schema = z.object({ siteId: z.string().min(1).max(128) });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid workspace" }, { status: 400 });
  }
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!currentToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const created = await rotateSessionToWorkspace({
    currentToken,
    siteId: parsed.data.siteId,
  }).catch(() => null);
  if (!created) {
    return Response.json({ error: "Workspace access is unavailable" }, { status: 403 });
  }
  cookieStore.set(
    SESSION_COOKIE,
    created.token,
    sessionCookieOptions(created.session.expiresAt),
  );
  return Response.json(
    { ok: true, url: "/dashboard" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
