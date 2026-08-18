/**
 * The `Site` statuses a lead can still be acted on in — imported by outreach
 * (a `"use workflow"` file, see `src/workflows/lead-outreach.ts`) and by
 * `operator-leads.ts`. Kept in its own module, free of `"server-only"` and
 * any other imports: pulling this constant in through either of those files
 * directly would drag their full module graph (Prisma, the crawler) into the
 * workflow orchestrator bundle, which only tree-shakes cleanly when nothing
 * it imports carries a side-effecting top-level import.
 */
export const mutableLeadStatuses = new Set(["PROSPECT", "PREVIEW_READY"]);
