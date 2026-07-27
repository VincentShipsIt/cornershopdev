import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { markMagicLinkConsumed } from "@/lib/magic-links";
import { isSameOriginMutation } from "@/lib/request-origin";
import {
  PENDING_MAGIC_LINK_COOKIE,
  pendingMagicLinkCookieOptions,
} from "@/lib/session";

function signInError(request: Request) {
  return NextResponse.redirect(
    new URL("/sign-in?error=invalid-link", request.url),
    303,
  );
}

/**
 * Stages the credential without consuming it. Email security scanners routinely
 * follow GET links; requiring a deliberate same-origin POST prevents those
 * scanners from burning a one-time link before its owner opens the message.
 */
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !process.env.DATABASE_URL) {
    return signInError(request);
  }

  const response = NextResponse.redirect(
    new URL("/sign-in/verify", request.url),
    303,
  );
  response.cookies.set(
    PENDING_MAGIC_LINK_COOKIE,
    token,
    pendingMagicLinkCookieOptions(),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  }
  const token = request.cookies.get(PENDING_MAGIC_LINK_COOKIE)?.value;
  if (!token || !process.env.DATABASE_URL) {
    return signInError(request);
  }

  const verifyUrl = new URL("/api/auth/magic-link/verify", request.url);
  verifyUrl.searchParams.set("token", token);
  verifyUrl.searchParams.set("callbackURL", "/api/auth/complete");
  verifyUrl.searchParams.set(
    "errorCallbackURL",
    "/sign-in?error=invalid-link",
  );
  const verification = await auth
    .handler(
      new Request(verifyUrl, {
        method: "GET",
        headers: request.headers,
        redirect: "manual",
      }),
    )
    .catch(() => null);
  if (!verification) {
    const response = signInError(request);
    response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
    return response;
  }

  const location = verification.headers.get("location");
  const destination = location ? new URL(location, request.url) : null;
  const verified =
    verification.status >= 300 &&
    verification.status < 400 &&
    destination?.pathname === "/api/auth/complete";
  if (!verified) {
    const response = signInError(request);
    response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
    return response;
  }

  await markMagicLinkConsumed(token).catch(() => undefined);
  const response = new NextResponse(verification.body, {
    status: verification.status,
    headers: verification.headers,
  });
  response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
