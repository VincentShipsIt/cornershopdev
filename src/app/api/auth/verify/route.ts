import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifiedMagicLinkResponse } from "@/lib/auth-evidence-responses";
import { authRequestUrl } from "@/lib/auth-request-url";
import { auth } from "@/lib/better-auth";
import {
  isMagicLinkConsumable,
  markMagicLinkConsumed,
} from "@/lib/magic-link-consumption";
import { isTrustedSameOriginFormPost } from "@/lib/request-origin";
import {
  PENDING_MAGIC_LINK_COOKIE,
  pendingMagicLinkCookieOptions,
} from "@/lib/session";

function signInError(request: Request) {
  return NextResponse.redirect(
    authRequestUrl("/sign-in?error=invalid-link", request),
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
    authRequestUrl("/sign-in/verify", request),
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
  if (!isTrustedSameOriginFormPost(request)) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  }
  const token = request.cookies.get(PENDING_MAGIC_LINK_COOKIE)?.value;
  if (!token || !process.env.DATABASE_URL) {
    return signInError(request);
  }
  try {
    if (!(await isMagicLinkConsumable(token))) {
      const response = signInError(request);
      response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
      return response;
    }
  } catch {
    const unavailable = NextResponse.json(
      { error: "Sign-in could not be completed. Request a new link." },
      { status: 503 },
    );
    unavailable.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
    unavailable.headers.set("Cache-Control", "private, no-store");
    return unavailable;
  }

  const verifyUrl = authRequestUrl("/api/auth/magic-link/verify", request);
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
  const destination = location
    ? new URL(location, authRequestUrl("/", request))
    : null;
  const verified =
    verification.status >= 300 &&
    verification.status < 400 &&
    destination?.pathname === "/api/auth/complete";
  if (!verified) {
    const response = signInError(request);
    response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
    return response;
  }

  return verifiedMagicLinkResponse(
    token,
    verification,
    markMagicLinkConsumed,
  );
}
