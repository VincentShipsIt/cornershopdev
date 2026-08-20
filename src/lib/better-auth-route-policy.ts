const publicMagicLinkSignInPath = "/api/auth/sign-in/magic-link";
const publicMagicLinkVerifyPath = "/api/auth/magic-link/verify";
const internalCheckoutBootstrapPath = "/api/auth/checkout/bootstrap";
const internalWorkspaceSelectionPath = "/api/auth/workspace/select";

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
      (normalizedPath === internalCheckoutBootstrapPath ||
        normalizedPath === internalWorkspaceSelectionPath)) ||
    (normalizedMethod === "GET" &&
      normalizedPath === publicMagicLinkVerifyPath)
  );
}
