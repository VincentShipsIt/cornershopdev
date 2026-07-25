import { z } from "zod";
import { getDb } from "@/lib/db";
import { isFactoryHostname } from "@/lib/hostnames";

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

  // The factory's own hostnames and every registered niche domain are authorized
  // without consulting the domain table, which only ever holds customer domains.
  // Answering before the database check is also what lets cornershop.dev and a
  // niche domain renew their certificates while the database is unreachable.
  if (isFactoryHostname(parsed.data)) return new Response(null, { status: 200 });

  if (!process.env.DATABASE_URL) return new Response(null, { status: 403 });

  const domain = await getDb().domain.findUnique({
    where: { hostname: parsed.data },
    select: { verified: true },
  });
  return new Response(null, { status: domain?.verified ? 200 : 403 });
}
