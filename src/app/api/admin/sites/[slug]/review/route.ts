import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperadminAccess } from "@/lib/authorization";
import {
  OperatorLeadError,
  recordOperatorLeadAction,
} from "@/lib/operator-leads";
import { isSameOriginMutation } from "@/lib/request-origin";

const requestSchema = z.object({
  action: z.enum(["add_note", "complete_review"]),
  note: z.string().trim().max(2_000).nullable().default(null),
});

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/admin/sites/[slug]/review">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { slug } = await params;
    const input = requestSchema.parse(await request.json());
    const result = await recordOperatorLeadAction({
      siteSlug: slug,
      action: input.action,
      note: input.note,
      actor: `operator:${operator.id}`,
    });
    return NextResponse.json(
      { ok: true, createdAt: result.createdAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the review details." },
        { status: 400 },
      );
    }
    if (error instanceof OperatorLeadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[operator-review] failed", {
      operatorId: operator.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "The operator review could not be saved." },
      { status: 503 },
    );
  }
}
