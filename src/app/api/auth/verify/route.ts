import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { consumeMagicLink } from "@/lib/magic-links";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !process.env.DATABASE_URL) {
    redirect("/sign-in?error=invalid-link");
  }

  const created = await consumeMagicLink(token).catch(() => null);
  if (!created) redirect("/sign-in?error=invalid-link");

  (await cookies()).set(
    SESSION_COOKIE,
    created.token,
    sessionCookieOptions(created.session.expiresAt),
  );
  redirect(
    created.session.purpose === "ADMIN"
      ? "/admin"
      : created.session.purpose === "WORKSPACE_SELECTION"
        ? "/workspace/select"
        : "/dashboard",
  );
}
