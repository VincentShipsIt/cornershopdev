const publicMagicLinkSignInPath = "/api/auth/sign-in/magic-link";
const publicMagicLinkVerifyPath = "/api/auth/magic-link/verify";
const internalCheckoutBootstrapPath = "/api/auth/checkout/bootstrap";

export function isBlockedDirectBetterAuthRoute(
  method: string,
  pathname: string,
): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    (normalizedMethod === "POST" &&
      normalizedPath === publicMagicLinkSignInPath) ||
    (normalizedMethod === "POST" &&
      normalizedPath === internalCheckoutBootstrapPath) ||
    (normalizedMethod === "GET" &&
      normalizedPath === publicMagicLinkVerifyPath)
  );
}
