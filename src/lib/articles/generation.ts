import { z } from "zod";
import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  checkArticleDraft,
  selectBatchTopics,
  type GeneratedArticleDraft,
} from "@/lib/articles/composer";
import type { SiteFacts } from "@/lib/articles/site-facts";
import {
  articleTopicPlanByKey,
  articleTopicPlansFor,
} from "@/lib/articles/topic-plans";
import { getDb } from "@/lib/db";

/**
 * Mirrors the site generator's provider policy: one OpenRouter key gates
 * everything, and customer content only routes to providers that neither
 * retain nor train on prompts.
 */
export function articleGenerationConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function getModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return createOpenRouter({
    apiKey,
    compatibility: "strict",
    headers: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "https://cornershop.dev",
      "X-Title": "Cornershopdev",
    },
  }).chat(process.env.OPENROUTER_TEXT_MODEL ?? "openrouter/auto", {
    extraBody: {
      provider: { require_parameters: true, data_collection: "deny" },
      plugins: [{ id: "response-healing" }],
    },
    usage: { include: true },
  });
}

const articleBatchOutputSchema = z.object({
  articles: z.array(
    z.object({
      topicKey: z.string(),
      slug: z.string(),
      title: z.string(),
      excerpt: z.string(),
      bodyMarkdown: z.string(),
    }),
  ),
});

function buildPrompt(input: {
  facts: SiteFacts;
  topics: Array<{ key: string; title: string }>;
}): string {
  const { facts, topics } = input;
  const lines = [
    `You are writing blog articles for "${facts.name}", a real local business.`,
    "",
    "Verified facts you may use — never contradict or extend them:",
    `- Address: ${facts.address ?? "none published"}`,
    `- Phone: ${facts.phone ?? "none published"}`,
    `- Hours: ${
      facts.businessHours
        .map((entry) => `${entry.days} ${entry.hours}`)
        .join("; ") || "none published"
    }`,
    `- Catalog items: ${facts.catalogItemNames.join(", ") || "none listed"}`,
    `- Booking/ordering options: ${facts.integrationLabels.join(", ") || "none"}`,
    "",
    "Rules:",
    "- Never invent awards, rankings, certifications, prices, staff names, suppliers, reviews, or statistics.",
    "- Every catalog item mentioned by name must appear in the list above.",
    `- Write in ${facts.locale === "fr" ? "French" : "English"} for a local audience.`,
    "- Body is GitHub-flavoured markdown with at most two headings and no images.",
    "- slug must be kebab-case ASCII.",
    "- Do not include the business's address or phone inside the body; the site chrome already shows them.",
    "",
    "Write exactly one article per requested topic:",
    ...topics.map((topic) => `- [${topic.key}] ${topic.title}`),
    "",
    "Return JSON: {\"articles\":[{topicKey,slug,title,excerpt,bodyMarkdown}]}",
  ];
  return lines.join("\n");
}

export async function generateBatchDrafts(input: {
  facts: SiteFacts;
  count: number;
  recentTopicKeys: string[];
}): Promise<GeneratedArticleDraft[]> {
  if (!articleGenerationConfigured()) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  const plans = articleTopicPlansFor(input.facts.vertical);
  const selected = selectBatchTopics({
    facts: input.facts,
    plans,
    count: input.count,
    recentTopicKeys: input.recentTopicKeys,
  });
  if (!selected.length) return [];

  const topics = selected.flatMap((topic) => {
    const plan = articleTopicPlanByKey(input.facts.vertical, topic.key);
    return plan ? [{ key: plan.key, title: plan.title }] : [];
  });

  const { output } = await generateText({
    model: getModel(),
    output: Output.object({
      schema: articleBatchOutputSchema,
      name: "site_article_batch",
      description: "Locally relevant blog articles for one real business",
    }),
    maxRetries: 2,
    timeout: { totalMs: 55_000, stepMs: 45_000 },
    prompt: buildPrompt({ facts: input.facts, topics }),
  });

  const allowed = new Set(topics.map((topic) => topic.key));
  return output.articles
    .slice(0, topics.length)
    .filter(
      (draft): draft is GeneratedArticleDraft =>
        typeof draft.topicKey === "string" && allowed.has(draft.topicKey),
    );
}

export type PersistedBatch = {
  batchId: string;
  producedCount: number;
};

/**
 * Persists guardrail-passing drafts as DRAFT articles under a new batch row.
 * Rejected drafts shrink the batch silently — they are recorded on the batch
 * row via producedCount < requestedCount so the operator sees the shortfall.
 */
export async function persistArticleBatch(input: {
  siteId: string;
  requestedBy: string;
  facts: SiteFacts;
  drafts: GeneratedArticleDraft[];
  model?: string | null;
}): Promise<PersistedBatch> {
  const db = getDb();
  const accepted = input.drafts.filter(
    (draft) => !checkArticleDraft(draft, input.facts).length,
  );

  const existingSlugs = new Set(
    (
      await db.article.findMany({
        where: { siteId: input.siteId },
        select: { slug: true },
      })
    ).map((row) => row.slug),
  );

  return db.$transaction(async (transaction) => {
    const batch = await transaction.articleBatch.create({
      data: {
        siteId: input.siteId,
        requestedCount: input.drafts.length,
        producedCount: accepted.length,
        model: input.model ?? null,
        requestedBy: input.requestedBy,
        completedAt: new Date(),
      },
      select: { id: true },
    });
    let produced = 0;
    for (const draft of accepted) {
      const slug = dedupeSlug(draft.slug, existingSlugs);
      existingSlugs.add(slug);
      await transaction.article.create({
        data: {
          siteId: input.siteId,
          batchId: batch.id,
          slug,
          locale: input.facts.locale,
          title: draft.title.trim(),
          excerpt: draft.excerpt.trim(),
          bodyMarkdown: draft.bodyMarkdown,
          status: "DRAFT",
          topicKey: draft.topicKey,
          topicTitle:
            articleTopicPlanByKey(input.facts.vertical, draft.topicKey)?.title ??
            draft.topicKey,
          generatedByModel: input.model ?? null,
          sourceBatchId: batch.id,
        },
        select: { id: true },
      });
      produced += 1;
    }
    await transaction.articleBatch.update({
      where: { id: batch.id },
      data: { producedCount: produced },
    });
    return { batchId: batch.id, producedCount: produced };
  });
}

/** Reads the fact slice + recent topics used for generation in one pass. */
export async function loadGenerationInputs(siteId: string): Promise<{
  ok: true;
  facts: SiteFacts;
  recentTopicKeys: string[];
} | { ok: false; reason: string }> {
  const db = getDb();
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      slug: true,
      name: true,
      vertical: true,
      defaultLocale: true,
      address: true,
      phone: true,
      businessHours: true,
      status: true,
    },
  });
  if (!site) return { ok: false, reason: "Site not found." };
  if (site.status !== "CLAIMED" && site.status !== "LIVE") {
    return { ok: false, reason: "Only claimed sites can accumulate content." };
  }

  const [sections, integrations, recentBatches] = await Promise.all([
    db.catalogSection.findMany({
      where: { siteId },
      orderBy: { position: "asc" },
      select: {
        items: { select: { name: true }, orderBy: { position: "asc" } },
      },
    }),
    db.integration.findMany({
      where: { siteId },
      select: { label: true },
      orderBy: { label: "asc" },
    }),
    // The dedupe contract is "topics covered by the two most recent batches",
    // so read batches first and expand from there — scanning articles by
    // recency would let a site with many old articles dilute the window.
    db.articleBatch.findMany({
      where: { siteId, completedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: {
        articles: {
          where: { status: { in: ["DRAFT", "PUBLISHED"] } },
          select: { topicKey: true },
        },
      },
    }),
  ]);

  const recentTopicKeys = [
    ...new Set(recentBatches.flatMap((batch) => batch.articles.map((a) => a.topicKey))),
  ];

  const businessHours = Array.isArray(site.businessHours)
    ? (site.businessHours as Array<{ days?: unknown; hours?: unknown }>).flatMap(
        (entry) =>
          typeof entry?.days === "string" && typeof entry?.hours === "string"
            ? [{ days: entry.days, hours: entry.hours }]
            : [],
      )
    : [];

  return {
    ok: true,
    facts: {
      slug: site.slug,
      name: site.name,
      vertical: site.vertical,
      locale: site.defaultLocale,
      address: site.address,
      phone: site.phone,
      businessHours,
      catalogItemNames: sections.flatMap((section) =>
        section.items.map((item) => item.name),
      ),
      integrationLabels: integrations.map((integration) => integration.label),
    },
    recentTopicKeys,
  };
}

function dedupeSlug(slug: string, taken: Set<string>): string {
  const base = slug.trim().toLowerCase();
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}
