import { NextResponse } from "next/server";
import type { CurrentSession } from "@/lib/auth-sessions";
import { PENDING_MAGIC_LINK_COOKIE } from "@/lib/session";

export async function verifiedMagicLinkResponse(
  token: string,
  verification: Response,
  consume: (value: string) => Promise<void>,
): Promise<NextResponse> {
  try {
    await consume(token);
  } catch {
    const unavailable = NextResponse.json(
      { error: "Sign-in could not be completed. Request a new link." },
      { status: 503 },
    );
    unavailable.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
    unavailable.headers.set("Cache-Control", "private, no-store");
    return unavailable;
  }
  const response = new NextResponse(verification.body, {
    status: verification.status,
    headers: verification.headers,
  });
  response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function logoutResponseWithEvidence(
  response: Response,
  current: CurrentSession | null,
  record: (session: CurrentSession) => Promise<void>,
): Promise<Response> {
  const result = new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
  if (response.ok && current) {
    try {
      await record(current);
    } catch {
      return Response.json(
        { error: "Sign-out evidence could not be recorded." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  result.headers.set("Cache-Control", "no-store");
  return result;
}
