import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

mock.module("server-only", () => ({}));

const enabled = process.env.ARTICLES_POSTGRES_TEST === "1";
const siteId = `articles-test-${randomUUID()}`;
let db: ReturnType<typeof import("@/lib/db").getDb>;
let loadGenerationInputs: typeof import("@/lib/articles/generation").loadGenerationInputs;
let persistArticleBatch: typeof import("@/lib/articles/generation").persistArticleBatch;

/**
 * PostgreSQL-gated integration coverage for the article engine's persistence
 * half: topic-window extraction (the last-two-batches contract), slug
 * deduplication across batches, and guardrail enforcement at the write path.
 * The model round-trip is not exercised here — it needs OPENROUTER_API_KEY
 * and is covered by the prompt/schema contract in the unit tests.
 */
describe.skipIf(!enabled)("articles PostgreSQL integration", () => {
  beforeAll(async () => {
    const generation = await import("@/lib/articles/generation");
    const database = await import("@/lib/db");
    db = database.getDb();
    loadGenerationInputs = generation.loadGenerationInputs;
    persistArticleBatch = generation.persistArticleBatch;

    await db.site.create({
      data: {
        id: siteId,
        slug: `articles-site-${randomUUID()}`,
        name: "Le Petit Meunier",
        status: "CLAIMED",
        address: "12 Rue du Four, Paris",
        phone: "+33 1 42 00 00 00",
        defaultLocale: "fr",
        catalogSections: {
          create: [
            {
              name: "Viennoiseries",
              position: 0,
              items: {
                create: [
                  { name: "Croissant", position: 0 },
                  { name: "Pain au chocolat", position: 1 },
                ],
              },
            },
          ],
        },
        integrations: {
          create: [{ type: "BOOKING", label: "Book a table", url: "https://book.example", position: 0 }],
        },
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    if (!enabled) return;
    await db.site.delete({ where: { id: siteId } }).catch(() => undefined);
  });

  test("loads facts from the live draft relations", async () => {
    const inputs = await loadGenerationInputs(siteId);
    if (!inputs.ok) throw new Error(inputs.reason);
    expect(inputs.facts.catalogItemNames).toContain("Croissant");
    expect(inputs.facts.integrationLabels).toEqual(["Book a table"]);
    expect(inputs.facts.address).toBe("12 Rue du Four, Paris");
    expect(inputs.recentTopicKeys).toEqual([]);
  });

  test("refuses unclaimed sites", async () => {
    const prospect = await db.site.create({
      data: { id: `articles-prospect-${randomUUID()}`, slug: `prospect-${randomUUID()}`, name: "Prospect" },
      select: { id: true },
    });
    const inputs = await loadGenerationInputs(prospect.id);
    expect(inputs.ok).toBe(false);
    await db.site.delete({ where: { id: prospect.id } });
  });

  test("persists a batch as drafts with a completed batch row", async () => {
    const inputs = await loadGenerationInputs(siteId);
    if (!inputs.ok) throw new Error(inputs.reason);

    const persisted = await persistArticleBatch({
      siteId,
      requestedBy: "test-operator",
      facts: inputs.facts,
      model: "test-model",
      drafts: [
        {
          topicKey: "seasonal-menu",
          slug: "seasonal-menu-update",
          title: "In season now",
          excerpt: "What the ovens are doing this month.",
          bodyMarkdown:
            "Our croissant lamination stays the same all year. ".repeat(20),
        },
        {
          topicKey: "neighbourhood-guide",
          slug: "where-to-find-us",
          title: "Find us in the fifth",
          excerpt: "Directions and what is nearby.",
          bodyMarkdown:
            "We are on Rue du Four between the bakery and the bookshop. ".repeat(
              15,
            ),
        },
      ],
    });

    expect(persisted.producedCount).toBe(2);
    const rows = await db.article.findMany({ where: { siteId } });
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.status).toBe("DRAFT");
      expect(row.batchId).toBe(persisted.batchId);
      expect(row.sourceBatchId).toBe(persisted.batchId);
    }
  });

  test("dedupes slugs across batches", async () => {
    const inputs = await loadGenerationInputs(siteId);
    if (!inputs.ok) throw new Error(inputs.reason);

    const persisted = await persistArticleBatch({
      siteId,
      requestedBy: "test-operator",
      facts: inputs.facts,
      drafts: [
        {
          topicKey: "dietary-faqs",
          slug: "seasonal-menu-update",
          title: "Same slug, different article",
          excerpt: "Slug collision test.",
          bodyMarkdown: "Gluten-free options exist for every item. ".repeat(15),
        },
      ],
    });
    expect(persisted.producedCount).toBe(1);

    const slugs = (
      await db.article.findMany({
        where: { siteId },
        select: { slug: true },
      })
    ).map((row) => row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("seasonal-menu-update-2");
  });

  test("extracts exactly the last two batches' topics for dedupe", async () => {
    // Third batch; only batch two's and batch three's topics may appear.
    const inputs = await loadGenerationInputs(siteId);
    if (!inputs.ok) throw new Error(inputs.reason);
    await persistArticleBatch({
      siteId,
      requestedBy: "test-operator",
      facts: inputs.facts,
      drafts: [
        {
          topicKey: "chef-story",
          slug: "our-kitchen",
          title: "Our kitchen",
          excerpt: "Suppliers and method.",
          bodyMarkdown: "Butter arrives twice weekly from two dairies. ".repeat(12),
        },
      ],
    });

    const afterThird = await loadGenerationInputs(siteId);
    if (!afterThird.ok) throw new Error(afterThird.reason);
    // Batch 2 (dietary-faqs) + batch 3 (chef-story); batch 1 must be excluded.
    expect([...afterThird.recentTopicKeys].sort()).toEqual(
      ["chef-story", "dietary-faqs"].sort(),
    );
  });

  test("guardrails shrink the batch instead of failing it", async () => {
    const inputs = await loadGenerationInputs(siteId);
    if (!inputs.ok) throw new Error(inputs.reason);
    const persisted = await persistArticleBatch({
      siteId,
      requestedBy: "test-operator",
      facts: inputs.facts,
      drafts: [
        {
          topicKey: "trends",
          slug: "award-winning-bakes",
          title: "Award winning bakes",
          excerpt: "This should never persist.",
          bodyMarkdown: "We are award winning and certified organic. ".repeat(10),
        },
      ],
    });
    expect(persisted.producedCount).toBe(0);
    expect(await db.article.count({ where: { siteId, topicKey: "trends" } })).toBe(0);
  });

  test("publishing an article makes it visible to the public reader", async () => {
    const { listPublishedArticles, getPublishedArticle } = await import(
      "@/lib/articles/public-articles"
    );
    const slugRow = await db.article.findFirstOrThrow({
      where: { siteId, topicKey: "seasonal-menu" },
      select: { slug: true },
    });

    const site = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: { slug: true },
    });

    // Unattested surface sees nothing.
    expect(
      await listPublishedArticles({ slug: site!.slug, versionId: null }),
    ).toEqual([]);

    // Drafts are invisible even with attestation.
    expect(
      await listPublishedArticles({ slug: site!.slug, versionId: "sv_any" }),
    ).toEqual([]);

    await db.article.updateMany({
      where: { siteId, topicKey: "seasonal-menu" },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });

    const published = await listPublishedArticles({
      slug: site!.slug,
      versionId: "sv_any",
    });
    expect(published.length).toBe(1);
    expect(published[0]!.slug).toBe(slugRow.slug);

    const one = await getPublishedArticle({
      slug: site!.slug,
      versionId: "sv_any",
      articleSlug: slugRow.slug,
    });
    expect(one?.title).toBeTruthy();
  });
});
