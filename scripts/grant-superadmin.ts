import { normalizeAccountEmail } from "@/lib/account-email";
import { getDb } from "@/lib/db";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";

async function main() {
  const { email, execute } = parseArguments(process.argv.slice(2));
  if (!isConfiguredSuperadminEmail(email)) {
    throw new Error(
      "Refusing promotion: email is not present in SUPERADMIN_EMAILS",
    );
  }

  const db = getDb();
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, platformRole: true },
    });
    if (!execute) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            userId: user?.id ?? null,
            email,
            currentRole: user?.platformRole ?? null,
            targetRole: "SUPERADMIN",
            action: user ? "promote" : "create",
          },
          null,
          2,
        ),
      );
      return;
    }

    const promoted = await db.user.upsert({
      where: { email },
      update: { platformRole: "SUPERADMIN" },
      create: { email, platformRole: "SUPERADMIN" },
      select: { id: true, email: true, platformRole: true },
    });
    console.log(
      JSON.stringify({ mode: "execute", ...promoted, verified: true }, null, 2),
    );
  } finally {
    await db.$disconnect();
  }
}

function parseArguments(args: string[]): { email: string; execute: boolean } {
  const emailFlag = args.indexOf("--email");
  const emailValue = emailFlag >= 0 ? args[emailFlag + 1] : undefined;
  const allowed = new Set(["--email", emailValue ?? "", "--execute"]);
  if (
    !emailValue ||
    args.some((argument) => !allowed.has(argument)) ||
    args.filter((argument) => argument === "--email").length !== 1
  ) {
    throw new Error(
      "Usage: bun run operator:grant-superadmin --email owner@example.com [--execute]",
    );
  }
  return {
    email: normalizeAccountEmail(emailValue),
    execute: args.includes("--execute"),
  };
}

await main();
