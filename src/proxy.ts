import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { platformHostnames, requestHostname } from "@/lib/hostnames";
import { LIVE_SITE_SLUG_HEADER } from "@/lib/site-surface";
import {
  listEmbedFrameOrigins,
  resolveVerticalByHostname,
  verticalSlug,
} from "@/lib/verticals/registry";

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

export async function proxy(request: NextRequest) {
  const upstreamHeaders = new Headers(request.headers);
  // Never trust a caller-supplied surface marker. Only the verified-domain
  // branch below may add it for the rewritten Server Component request.
  upstreamHeaders.delete(LIVE_SITE_SLUG_HEADER);

  // A `/preview` URL is already the rendered site, whatever hostname asked for
  // it, so it is passed through with the frame policy attached and never
  // resolved against the domain table. Handling it before the hostname branch
  // keeps custom-domain behaviour on these paths exactly as it was.
  if (request.nextUrl.pathname.startsWith("/preview/")) {
    return withEmbedFrameCsp(
      NextResponse.next({ request: { headers: upstreamHeaders } }),
    );
  }

  const hostname = requestHostname(request.headers);
  if (!hostname || platformHostnames().has(hostname)) {
    return NextResponse.next({ request: { headers: upstreamHeaders } });
  }

  // A niche's own marketing domain — restofront.com today, a nails or barber
  // domain tomorrow. Resolved from the vertical registry rather than from the
  // domain table: these hostnames belong to the factory, not to a customer, so
  // they must never be claimable through the custom-domain flow below, and
  // answering here also spares them a database round trip on every request.
  const niche = resolveVerticalByHostname(hostname);
  if (niche) {
    // The locale segment is dropped deliberately: a niche's marketing copy lives
    // in its config in one language, unlike a generated site, so `/fr` here
    // serves the same page rather than 404ing on a URL a visitor may well try.
    return NextResponse.rewrite(
      new URL(`/niche/${verticalSlug(niche)}`, request.url),
      { request: { headers: upstreamHeaders } },
    );
  }

  const domain = await getDb().domain.findFirst({
    where: { hostname, verified: true },
    select: {
      site: {
        select: {
          slug: true,
        },
      },
    },
  });
  if (!domain) return new NextResponse("Not found", { status: 404 });

  const locale = request.nextUrl.pathname.match(/^\/([a-z]{2})\/?$/i)?.[1];
  const destination = locale
    ? `/preview/${domain.site.slug}/${locale.toLowerCase()}`
    : `/preview/${domain.site.slug}`;
  upstreamHeaders.set(LIVE_SITE_SLUG_HEADER, domain.site.slug);
  // The rewrite target is a preview route, so the frame policy rides along here
  // too — the visitor's URL never says `/preview`, but the page it gets is the
  // one that may embed a booking widget.
  return withEmbedFrameCsp(
    NextResponse.rewrite(new URL(destination, request.url), {
      request: { headers: upstreamHeaders },
    }),
  );
}

export const config = {
  matcher: ["/", "/:locale([a-zA-Z]{2})", "/preview/:path*"],
};
