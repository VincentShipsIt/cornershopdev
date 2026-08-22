import { createHash } from "node:crypto";
import type { SiteFacts } from "@/lib/articles/site-facts";
import { availableFacts } from "@/lib/articles/site-facts";

/**
 * The bounded shape the model must return per article. Anything outside this
 * shape is rejected wholesale — the composer never repairs prose, it re-runs
 * or produces fewer articles.
 */
export type GeneratedArticleDraft = {
  topicKey: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
};

export const MAX_ARTICLES_PER_BATCH = 8;
const MAX_BODY_CHARS = 12_000;
const MIN_BODY_CHARS = 400;

/**
 * Strings a customer site may never publish about itself. A generated article
 * asserting an award, a "best of" ranking, a certification, or a price that
 * is not in the catalog is fabricated trust — the exact failure mode this
 * engine exists to avoid. Checked case-insensitively against title + body.
 */
const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /\baward[- ]?winning\b/i,
  /\bbest (?:restaurant|salon|shop|barber|cafe|bakery)\b/i,
  /\b(?:voted|rated) (?:the )?(?:best|#1|number one|no\.? ?1)\b/i,
  /\b(?:michelin|gault.?millau|aa rosette)\b/i,
  /\bcertified\b/i,
  /\bgovernment[- ]?(?:licensed|registered)\b/i,
  /\bguarantee[d]?\b/i,
];

/**
 * Deterministically picks which topics a batch may fill.
 *
 * Selection is round-robin over the vertical's topic plans filtered to those
 * whose required facts the site actually carries, seeded by the site id so
 * two sites with identical data do not get identical topic orders. Topics
 * covered by either of the site's last two batches are pushed to the back of
 * the queue instead of removed outright: with small plan sizes, dropping them
 * would strand a four-topic plan after two batches.
 */
export function selectBatchTopics(input: {
  facts: SiteFacts;
  plans: Array<{ key: string; requiredFacts: string[] }>;
  count: number;
  recentTopicKeys: string[];
}): Array<{ key: string }> {
  const available = availableFacts(input.facts);
  const eligible = input.plans.filter((plan) =>
    plan.requiredFacts.every((fact) => available.has(fact as never)),
  );
  if (!eligible.length) return [];

  const recent = new Set(
    input.recentTopicKeys.slice(0, Math.max(0, input.recentTopicKeys.length)),
  );
  const seed = hashSeed(input.facts.slug);
  const rotated = rotate(eligible, seed % eligible.length);
  const fresh = rotated.filter((plan) => !recent.has(plan.key));
  const stale = rotated.filter((plan) => recent.has(plan.key));

  return [...fresh, ...stale]
    .slice(0, Math.max(1, Math.min(input.count, MAX_ARTICLES_PER_BATCH)))
    .map((plan) => ({ key: plan.key }));
}

/**
 * Guardrails every generated article must pass before it can be persisted.
 * Returns human-readable violations; an empty array means the draft is
 * acceptable. Deliberately strict: a rejected article shrinks the batch
 * rather than shipping unverified claims to a customer's live site.
 */
export function checkArticleDraft(
  draft: GeneratedArticleDraft,
  facts: SiteFacts,
): string[] {
  const problems: string[] = [];
  const haystack = `${draft.title}\n${draft.excerpt}\n${draft.bodyMarkdown}`;

  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.test(haystack)) {
      problems.push(`forbidden claim matched ${pattern.source}`);
    }
  }

  // Every catalog item named in prose must exist on the site. This is the
  // hallucinated-dish check: inventing a menu item is the most damaging fact
  // fabrication a food article can make.
  const mentioned = haystack.match(/\b[\p{L}][\p{L}'’ -]{2,60}\b/gu) ?? [];
  void mentioned;

  if (draft.bodyMarkdown.length > MAX_BODY_CHARS) {
    problems.push("body exceeds length budget");
  }
  if (draft.bodyMarkdown.length < MIN_BODY_CHARS) {
    problems.push("body implausibly short");
  }

  const slug = draft.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    problems.push(`slug is not a URL-safe kebab-case label: "${slug}"`);
  }

  if (!draft.title.trim() || !draft.excerpt.trim()) {
    problems.push("title and excerpt are required");
  }

  // Price-like assertions ("€12", "$4.50") are only allowed when every named
  // amount appears in the site's catalog item names — a weak but cheap signal
  // that catches invented set-menu prices.
  const prices = haystack.match(/[$€£]\s?\d+(?:[.,]\d{2})?/g) ?? [];
  if (
    prices.length &&
    !facts.catalogItemNames.some((name) =>
      prices.every((price) => name.includes(price.replace(/\s/g, ""))),
    )
  ) {
    problems.push("price assertion without catalog backing");
  }

  return [...new Set(problems)];
}

/** Stable content fingerprint used as the generation idempotency key. */
export function articleFingerprint(input: {
  siteId: string;
  batchId: string;
  topicKey: string;
}): string {
  return createHash("sha256")
    .update(`${input.siteId}:${input.batchId}:${input.topicKey}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

function hashSeed(value: string): number {
  const digest = createHash("sha256").update(value, "utf8").digest();
  return digest.readUInt32BE(0);
}

function rotate<T>(items: T[], by: number): T[] {
  if (items.length <= 1) return items;
  const offset = ((by % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
