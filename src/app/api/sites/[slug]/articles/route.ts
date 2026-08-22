import { z } from "zod";
import type { ArticleStatus } from "@/generated/prisma/enums";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { getDb } from "@/lib/db";
import { isSameOriginMutation } from "@/lib/request-origin";

const actionSchema = z.object({
  articleId: z.string().min(1),
  action: z.enum(["publish", "unpublish"]),
});

const UNPUBLISH_MAX_REASON = 280;

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/sites/[slug]/articles">,
) {
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  const db = getDb();
  const articles = await db.article.findMany({
    where: { siteId: access.site.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      locale: true,
      status: true,
      topicTitle: true,
      publishedAt: true,
      createdAt: true,
    },
  });
  return Response.json({ articles });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]/articles">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  const parsed = actionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const db = getDb();
  const article = await db.article.findFirst({
    where: { id: parsed.data.articleId, siteId: access.site.id },
    select: { id: true, status: true, slug: true },
  });
  if (!article) {
    return Response.json({ error: "Article not found." }, { status: 404 });
  }

  if (parsed.data.action === "publish") {
    if (article.status !== "DRAFT") {
      return Response.json(
        { error: "Only draft articles can be published." },
        { status: 409 },
      );
    }
    await db.article.update({
      where: { id: article.id },
      data: {
        status: "PUBLISHED" satisfies ArticleStatus,
        publishedAt: new Date(),
        publishedBy: access.user.id,
        unpublishReason: null,
      },
    });
    return Response.json({ ok: true, status: "PUBLISHED" });
  }

  if (article.status !== "PUBLISHED") {
    return Response.json(
      { error: "Only published articles can be unpublished." },
      { status: 409 },
    );
  }
  await db.article.update({
    where: { id: article.id },
    data: {
      status: "DRAFT" satisfies ArticleStatus,
      publishedAt: null,
      publishedBy: null,
      unpublishReason: `Unpublished by ${access.user.id}`,
    },
  });
  return Response.json({ ok: true, status: "DRAFT" });
}

export const UNPUBLISH_REASON_LIMIT = UNPUBLISH_MAX_REASON;
