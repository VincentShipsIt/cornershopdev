import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperadminAccess } from "@/lib/authorization";
import {
  ClaimFlowError,
  deliverClaimInvitation,
  issueClaimInvitation,
  recordClaimRejection,
  resendClaimInvitation,
  revokeClaimInvitation,
  revokeUndeliveredInvitation,
} from "@/lib/claim-invitations";
import { limitOperatorClaimInvitation } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

const requestSchema = z.object({
  siteSlug: z.string().trim().min(2).max(80),
  email: z.email().max(320),
  action: z.enum(["issue", "resend"]).default("issue"),
  invitationId: z.string().trim().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimit = await limitOperatorClaimInvitation(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Claim approvals are temporarily unavailable."
            : "Too many claim approvals. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }

  let siteSlug = "unknown";
  try {
    const input = requestSchema.parse(await request.json());
    siteSlug = input.siteSlug;
    const invitation =
      input.action === "resend"
        ? await resendClaimInvitation({
            siteSlug,
            invitationId: z.string().parse(input.invitationId),
            actor: `operator:${operator.id}`,
          })
        : await issueClaimInvitation({
            siteSlug,
            email: input.email,
            proofMethod: "OPERATOR_APPROVAL",
            actor: `operator:${operator.id}`,
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
      { ok: true, expiresAt: invitation.expiresAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the invitation details." },
        { status: 400 },
      );
    }
    if (error instanceof ClaimFlowError) {
      await recordClaimRejection({
        siteSlug,
        reason: error.code,
        actor: `operator:${operator.id}`,
      });
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("[operator-claim-invitation] failed", {
      siteSlug,
      operatorId: operator.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "The claim invitation could not be sent." },
      { status: 503 },
    );
  }
}

const revokeRequestSchema = z.object({
  siteSlug: z.string().trim().min(2).max(80),
  invitationId: z.string().trim().min(1).max(100),
});

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const input = revokeRequestSchema.parse(await request.json());
    const revoked = await revokeClaimInvitation({
      ...input,
      actor: `operator:${operator.id}`,
    });
    return NextResponse.json(
      { ok: true, revoked },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the invitation details." },
        { status: 400 },
      );
    }
    if (error instanceof ClaimFlowError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[operator-claim-revoke] failed", {
      operatorId: operator.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "The claim invitation could not be revoked." },
      { status: 503 },
    );
  }
}
