import { describe, expect, it } from "bun:test";
import {
  articleFingerprint,
  checkArticleDraft,
  selectBatchTopics,
} from "@/lib/articles/composer";
import type { SiteFacts } from "@/lib/articles/site-facts";
import { availableFacts } from "@/lib/articles/site-facts";

const facts: SiteFacts = {
  slug: "le-petit-meunier",
  name: "Le Petit Meunier",
  vertical: "RESTAURANT",
  locale: "fr",
  address: "12 Rue du Four, 75005 Paris",
  phone: "+33 1 42 00 00 00",
  businessHours: [{ days: "Tue–Sat", hours: "12:00–22:00" }],
  catalogItemNames: ["Croissant", "Pain au chocolat"],
  integrationLabels: ["Book a table"],
};

describe("availableFacts", () => {
  it("marks facts present only when non-empty", () => {
    const available = availableFacts(facts);
    expect(available.has("catalogItems")).toBe(true);
    expect(available.has("address")).toBe(true);
    expect(available.has("businessHours")).toBe(true);
    expect(available.has("phone")).toBe(true);
    expect(available.has("integrations")).toBe(true);
  });

  it("withholds facts that are blank strings or empty arrays", () => {
    const sparse = availableFacts({
      ...facts,
      address: "   ",
      businessHours: [],
      catalogItemNames: [],
      integrationLabels: [],
      phone: null,
    });
    expect([...sparse]).toEqual([]);
  });
});

describe("selectBatchTopics", () => {
  const plans = [
    { key: "seasonal-menu", requiredFacts: ["catalogItems"] },
    { key: "neighbourhood-guide", requiredFacts: ["address"] },
    { key: "private-events", requiredFacts: ["phone", "integrations"] },
    { key: "first-visit", requiredFacts: ["businessHours", "address"] },
  ];

  it("never selects a topic whose required facts are missing", () => {
    const selected = selectBatchTopics({
      facts: { ...facts, phone: null, integrationLabels: [] },
      plans,
      count: 4,
      recentTopicKeys: [],
    });

    expect(selected.map((topic) => topic.key)).not.toContain("private-events");
  });

  it("caps the batch size", () => {
    const selected = selectBatchTopics({
      facts,
      plans,
      count: 99,
      recentTopicKeys: [],
    });
    expect(selected.length).toBeLessThanOrEqual(8);
  });

  it("avoids topics covered by recent batches when alternatives exist", () => {
    const first = selectBatchTopics({
      facts,
      plans,
      count: 2,
      recentTopicKeys: [],
    });
    const second = selectBatchTopics({
      facts,
      plans,
      count: 2,
      recentTopicKeys: first.map((topic) => topic.key),
    });

    const overlap = second.filter((topic) =>
      first.some((entry) => entry.key === topic.key),
    );
    expect(overlap.length).toBe(0);
  });

  it("returns an empty selection when no topic is supportable", () => {
    expect(
      selectBatchTopics({
        facts: {
          ...facts,
          catalogItemNames: [],
          address: null,
          businessHours: [],
          phone: null,
          integrationLabels: [],
        },
        plans,
        count: 4,
        recentTopicKeys: [],
      }),
    ).toEqual([]);
  });

  it("is deterministic for the same site and inputs", () => {
    const run = () =>
      selectBatchTopics({ facts, plans, count: 3, recentTopicKeys: [] }).map(
        (topic) => topic.key,
      );
    expect(run()).toEqual(run());
  });
});

describe("checkArticleDraft", () => {
  const base = {
    topicKey: "seasonal-menu",
    slug: "what-s-in-season",
    title: "What's in season on our menu right now",
    excerpt: "A look at this month's bakes.",
    bodyMarkdown:
      "Our croissant lamination uses butter from the same two dairies all year. ".repeat(
        10,
      ),
  };

  it("accepts a factual draft", () => {
    expect(checkArticleDraft(base, facts)).toEqual([]);
  });

  it("rejects award claims", () => {
    expect(
      checkArticleDraft(
        { ...base, bodyMarkdown: `${base.bodyMarkdown} We are award-winning.` },
        facts,
      ).some((problem) => problem.startsWith("forbidden claim")),
    ).toBe(true);
  });

  it("rejects fabricated rankings and certifications", () => {
    for (const claim of [
      "Voted the best bakery in Paris.",
      "We are certified organic.",
      "Rated #1 by locals.",
    ]) {
      expect(
        checkArticleDraft(
          { ...base, bodyMarkdown: `${base.bodyMarkdown} ${claim}` },
          facts,
        ).some((problem) => problem.startsWith("forbidden claim")),
      ).toBe(true);
    }
  });

  it("rejects price assertions without catalog backing", () => {
    expect(
      checkArticleDraft(
        {
          ...base,
          bodyMarkdown: `${base.bodyMarkdown} The tasting menu is €95 per person.`,
        },
        facts,
      ).some((problem) => problem.includes("price")),
    ).toBe(true);
  });

  it("enforces the kebab-case slug contract", () => {
    expect(
      checkArticleDraft({ ...base, slug: "Not A Slug" }, facts).some((problem) =>
        problem.includes("slug"),
      ),
    ).toBe(true);
  });

  it("rejects implausibly short bodies", () => {
    expect(
      checkArticleDraft({ ...base, bodyMarkdown: "Come visit us." }, facts).some(
        (problem) => problem.includes("short"),
      ),
    ).toBe(true);
  });
});

describe("articleFingerprint", () => {
  it("is stable and input-sensitive", () => {
    const one = articleFingerprint({
      siteId: "a",
      batchId: "b",
      topicKey: "t",
    });
    expect(one).toBe(
      articleFingerprint({ siteId: "a", batchId: "b", topicKey: "t" }),
    );
    expect(one).not.toBe(
      articleFingerprint({ siteId: "a", batchId: "b2", topicKey: "t" }),
    );
  });
});
