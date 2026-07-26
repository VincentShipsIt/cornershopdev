import { analyticsEventInputSchema } from "@/lib/analytics-contract";
import { isLikelyAutomatedRequest } from "@/lib/analytics-policy";
import {
  recordBrowserAnalyticsEvent,
  resolveAnalyticsSiteForHeaders,
} from "@/lib/analytics";
import { limitAnalyticsEvent } from "@/lib/rate-limit";

export const runtime = "nodejs";

function emptyResponse() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (isLikelyAutomatedRequest(request.headers)) return emptyResponse();

  const rateLimit = await limitAnalyticsEvent(request);
  if (!rateLimit.success) return emptyResponse();

  let event;
  try {
    event = analyticsEventInputSchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Invalid analytics event" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // Site identity comes only from the verified public hostname. The browser
    // cannot name a tenant in its payload or turn a factory preview into traffic.
    const site = await resolveAnalyticsSiteForHeaders(request.headers);
    if (!site) return emptyResponse();
    await recordBrowserAnalyticsEvent(site.id, event);
  } catch (error) {
    console.error("[analytics-event] dropped", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return emptyResponse();
}
