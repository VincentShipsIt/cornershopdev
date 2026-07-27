import { cookies } from "next/headers";
import { revokeCurrentSession } from "@/lib/auth-sessions";
import { isSameOriginMutation } from "@/lib/request-origin";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && process.env.DATABASE_URL) {
    await revokeCurrentSession(token);
  }
  cookieStore.delete(SESSION_COOKIE);
  return Response.json(
    { ok: true, url: "/sign-in" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
