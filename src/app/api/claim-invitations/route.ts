import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ClaimFlowError,
  deliverClaimInvitation,
  issueClaimInvitation,
  recordClaimRejection,
  revokeUndeliveredInvitation,
} from "@/lib/claim-invitations";
import { limitClaimInvitationRequest } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

const requestSchema = z.object({
  siteSlug: z.string().trim().min(2).max(80),
  email: z.email().max(320),
});

export async function POST(request: Request) {
  const rateLimit = await limitClaimInvitationRequest(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Ownership verification is temporarily unavailable."
            : "Too many claim attempts. Try again later.",
      },
      {
        status: rateLimit.reason === "unavailable" ? 503 : 429,
        headers: rateLimitHeaders(rateLimit),
      },
    );
  }
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "Cross-site claim requests are not allowed." },
      { status: 403 },
    );
  }

  let siteSlug = "unknown";
  try {
    const input = requestSchema.parse(await request.json());
    siteSlug = input.siteSlug;
    if (!process.env.DATABASE_URL || !process.env.RESEND_API_KEY) {
      throw new Error("Claim services are not configured");
    }

    const invitation = await issueClaimInvitation({
      siteSlug,
      email: input.email,
      proofMethod: "DOMAIN_EMAIL",
      actor: "claimant:self-serve",
    });
    try {
      await deliverClaimInvitation(
        invitation,
        process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin,
      );
    } catch (error) {
      await revokeUndeliveredInvitation(invitation);
      throw error;
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the claim details." },
        { status: 400 },
      );
    }
    if (error instanceof ClaimFlowError) {
      await recordClaimRejection({
        siteSlug,
        reason: error.code,
        actor: "claimant:self-serve",
        invitationId: error.invitationId,
      });
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("[claim-invitation] request failed", {
      siteSlug,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Ownership verification could not be sent. Try again shortly." },
      { status: 503 },
    );
  }
}

function rateLimitHeaders(result: {
  remaining: number;
  reset: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };
}
