import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ExtractedSite } from "@/lib/importer";
import type { PersistableSiteDraft } from "@/lib/site-persistence";

export type MonitoringField = "MENU" | "CONTACT" | "HOURS" | "LINKS";

export type SourceEvidence = {
  url: string;
  excerpt: string;
  capturedAt: string;
  contentDigest: string;
};

export type MonitoringSuggestionInput = {
  fingerprint: string;
  field: MonitoringField;
  path: string;
  currentValue: Prisma.InputJsonValue;
  suggestedValue: Prisma.InputJsonValue;
  evidence: SourceEvidence[];
};

export function buildSourceMonitoringDiff(input: {
  current: PersistableSiteDraft;
  proposed: PersistableSiteDraft;
  extracted: ExtractedSite;
  checkedLinks: Array<{
    originalUrl: string;
    finalUrl: string;
    status: number;
  }>;
  capturedAt: Date;
}): MonitoringSuggestionInput[] {
  const suggestions: MonitoringSuggestionInput[] = [];
  const contact = {
    address: input.proposed.address,
    phone: input.proposed.phone,
  };
  const currentContact = {
    address: input.current.address,
    phone: input.current.phone,
  };
  const contactEvidence = evidenceForValues(
    input.extracted,
    [contact.address, contact.phone],
    input.capturedAt,
  );
  if (
    !same(currentContact, contact) &&
    hasEvidenceForEveryValue(
      input.extracted.pageText,
      [contact.address, contact.phone],
    )
  ) {
    suggestions.push(
      suggestion("CONTACT", "contact", currentContact, contact, contactEvidence),
    );
  }

  const hoursEvidence = evidenceForValues(
    input.extracted,
    input.proposed.businessHours.flatMap((row) => [row.days, row.hours]),
    input.capturedAt,
  );
  if (
    !same(input.current.businessHours, input.proposed.businessHours) &&
    input.proposed.businessHours.length > 0 &&
    hasEvidenceForEveryValue(
      input.extracted.pageText,
      input.proposed.businessHours.flatMap((row) => [row.days, row.hours]),
    )
  ) {
    suggestions.push(
      suggestion(
        "HOURS",
        "businessHours",
        input.current.businessHours,
        input.proposed.businessHours,
        hoursEvidence,
      ),
    );
  }

  const proposedItemNames = input.proposed.catalogSections.flatMap((section) =>
    section.items.map((item) => item.name),
  );
  if (
    !same(input.current.catalogSections, input.proposed.catalogSections) &&
    proposedItemNames.length > 0 &&
    hasEvidenceForEveryValue(input.extracted.pageText, proposedItemNames)
  ) {
    suggestions.push(
      suggestion(
        "MENU",
        "catalogSections",
        {
          catalogSections: input.current.catalogSections,
          translations: input.current.translations,
        },
        {
          catalogSections: input.proposed.catalogSections,
          translations: structurallyCompatibleTranslations(
            input.current.translations,
            input.proposed.catalogSections,
          ),
        },
        evidenceForValues(
          input.extracted,
          proposedItemNames.slice(0, 8),
          input.capturedAt,
        ),
      ),
    );
  }

  const proposedLinks = mergeLinks(
    input.current.integrations,
    input.extracted.links,
    input.checkedLinks,
  );
  if (!same(input.current.integrations, proposedLinks)) {
    const digest = contentDigest(input.extracted.pageText);
    suggestions.push(
      suggestion(
        "LINKS",
        "integrations",
        {
          integrations: input.current.integrations,
          translations: input.current.translations,
        },
        {
          integrations: proposedLinks,
          translations: integrationCompatibleTranslations(
            input.current.translations,
            proposedLinks.map((link) => link.label),
          ),
        },
        proposedLinks.slice(0, 8).map((link) => ({
          url: input.extracted.sourceUrl ?? input.extracted.source,
          excerpt: `${link.label}: ${link.url}`.slice(0, 280),
          capturedAt: input.capturedAt.toISOString(),
          contentDigest: digest,
        })),
      ),
    );
  }
  return suggestions;
}

function structurallyCompatibleTranslations(
  translations: unknown[],
  sections: PersistableSiteDraft["catalogSections"],
) {
  return translations.filter((translation) => {
    if (!isRecord(translation) || !Array.isArray(translation.catalogSections)) {
      return false;
    }
    return (
      translation.catalogSections.length === sections.length &&
      translation.catalogSections.every((section, sectionIndex) => {
        if (!isRecord(section) || !Array.isArray(section.items)) return false;
        return section.items.length === sections[sectionIndex]?.items.length;
      })
    );
  });
}

function integrationCompatibleTranslations(
  translations: unknown[],
  labels: string[],
) {
  return translations.flatMap((translation) => {
    if (!isRecord(translation)) return [];
    const currentLabels = Array.isArray(translation.integrationLabels)
      ? translation.integrationLabels
      : [];
    return [
      {
        ...translation,
        integrationLabels: labels.map(
          (label, index) =>
            typeof currentLabels[index] === "string"
              ? currentLabels[index]
              : label,
        ),
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeLinks(
  current: PersistableSiteDraft["integrations"],
  extracted: ExtractedSite["links"],
  checked: Array<{ originalUrl: string; finalUrl: string; status: number }>,
): PersistableSiteDraft["integrations"] {
  const health = new Map(checked.map((result) => [result.originalUrl, result]));
  const merged = current.map((link) => {
    const result = health.get(link.url);
    return result && result.status >= 200 && result.status < 400
      ? { ...link, url: result.finalUrl }
      : link;
  });
  for (const link of extracted) {
    if (
      !merged.some(
        (candidate) =>
          candidate.url === link.url ||
          (link.provider && candidate.provider === link.provider),
      )
    ) {
      merged.push({ ...link, enabled: true, venueId: null });
    }
  }
  return merged;
}

function suggestion(
  field: MonitoringField,
  path: string,
  currentValue: unknown,
  suggestedValue: unknown,
  evidence: SourceEvidence[],
): MonitoringSuggestionInput {
  const serialized = JSON.stringify({ field, path, currentValue, suggestedValue });
  return {
    fingerprint: createHash("sha256").update(serialized).digest("hex"),
    field,
    path,
    currentValue: currentValue as Prisma.InputJsonValue,
    suggestedValue: suggestedValue as Prisma.InputJsonValue,
    evidence,
  };
}

function evidenceForValues(
  extracted: ExtractedSite,
  values: string[],
  capturedAt: Date,
): SourceEvidence[] {
  const digest = contentDigest(extracted.pageText);
  return values
    .filter(Boolean)
    .slice(0, 8)
    .map((value) => ({
      url: extracted.sourceUrl ?? extracted.source,
      excerpt: evidenceExcerpt(extracted.pageText, value),
      capturedAt: capturedAt.toISOString(),
      contentDigest: digest,
    }));
}

function evidenceExcerpt(text: string, value: string): string {
  const index = normalize(text).indexOf(normalize(value));
  if (index < 0) return value.slice(0, 280);
  return text.slice(Math.max(0, index - 80), index + value.length + 120).trim();
}

function hasEvidenceForEveryValue(text: string, values: string[]): boolean {
  const haystack = normalize(text);
  const meaningful = values.map(normalize).filter(Boolean);
  return (
    meaningful.length > 0 &&
    meaningful.every((value) => haystack.includes(value))
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function contentDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
