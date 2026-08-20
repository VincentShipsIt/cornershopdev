import { logoutResponseWithEvidence } from "@/lib/auth-evidence-responses";
import { recordSessionRevocation } from "@/lib/auth-sessions";
import { authRequestUrl } from "@/lib/auth-request-url";
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
    new Request(authRequestUrl("/api/auth/sign-out", request), {
      method: "POST",
      headers,
      body: "{}",
    }),
  );
  return logoutResponseWithEvidence(
    response,
    current,
    recordSessionRevocation,
  );
}
