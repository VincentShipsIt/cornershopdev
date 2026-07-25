import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/session";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const session = token ? verifySessionToken(token) : null;
  if (!token || !session) redirect("/sign-in?error=invalid-link");

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    createSessionToken({
      email: session.email,
      siteSlug: session.siteSlug,
    }),
    {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    },
  );
  redirect("/dashboard");
}
