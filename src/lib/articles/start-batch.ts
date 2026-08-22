import { getDb } from "@/lib/db";
import { articleGenerationConfigured } from "@/lib/articles/generation";

/**
 * Starts a durable article-batch run for a site after the cheap preflight
 * checks the workflow itself would only discover mid-run. Kept beside the
 * route so both the owner dashboard and any future operator trigger share
 * one gate set.
 */
export async function startArticleBatch(input: {
  siteId: string;
  slug: string;
  requestedBy: string;
  count: number;
}): Promise<
  | { ok: true; runId: string }
  | { ok: false; status: 400 | 404 | 409 | 503; reason: string }
> {
  if (!articleGenerationConfigured()) {
    return {
      ok: false,
      status: 503,
      reason: "Article generation is not configured.",
    };
  }
  const db = getDb();
  const site = await db.site.findUnique({
    where: { id: input.siteId },
    select: { status: true, organizationId: true },
  });
  if (!site) return { ok: false, status: 404, reason: "Site not found." };
  if (site.status !== "CLAIMED" && site.status !== "LIVE") {
    return {
      ok: false,
      status: 409,
      reason: "Articles are available once the site is claimed.",
    };
  }
  // Pro-plan cadence gate: one in-flight or completed batch per rolling
  // 7-day window unless the site has an active subscription.
  const [recentBatch, subscription] = await Promise.all([
    db.articleBatch.findFirst({
      where: {
        siteId: input.siteId,
        createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
      },
      select: { id: true },
    }),
    db.subscription.findUnique({
      where: { siteId: input.siteId },
      select: { status: true },
    }),
  ]);
  const paid = subscription?.status === "ACTIVE";
  if (recentBatch && !paid) {
    return {
      ok: false,
      status: 409,
      reason:
        "A batch was generated in the last 7 days. Upgrade to generate more.",
    };
  }

  const { start } = await import("workflow/api");
  const { articleBatchWorkflow } = await import("@/workflows/article-batch");
  const run = await start(articleBatchWorkflow, [
    {
      siteId: input.siteId,
      requestedBy: input.requestedBy,
      count: input.count,
    },
  ]);
  return { ok: true, runId: run.runId };
}
