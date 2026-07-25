import { randomBytes } from "node:crypto";
import { resolve4, resolveCname } from "node:dns/promises";
import { z } from "zod";
import { getCurrentSession } from "@/lib/current-session";
import { getDb } from "@/lib/db";

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) =>
    value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, ""),
  )
  .pipe(
    z
      .string()
      .min(4)
      .max(253)
      .regex(
        /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
        "Enter a valid domain name",
      ),
  );

function getDomainTarget() {
  const address = process.env.PUBLIC_APP_IP;
  const cname = process.env.CUSTOM_DOMAIN_CNAME;
  if (!address || !cname) {
    throw new Error("Customer domain routing is not configured");
  }
  return { address, cname: cname.replace(/\.$/, "").toLowerCase() };
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return Response.json({ error: "Sign in to connect a domain" }, { status: 401 });
    }
    const body = (await request.json()) as {
      hostname?: string;
      siteSlug?: string;
    };
    const hostname = hostnameSchema.parse(body.hostname);
    const siteSlug = body.siteSlug ?? session.siteSlug;
    if (session.siteSlug !== siteSlug) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = process.env.DATABASE_URL ? getDb() : null;
    let siteId: string | null = null;
    if (db) {
      const site = await db.site.findUnique({
        where: { slug: siteSlug },
        select: { id: true },
      });
      if (!site) {
        return Response.json({ error: "Site not found" }, { status: 404 });
      }
      const existingDomain = await db.domain.findUnique({
        where: { hostname },
        select: { siteId: true },
      });
      if (existingDomain && existingDomain.siteId !== site.id) {
        return Response.json(
          { error: "This domain is already connected to another site" },
          { status: 409 },
        );
      }
      siteId = site.id;
    }

    const target = getDomainTarget();
    const verificationToken = randomBytes(24).toString("base64url");
    if (db && siteId) {
      await db.domain.upsert({
        where: { hostname },
        update: { siteId },
        create: {
          hostname,
          siteId,
          verificationToken,
        },
      });
    }

    const isApex = hostname.split(".").length === 2;
    return Response.json({
      hostname,
      attached: true,
      verified: false,
      records:
        isApex
          ? [{ type: "A", name: "@", value: target.address }]
          : [
              {
                type: "CNAME",
                name: hostname.split(".")[0],
                value: target.cname,
              },
            ],
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Domain could not be added",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const searchParams = new URL(request.url).searchParams;
    const hostname = hostnameSchema.parse(searchParams.get("hostname"));
    const siteSlug = searchParams.get("siteSlug");
    if (siteSlug !== session.siteSlug) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    let siteId: string | null = null;
    if (process.env.DATABASE_URL) {
      const domain = await getDb().domain.findFirst({
        where: {
          hostname,
          site: { slug: session.siteSlug },
        },
        select: { siteId: true },
      });
      if (!domain) {
        return Response.json({ error: "Domain not found" }, { status: 404 });
      }
      siteId = domain.siteId;
    }

    const [aResult, cnameResult] = await Promise.allSettled([
      resolve4(hostname),
      resolveCname(hostname),
    ]);
    const addresses = aResult.status === "fulfilled" ? aResult.value : [];
    const cnames = cnameResult.status === "fulfilled" ? cnameResult.value : [];
    const target = getDomainTarget();
    const verified =
      addresses.includes(target.address) ||
      cnames.some(
        (value) => value.replace(/\.$/, "").toLowerCase() === target.cname,
      );

    if (verified && process.env.DATABASE_URL) {
      await getDb().domain.updateMany({
        where: {
          hostname,
          ...(siteId ? { siteId } : {}),
        },
        data: { verified: true, verifiedAt: new Date() },
      });
    }

    return Response.json({ hostname, verified, addresses, cnames });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "DNS could not be checked",
      },
      { status: 400 },
    );
  }
}
