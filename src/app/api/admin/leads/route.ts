import { NextResponse } from "next/server";
import { z } from "zod";
import { Vertical } from "@/generated/prisma/enums";
import { getSuperadminAccess } from "@/lib/authorization";
import {
  createOrReopenOperatorLead,
  OperatorLeadError,
} from "@/lib/operator-leads";
import { limitOperatorLeadMutation } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  source: z.string().trim().min(2).max(500),
  vertical: z.enum(Vertical).default(Vertical.RESTAURANT),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rateLimit = await limitOperatorLeadMutation(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Operator imports are temporarily unavailable."
            : "Too many operator imports. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }

  try {
    const input = requestSchema.parse(await request.json());
    const lead = await createOrReopenOperatorLead({
      ...input,
      actor: `operator:${operator.id}`,
    });
    return NextResponse.json(
      { ok: true, ...lead },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the lead details." },
        { status: 400 },
      );
    }
    if (error instanceof OperatorLeadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[operator-lead] failed", {
      operatorId: operator.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "The operator lead could not be created." },
      { status: 503 },
    );
  }
}
