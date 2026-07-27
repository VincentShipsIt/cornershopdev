import { recordSessionRevocation } from "@/lib/auth-sessions";
import { auth } from "@/lib/better-auth";
import { getCurrentSession } from "@/lib/current-session";
import { isSameOriginMutation } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const current = await getCurrentSession();
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  const response = await auth.handler(
    new Request(new URL("/api/auth/sign-out", request.url), {
      method: "POST",
      headers,
      body: "{}",
    }),
  );
  const result = new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
  if (response.ok && current) {
    await recordSessionRevocation(current).catch(() => undefined);
  }
  result.headers.set("Cache-Control", "no-store");
  return result;
}
