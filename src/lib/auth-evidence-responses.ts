import { NextResponse } from "next/server";
import type { CurrentSession } from "@/lib/auth-sessions";
import { secureCookieRequired } from "@/lib/first-customer-test-mode";
import {
  PENDING_MAGIC_LINK_COOKIE,
  SESSION_COOKIE,
} from "@/lib/session";

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

export async function logoutResponseAfterAtomicRevocation(
  current: CurrentSession | null,
  revoke: (session: CurrentSession) => Promise<void>,
): Promise<NextResponse> {
  if (current) {
    try {
      await revoke(current);
    } catch {
      return NextResponse.json(
        { error: "Sign-out could not be completed." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieRequired(),
    path: "/",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
