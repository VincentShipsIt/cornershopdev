import { listVerticalIds, resolveVerticalConfig } from "@/lib/verticals/registry";
import { platformHostnames } from "@/lib/hostnames";

type AuthEnvironment = Record<string, string | undefined>;

export function resolveBetterAuthSecret(
  environment: AuthEnvironment = process.env,
): string {
  const secret =
    environment.BETTER_AUTH_SECRET ??
    (environment.NODE_ENV === "production"
      ? undefined
      : environment.CLAIM_TOKEN_SECRET);
  if (
    secret &&
    secret.length >= 32 &&
    (environment.NODE_ENV !== "production" ||
      secret !== environment.CLAIM_TOKEN_SECRET)
  ) {
    return secret;
  }
  if (environment.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET must be distinct and contain at least 32 characters",
    );
  }
  return "cornershopdev-better-auth-development-secret";
}

export function betterAuthAllowedHosts(
  environment: AuthEnvironment = process.env,
): string[] {
  const hosts = new Set<string>();
  const configuredUrl = environment.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    try {
      hosts.add(new URL(configuredUrl).hostname);
    } catch {
      // Platform readiness reports malformed deployment URLs.
    }
  }
  for (const hostname of platformHostnames(environment.PLATFORM_HOSTNAMES)) {
    hosts.add(hostname);
  }
  for (const id of listVerticalIds()) {
    for (const hostname of resolveVerticalConfig(id).marketing.hostnames) {
      hosts.add(hostname);
    }
  }
  if (environment.NODE_ENV !== "production") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }
  return [...hosts].sort();
}

export function betterAuthTrustedOrigins(
  environment: AuthEnvironment = process.env,
): string[] {
  const origins = new Set<string>();
  if (environment.NEXT_PUBLIC_APP_URL) {
    try {
      origins.add(new URL(environment.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      // Platform readiness reports malformed deployment URLs.
    }
  }
  for (const host of betterAuthAllowedHosts(environment)) {
    if (host === "localhost" || host === "127.0.0.1") {
      origins.add(`http://${host}:3000`);
    } else {
      origins.add(`https://${host}`);
    }
  }
  return [...origins].sort();
}
