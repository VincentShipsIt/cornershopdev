import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authRequestUrl } from "@/lib/auth-request-url";
import { auth } from "@/lib/better-auth";
import { isBlockedDirectBetterAuthRoute } from "@/lib/better-auth-route-policy";

const handlers = toNextJsHandler(auth);

function blocked(request: NextRequest) {
  if (request.method === "GET") {
    return NextResponse.redirect(
      authRequestUrl("/sign-in?error=invalid-link", request),
      303,
    );
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function GET(request: NextRequest) {
  if (
    isBlockedDirectBetterAuthRoute(
      request.method,
      new URL(request.url).pathname,
    )
  ) {
    return blocked(request);
  }
  return handlers.GET(request);
}

export function POST(request: NextRequest) {
  if (
    isBlockedDirectBetterAuthRoute(
      request.method,
      new URL(request.url).pathname,
    )
  ) {
    return blocked(request);
  }
  return handlers.POST(request);
}
