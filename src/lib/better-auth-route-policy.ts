import { authRequestUrl } from "@/lib/auth-request-url";

const publicMagicLinkSignInPath = "/api/auth/sign-in/magic-link";
const publicMagicLinkVerifyPath = "/api/auth/magic-link/verify";
const internalCheckoutBootstrapPath = "/api/auth/checkout/bootstrap";
const internalWorkspaceSelectionPath = "/api/auth/workspace/select";
export const blockedDirectSessionRevocationPaths = [
  "/api/auth/sign-out",
  "/api/auth/revoke-session",
  "/api/auth/revoke-sessions",
  "/api/auth/revoke-other-sessions",
] as const;

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
      blockedDirectSessionRevocationPaths.some(
        (path) => path === normalizedPath,
      )) ||
    (normalizedMethod === "POST" &&
      (normalizedPath === internalCheckoutBootstrapPath ||
        normalizedPath === internalWorkspaceSelectionPath)) ||
    (normalizedMethod === "GET" &&
      normalizedPath === publicMagicLinkVerifyPath)
  );
}

export async function dispatchBetterAuthCatchallRequest(
  request: Request,
  forward: () => Response | Promise<Response>,
): Promise<Response> {
  if (
    !isBlockedDirectBetterAuthRoute(
      request.method,
      new URL(request.url).pathname,
    )
  ) {
    return forward();
  }
  if (request.method.toUpperCase() === "GET") {
    return Response.redirect(
      authRequestUrl("/sign-in?error=invalid-link", request),
      303,
    );
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}
