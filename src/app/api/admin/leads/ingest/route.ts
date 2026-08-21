import { NextResponse } from "next/server";
import { z } from "zod";
import { Vertical } from "@/generated/prisma/enums";
import { localSeoAuditResultSchema } from "@/lib/local-seo-audit";
import {
  leadEligibilityEvidenceSchema,
  leadEligibilityStateSchema,
} from "@/lib/operator-lead-attributes";
import { OperatorLeadError } from "@/lib/operator-leads";
import {
  ingestOperatorProspectLead,
} from "@/lib/operator-lead-ingest";
import { isOperatorLeadIngestAuthorized } from "@/lib/operator-lead-ingest-auth";
import { limitOperatorLeadIngest } from "@/lib/rate-limit";

export const runtime = "nodejs";

const requestSchema = z.object({
  source: z.string().trim().min(2).max(500),
  vertical: z.enum(Vertical).default(Vertical.RESTAURANT),
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  city: z.string().trim().min(1).max(80),
  placeId: z.string().trim().max(200).nullable().optional(),
  websiteUrl: z.string().trim().max(500).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).nullable().optional(),
  categories: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().trim().min(1).max(200)).max(20),
  discoveredAt: z.iso.datetime().optional(),
  sourceProvider: z.enum(["google_places", "nominatim"]).optional(),
  queries: z
    .array(
      z.object({
        provider: z.enum(["google_places", "nominatim"]),
        query: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(20),
  audit: localSeoAuditResultSchema.optional(),
  eligibility: leadEligibilityStateSchema.default("UNKNOWN"),
  eligibilityEvidence: leadEligibilityEvidenceSchema.default({}),
  generatePreview: z.boolean().default(true),
});

export async function POST(request: Request) {
  if (!isOperatorLeadIngestAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": "Bearer",
        },
      },
    );
  }

  const rateLimit = await limitOperatorLeadIngest(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Lead ingest is temporarily unavailable."
            : "Too many lead ingest requests. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }

  try {
    const input = requestSchema.parse(await request.json());
    const lead = await ingestOperatorProspectLead(input);
    return NextResponse.json(
      { ok: true, ...lead },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the prospect details." },
        { status: 400 },
      );
    }
    if (error instanceof OperatorLeadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[operator-lead-ingest] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "The prospect lead could not be ingested." },
      { status: 503 },
    );
  }
}
