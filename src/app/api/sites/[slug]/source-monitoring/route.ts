import {
  accessFailureResponse,
} from "@/lib/authorization";
import {
  getSourceMonitoringDashboard,
} from "@/lib/source-monitoring";
import { getSourceMonitoringAccess } from "@/lib/source-monitoring-access";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/sites/[slug]/source-monitoring">,
) {
  const { slug } = await params;
  const access = await getSourceMonitoringAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  return Response.json(
    await getSourceMonitoringDashboard(access.site.id),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
