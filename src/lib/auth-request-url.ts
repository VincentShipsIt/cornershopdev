import { betterAuthAllowedHosts } from "@/lib/better-auth-config";
import { requestHostname } from "@/lib/request-hostname";

type AuthRequestEnvironment = Record<string, string | undefined>;
type AuthRequest = Pick<Request, "headers" | "url">;

const FACTORY_ORIGIN = "https://cornershop.dev";

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function fallbackOrigin(environment: AuthRequestEnvironment): string {
  const configured = environment.NEXT_PUBLIC_APP_URL;
  if (!configured) return FACTORY_ORIGIN;
  try {
    const url = new URL(configured);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : FACTORY_ORIGIN;
  } catch {
    return FACTORY_ORIGIN;
  }
}

/**
 * Resolves the browser-facing origin for auth redirects and internal Better Auth
 * requests. Next sees the container address in `request.url` behind Caddy, so
 * using that URL directly leaks `0.0.0.0:3000` into Location headers.
 *
 * The forwarded hostname is accepted only when it is already in Better Auth's
 * host allow-list. This keeps proxy metadata from becoming an open redirect.
 */
export function resolveAuthRequestOrigin(
  request: AuthRequest,
  environment: AuthRequestEnvironment = process.env,
): string {
  const hostname = requestHostname(request.headers);
  const allowedHosts = new Set(betterAuthAllowedHosts(environment));
  if (!hostname || !allowedHosts.has(hostname)) {
    return fallbackOrigin(environment);
  }

  if (environment.NODE_ENV === "production") {
    return `https://${hostname}`;
  }

  const forwardedProtocol = firstHeaderValue(
    request.headers.get("x-forwarded-proto"),
  );
  const requestProtocol = (() => {
    try {
      return new URL(request.url).protocol.replace(":", "");
    } catch {
      return "http";
    }
  })();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : requestProtocol === "https"
        ? "https"
        : "http";
  const forwardedHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host"));

  try {
    const origin = new URL(`${protocol}://${forwardedHost}`);
    return requestHostname(new Headers({ host: origin.host })) === hostname
      ? origin.origin
      : fallbackOrigin(environment);
  } catch {
    return fallbackOrigin(environment);
  }
}

export function authRequestUrl(path: string, request: AuthRequest): URL {
  return new URL(path, resolveAuthRequestOrigin(request));
}

/**
 * Builds headers for a server-owned Better Auth mutation. Browser navigation
 * metadata is intentionally not forwarded: Stripe returns can carry an
 * external Origin even though the wrapper already authenticated the signed
 * single-use credential.
 */
export function internalAuthMutationHeaders(request: AuthRequest): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    origin: resolveAuthRequestOrigin(request),
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("user-agent", userAgent);
  return headers;
}

/** Preserves Better Auth cookie mutations while redirecting to a safe URL. */
export function authMutationRedirectResponse(
  response: Response,
  destination: URL,
): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  headers.set("location", destination.toString());
  return new Response(null, { status: 303, headers });
}
