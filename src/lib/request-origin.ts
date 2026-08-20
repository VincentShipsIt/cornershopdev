type OriginEnvironment = Record<string, string | undefined>;

/**
 * Browser mutations may carry an authenticated operator cookie or a bearer
 * invitation token. Rejecting an explicit cross-origin request prevents either
 * credential from being exercised by another site. Non-browser clients without
 * Origin remain valid for public bearer-token routes; operator routes opt into
 * requiring Origin because their cookie is ambient authority.
 */
export function isSameOriginMutation(
  request: Request,
  options: {
    requireOrigin?: boolean;
    environment?: OriginEnvironment;
  } = {},
): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return !options.requireOrigin;

  const allowedOrigins = new Set([new URL(request.url).origin]);
  const configuredUrl = (
    options.environment ?? process.env
  ).NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    try {
      allowedOrigins.add(new URL(configuredUrl).origin);
    } catch {
      return false;
    }
  }

  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

/**
 * A no-referrer document serializes the Origin of its form POST as `null`.
 * Accept that browser behavior only when Fetch Metadata proves this is a
 * user-activated navigation from the same origin. The caller must still bind
 * the mutation to an unguessable, SameSite credential such as the pending
 * magic-link cookie.
 */
export function isTrustedSameOriginFormPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== "null") {
    return isSameOriginMutation(request, { requireOrigin: true });
  }

  return (
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("sec-fetch-mode") === "navigate" &&
    request.headers.get("sec-fetch-dest") === "document" &&
    request.headers.get("sec-fetch-user") === "?1"
  );
}
