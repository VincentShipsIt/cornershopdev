import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/magic-links";
import { isSameOriginMutation } from "@/lib/request-origin";
import {
  PENDING_MAGIC_LINK_COOKIE,
  pendingMagicLinkCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
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

  const created = await consumeMagicLink(token).catch(() => null);
  if (!created) {
    const response = signInError(request);
    response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
    return response;
  }

  const destination =
    created.session.purpose === "ADMIN"
      ? "/admin"
      : created.session.purpose === "WORKSPACE_SELECTION"
        ? "/workspace/select"
        : "/dashboard";
  const response = NextResponse.redirect(
    new URL(destination, request.url),
    303,
  );
  response.cookies.delete(PENDING_MAGIC_LINK_COOKIE);
  response.cookies.set(
    SESSION_COOKIE,
    created.token,
    sessionCookieOptions(created.session.expiresAt),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
