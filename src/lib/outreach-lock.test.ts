import { describe, expect, it } from "bun:test";
import type { Prisma } from "@/generated/prisma/client";
import { lockOutreachDelivery } from "@/lib/outreach-lock";

describe("outreach delivery advisory lock", () => {
  it("executes the void-returning lock without decoding a query result", async () => {
    const queries: string[] = [];
    const commands: string[] = [];
    const transaction = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        queries.push(strings.join(""));
        return [{ setting: "12000" }];
      },
      $executeRaw: async (strings: TemplateStringsArray) => {
        commands.push(strings.join(""));
        return 0;
      },
    } as unknown as Prisma.TransactionClient;

    await lockOutreachDelivery(transaction);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("set_config('lock_timeout', '12000', true)");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(
      "PERFORM pg_advisory_xact_lock(1381258068, 1)",
    );
  });
});
