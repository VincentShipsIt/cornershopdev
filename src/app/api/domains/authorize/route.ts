import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  isFactoryHostname,
  parsePlatformSubdomain,
} from "@/lib/hostnames";

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
  );

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = hostnameSchema.safeParse(
    new URL(request.url).searchParams.get("domain"),
  );
  if (!parsed.success) return new Response(null, { status: 403 });

  // Factory and launched-niche apexes are authorized without the domain table
  // so cornershop.dev / restofront.com can renew TLS while the database is
  // unreachable. Customer platform subdomains are not: an unused label under
  // *.restofront.com must not mint Let's Encrypt certificates (shared quota).
  if (isFactoryHostname(parsed.data)) {
    return new Response(null, { status: 200 });
  }

  if (!process.env.DATABASE_URL) return new Response(null, { status: 403 });

  const platform = parsePlatformSubdomain(parsed.data);
  if (platform) {
    const site = await getDb().site.findUnique({
      where: { slug: platform.slug },
      select: { id: true },
    });
    return new Response(null, { status: site ? 200 : 403 });
  }

  const domain = await getDb().domain.findUnique({
    where: { hostname: parsed.data },
    select: { verified: true },
  });
  return new Response(null, { status: domain?.verified ? 200 : 403 });
}
