import { describe, expect, it } from "bun:test";
import {
  claimDomainForSite,
  claimDomainSetForSite,
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

  it("claims an apex and www atomically", async () => {
    const state = {
      owners: new Map<string, string>(),
      creates: [] as string[],
    };
    const claimed = await claimDomainSetForSite(setStore(state), [
      {
        hostname: "example.test",
        siteId: "site_1",
        verificationToken: "token_apex",
      },
      {
        hostname: "www.example.test",
        siteId: "site_1",
        verificationToken: "token_www",
      },
    ]);

    expect(claimed).toBe(true);
    expect(state.creates).toEqual(["example.test", "www.example.test"]);
  });

  it("does not partially claim a pair whose companion is owned", async () => {
    const state = {
      owners: new Map([["www.example.test", "site_2"]]),
      creates: [] as string[],
    };
    const claimed = await claimDomainSetForSite(setStore(state), [
      {
        hostname: "example.test",
        siteId: "site_1",
        verificationToken: "token_apex",
      },
      {
        hostname: "www.example.test",
        siteId: "site_1",
        verificationToken: "token_www",
      },
    ]);

    expect(claimed).toBe(false);
    expect(state.creates).toEqual([]);
    expect(state.owners.get("example.test")).toBeUndefined();
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

function setStore(state: {
  owners: Map<string, string>;
  creates: string[];
}): DomainClaimStore {
  return {
    runSerializable: async (operation) =>
      operation({
        findOwner: async (hostname) => state.owners.get(hostname) ?? null,
        create: async ({ hostname, siteId }) => {
          state.creates.push(hostname);
          state.owners.set(hostname, siteId);
        },
      }),
  };
}
