import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  projectSiteDraft,
  siteDraftRelations,
} from "@/lib/sites";
import type { VerticalId } from "@/lib/verticals/types";

const retryablePublishCodes = new Set(["P2002", "P2034"]);

export type PublishSiteDraftInput = {
  siteId: string;
  slug: string;
  vertical: VerticalId;
  actor: {
    id: string;
    email: string;
  };
  changeSummary: string;
  now?: Date;
};

export type PublishedSiteVersion = {
  id: string;
  version: number;
  publishedAt: Date;
  theme: {
    id: string;
    version: string;
  };
};

export class SitePublicationStateError extends Error {
  constructor() {
    super("Only claimed or live sites can be published");
    this.name = "SitePublicationStateError";
  }
}

/**
 * Validates the persisted private draft, appends an immutable snapshot, moves
 * the live pointer, and records the audit event in one serializable transaction.
 *
 * A caller cannot publish a request body directly: only the draft already owned
 * by this site can cross the boundary, which keeps preview and publish on the
 * same validated representation and makes Save-before-Publish explicit.
 */
export async function publishSiteDraft(
  input: PublishSiteDraftInput,
): Promise<PublishedSiteVersion> {
  const changeSummary = input.changeSummary.trim();
  if (changeSummary.length < 3 || changeSummary.length > 280) {
    throw new Error("Change summary must be between 3 and 280 characters");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Site publishing is temporarily unavailable");
  }

  const db = getDb();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const site = await tx.site.findFirst({
            where: {
              id: input.siteId,
              slug: input.slug,
              vertical: input.vertical,
            },
            include: siteDraftRelations,
          });
          if (!site) throw new Error("Site not found");
          if (site.status !== "CLAIMED" && site.status !== "LIVE") {
            // Publishing must not resurrect a prospect or bypass an operator or
            // billing pause by changing PAUSED back to LIVE.
            throw new SitePublicationStateError();
          }

          // `projectSiteDraft` is the private-preview projection. Parsing it
          // here before any write means validation failure cannot create a
          // version, move the pointer, change status, or write an audit row.
          const loaded = projectSiteDraft(site);
          const draft = loaded.draft as Prisma.InputJsonValue;
          const latest = await tx.siteVersion.findFirst({
            where: { siteId: input.siteId },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          const publishedAt = input.now ?? new Date();
          const version = await tx.siteVersion.create({
            data: {
              siteId: input.siteId,
              version: (latest?.version ?? 0) + 1,
              vertical: loaded.vertical,
              theme: loaded.theme.selection as Prisma.InputJsonValue,
              themeVersion: loaded.theme.version,
              palette: (
                loaded.draft as { palette: Prisma.InputJsonValue }
              ).palette,
              content: draft,
              translations: (
                loaded.draft as { translations: Prisma.InputJsonValue }
              ).translations,
              integrations: (
                loaded.draft as { integrations: Prisma.InputJsonValue }
              ).integrations,
              publishedAt,
              publishedBy: input.actor.id,
              changeSummary,
            },
            select: { id: true, version: true },
          });
          const verifiedDomainCount = await tx.domain.count({
            where: { siteId: input.siteId, verified: true },
          });

          const moved = await tx.site.updateMany({
            where: {
              id: input.siteId,
              slug: input.slug,
              vertical: input.vertical,
            },
            data: {
              publishedSiteVersionId: version.id,
              // A snapshot can be published before DNS is connected, but it is
              // only live after at least one verified hostname routes to it.
              status: verifiedDomainCount > 0 ? "LIVE" : "CLAIMED",
            },
          });
          if (moved.count !== 1) {
            throw new Error("Site could not be published");
          }

          await tx.auditEvent.create({
            data: {
              type: "site.published",
              actor: input.actor.id,
              siteId: input.siteId,
              metadata: {
                siteVersionId: version.id,
                version: version.version,
                changeSummary,
                actorEmail: input.actor.email,
                themeId: loaded.theme.id,
                themeVersion: loaded.theme.version,
                live: verifiedDomainCount > 0,
              },
            },
          });

          return {
            id: version.id,
            version: version.version,
            publishedAt,
            theme: {
              id: loaded.theme.id,
              version: loaded.theme.version,
            },
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt < 2 && isRetryablePublishError(error)) continue;
      throw error;
    }
  }

  throw new Error("Site could not be published");
}

function isRetryablePublishError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    retryablePublishCodes.has(error.code)
  );
}
