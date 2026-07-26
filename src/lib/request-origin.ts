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
