import { z } from "zod";
import { authRequestUrl } from "@/lib/auth-request-url";
import { auth } from "@/lib/better-auth";
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
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  const response = await auth.handler(
    new Request(authRequestUrl("/api/auth/workspace/select", request), {
      method: "POST",
      headers,
      body: JSON.stringify(parsed.data),
    }),
  );
  const result = new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
