import { appOrigin } from "@/lib/app-origin";
import {
  deliverClaimInvitation,
  issueClaimInvitation,
} from "@/lib/claim-invitations";
import { getDb } from "@/lib/db";
import { normalizeAccountEmail } from "@/lib/account-email";

/**
 * Operator helper for the portable Servizo demo.
 * Issues an OPERATOR_APPROVAL claim invitation for the `servizo` preview site
 * and emails the bearer link. Does not invent a vertical — Servizo stays on the
 * shared restaurant site model until a product-brand niche is extracted.
 *
 * Usage:
 *   bun run operator:claim:servizo --email owner@example.com
 *   bun run operator:claim:servizo --email owner@example.com --execute
 *   bun run operator:claim:servizo --email owner@example.com --execute \
 *     --evidence-ref private-crm:servizo-owner-consent \
 *     --actor vincent@cornershop.dev
 */
const SITE_SLUG = "servizo";
const DEFAULT_EVIDENCE_REF = "private-crm:servizo-portable-demo-owner-consent";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = normalizeAccountEmail(args.email);
  const actor = normalizeAccountEmail(args.actor);
  const evidenceRef = args.evidenceRef;
  const plan = {
    mode: args.execute ? "execute" : "dry-run",
    siteSlug: SITE_SLUG,
    email,
    actor,
    proofMethod: "OPERATOR_APPROVAL" as const,
    approvalEvidenceRef: evidenceRef,
    appOrigin: appOrigin(),
  };

  const db = getDb();
  try {
    const site = await db.site.findUnique({
      where: { slug: SITE_SLUG },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        organizationId: true,
      },
    });
    if (!site) {
      throw new Error(
        `Site "${SITE_SLUG}" is not in the database. Run: bun run operator:import:servizo --execute`,
      );
    }
    if (site.organizationId) {
      throw new Error(
        `Site "${SITE_SLUG}" is already claimed (organization ${site.organizationId}).`,
      );
    }
    if (site.status !== "PREVIEW_READY" && site.status !== "PROSPECT") {
      throw new Error(
        `Site "${SITE_SLUG}" status is ${site.status}; expected PREVIEW_READY or PROSPECT.`,
      );
    }

    if (!args.execute) {
      console.log(
        JSON.stringify({ ...plan, siteStatus: site.status, preflight: "clear" }, null, 2),
      );
      return;
    }

    const invitation = await issueClaimInvitation({
      siteSlug: SITE_SLUG,
      email,
      proofMethod: "OPERATOR_APPROVAL",
      actor,
      approvalEvidenceRef: evidenceRef,
    });
    await deliverClaimInvitation(invitation, appOrigin());

    console.log(
      JSON.stringify(
        {
          ...plan,
          invitationId: invitation.id,
          expiresAt: invitation.expiresAt.toISOString(),
          delivered: true,
          claimPath: `/claim/${SITE_SLUG}`,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

function parseArgs(argv: string[]): {
  email: string;
  actor: string;
  evidenceRef: string;
  execute: boolean;
} {
  let email = "";
  let actor = process.env.SUPERADMIN_EMAILS?.split(",")[0]?.trim() ?? "";
  let evidenceRef = DEFAULT_EVIDENCE_REF;
  let execute = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    if (arg === "--email") {
      email = argv[++i] ?? "";
      continue;
    }
    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
      continue;
    }
    if (arg === "--actor") {
      actor = argv[++i] ?? "";
      continue;
    }
    if (arg.startsWith("--actor=")) {
      actor = arg.slice("--actor=".length);
      continue;
    }
    if (arg === "--evidence-ref") {
      evidenceRef = argv[++i] ?? "";
      continue;
    }
    if (arg.startsWith("--evidence-ref=")) {
      evidenceRef = arg.slice("--evidence-ref=".length);
      continue;
    }
    throw new Error(
      "Usage: bun run operator:claim:servizo --email owner@example.com [--execute] [--actor email] [--evidence-ref ref]",
    );
  }

  if (!email) {
    throw new Error("Missing --email for the Servizo owner claim invitation");
  }
  if (!actor) {
    throw new Error(
      "Missing --actor (or SUPERADMIN_EMAILS) for the operator approval actor",
    );
  }
  return { email, actor, evidenceRef, execute };
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Claim invitation failed");
  process.exitCode = 1;
}
