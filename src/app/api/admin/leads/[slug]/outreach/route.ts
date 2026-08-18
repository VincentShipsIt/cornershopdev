import { NextResponse } from "next/server";
import { getSuperadminAccess } from "@/lib/authorization";
import { getDb } from "@/lib/db";
import { listOutreachMessages } from "@/lib/outreach";

/**
 * Read-only, so unlike the mutating routes in `admin/leads` and
 * `admin/outreach` this does not call `isSameOriginMutation` — that guard
 * exists to stop cross-site state changes and has nothing to check on a GET.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/admin/leads/[slug]/outreach">,
) {
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const site = await getDb().site.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const messages = await listOutreachMessages(site.id);
  return NextResponse.json(
    {
      ok: true,
      status: site.status,
      messages: messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        template: message.template,
        subject: message.subject,
        toAddress: message.toAddress,
        fromAddress: message.fromAddress,
        status: message.status,
        error: message.error,
        sentAt: message.sentAt?.toISOString() ?? null,
        deliveredAt: message.deliveredAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
