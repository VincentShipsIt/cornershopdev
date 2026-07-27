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
      create: {
        email,
        name: email.split("@")[0] || "Platform operator",
        emailVerified: true,
        platformRole: "SUPERADMIN",
      },
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
  let emailValue: string | undefined;
  let execute = false;
  const usage = () =>
    new Error(
      "Usage: bun run operator:grant-superadmin --email owner@example.com [--execute]",
    );

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      if (execute) throw usage();
      execute = true;
      continue;
    }
    if (argument === "--email") {
      const value = args[index + 1];
      if (emailValue !== undefined || !value || value.startsWith("--")) {
        throw usage();
      }
      emailValue = value;
      index += 1;
      continue;
    }
    throw usage();
  }

  if (!emailValue) throw usage();
  return {
    email: normalizeAccountEmail(emailValue),
    execute,
  };
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Promotion failed");
  process.exitCode = 1;
}
