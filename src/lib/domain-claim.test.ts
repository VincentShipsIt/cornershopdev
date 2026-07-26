import { describe, expect, it } from "bun:test";
import {
  claimDomainForSite,
  type DomainClaimStore,
} from "@/lib/domain-claim";

const input = {
  hostname: "www.chez-lea.test",
  siteId: "site_1",
  verificationToken: "token_1",
};

describe("domain ownership claim", () => {
  it("creates an unowned hostname", async () => {
    const state = { owner: null as string | null, creates: 0 };
    const claimed = await claimDomainForSite(store(state), input);

    expect(claimed).toBe(true);
    expect(state.owner).toBe("site_1");
    expect(state.creates).toBe(1);
  });

  it("is idempotent for the same site", async () => {
    const state = { owner: "site_1" as string | null, creates: 0 };

    expect(await claimDomainForSite(store(state), input)).toBe(true);
    expect(state.creates).toBe(0);
  });

  it("never reassigns another site's hostname", async () => {
    const state = { owner: "site_2" as string | null, creates: 0 };

    expect(await claimDomainForSite(store(state), input)).toBe(false);
    expect(state.owner).toBe("site_2");
    expect(state.creates).toBe(0);
  });

  it("rechecks ownership after losing a unique-key race", async () => {
    const state = { owner: null as string | null, creates: 0 };
    let transactions = 0;
    const racingStore = store(state, () => {
      transactions += 1;
      if (transactions === 1) {
        state.owner = "site_2";
        throw Object.assign(new Error("unique conflict"), { code: "P2002" });
      }
    });

    expect(await claimDomainForSite(racingStore, input)).toBe(false);
    expect(state.owner).toBe("site_2");
    expect(transactions).toBe(2);
  });
});

function store(
  state: { owner: string | null; creates: number },
  beforeOperation?: () => void,
): DomainClaimStore {
  return {
    runSerializable: async (operation) => {
      beforeOperation?.();
      return operation({
        findOwner: async () => state.owner,
        create: async ({ siteId }) => {
          state.creates += 1;
          state.owner = siteId;
        },
      });
    },
  };
}
