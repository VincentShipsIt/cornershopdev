import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { saveAuthorizedSiteDraft } from "@/lib/owner-site-save";
import { isSameOriginMutation } from "@/lib/request-origin";

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return saveAuthorizedSiteDraft(slug, access, body);
}
