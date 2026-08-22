import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import {
  isCornershopProClient,
  resolveProOwnerAppUrl,
} from "@/lib/cornershop-pro";
import { findSiteView } from "@/lib/sites";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!isCornershopProClient(slug)) notFound();

  const site = await findSiteView(slug);
  if (!site) notFound();

  const appUrl = resolveProOwnerAppUrl(site.draft.integrations);
  if (!appUrl) notFound();

  return NextResponse.redirect(appUrl, 307);
}
