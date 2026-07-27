import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/current-session";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/sign-in?error=invalid-link", request.url),
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
    new URL(destination, request.url),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
