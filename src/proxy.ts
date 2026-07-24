import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listEmbedFrameOrigins } from "@/lib/verticals/registry";

/**
 * The only origins a generated site may frame, derived from the provider tables
 * of the registered verticals rather than from a hand-kept list. A vertical that
 * ships a widget provider widens this by registering; nothing else can.
 *
 * `'none'` when no vertical publishes an embed, so a mistake in
 * `resolveBookingEmbed` degrades to a blocked frame instead of an open one.
 *
 * Only `frame-src` is set. The embeds are iframes, so nothing else needs
 * loosening, and declaring a full policy here would mean owning `script-src`
 * for Next's inline bootstrap — a much larger surface to get wrong for no gain.
 */
const embedFrameSrc = (() => {
  const origins = listEmbedFrameOrigins();
  return `frame-src ${origins.length ? origins.join(" ") : "'none'"}`;
})();

function withEmbedFrameCsp(response: NextResponse) {
  response.headers.set("Content-Security-Policy", embedFrameSrc);
  return response;
}

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
  // A `/preview` URL is already the rendered site, whatever hostname asked for
  // it, so it is passed through with the frame policy attached and never
  // resolved against the domain table. Handling it before the hostname branch
  // keeps custom-domain behaviour on these paths exactly as it was.
  if (request.nextUrl.pathname.startsWith("/preview/")) {
    return withEmbedFrameCsp(NextResponse.next());
  }

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
  // The rewrite target is a preview route, so the frame policy rides along here
  // too — the visitor's URL never says `/preview`, but the page it gets is the
  // one that may embed a booking widget.
  return withEmbedFrameCsp(
    NextResponse.rewrite(new URL(destination, request.url)),
  );
}

export const config = {
  matcher: ["/", "/:locale([a-zA-Z]{2})", "/preview/:path*"],
};
