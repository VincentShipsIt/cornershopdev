import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function requestHostname(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  return (forwardedHost ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
}

function platformHostnames() {
  return new Set(
    (
      process.env.PLATFORM_HOSTNAMES ??
      "restofront.com,www.restofront.com,api.restofront.com,domains.restofront.com"
    )
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function proxy(request: NextRequest) {
  const hostname = requestHostname(request);
  if (!hostname || platformHostnames().has(hostname)) {
    return NextResponse.next();
  }

  const domain = await getDb().domain.findFirst({
    where: { hostname, verified: true },
    select: { site: { select: { slug: true } } },
  });
  if (!domain) return new NextResponse("Not found", { status: 404 });

  const locale = request.nextUrl.pathname.match(/^\/([a-z]{2})\/?$/i)?.[1];
  const destination = locale
    ? `/preview/${domain.site.slug}/${locale.toLowerCase()}`
    : `/preview/${domain.site.slug}`;
  return NextResponse.rewrite(new URL(destination, request.url));
}

export const config = {
  matcher: ["/", "/:locale([a-zA-Z]{2})"],
};
