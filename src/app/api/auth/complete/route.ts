import { NextResponse } from "next/server";
import { authRequestUrl } from "@/lib/auth-request-url";
import { getCurrentSession } from "@/lib/current-session";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.redirect(
      authRequestUrl("/sign-in?error=invalid-link", request),
      303,
    );
  }
  const destination =
    session.purpose === "ADMIN"
      ? "/admin"
      : session.purpose === "WORKSPACE_SELECTION"
        ? "/workspace/select"
        : "/dashboard";
  const response = NextResponse.redirect(
    authRequestUrl(destination, request),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
