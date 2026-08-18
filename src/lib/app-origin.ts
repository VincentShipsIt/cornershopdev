/**
 * The app's own origin for absolute links (email bodies, claim URLs). Runs
 * from lib/workflow code, never a request context, so there is no
 * `request.url` to fall back to.
 *
 * Kept in its own module, free of `"server-only"` and any other imports: both
 * `outreach.ts` and `lead-outreach.ts` (a `"use workflow"` file) need it, and
 * importing it through a `"server-only"`-tainted module would drag that
 * module's full graph into the workflow orchestrator bundle, which only
 * tree-shakes cleanly when nothing it imports carries a side-effecting
 * top-level import.
 */
export function appOrigin(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cornershop.dev";
  return appUrl.replace(/\/$/, "");
}
