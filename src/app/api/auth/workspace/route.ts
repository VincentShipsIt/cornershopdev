import { z } from "zod";
import { rotateSessionToWorkspace } from "@/lib/auth-sessions";
import { getCurrentSession } from "@/lib/current-session";
import { isSameOriginMutation } from "@/lib/request-origin";

const schema = z.object({ siteId: z.string().min(1).max(128) });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid workspace" }, { status: 400 });
  }
  const current = await getCurrentSession();
  if (!current) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const updated = await rotateSessionToWorkspace({
    sessionId: current.id,
    userId: current.userId,
    siteId: parsed.data.siteId,
  }).catch(() => null);
  if (!updated) {
    return Response.json({ error: "Workspace access is unavailable" }, { status: 403 });
  }
  return Response.json(
    { ok: true, url: "/dashboard" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
