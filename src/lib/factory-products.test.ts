import { describe, expect, it } from "bun:test";
import { factoryProductCatalog } from "@/lib/factory-products";

describe("factory product catalog", () => {
  it("keeps unlaunched niches out of the public product cards", () => {
    const catalog = factoryProductCatalog();

    expect(catalog.launched.map(({ marketing }) => marketing.brand.name)).toEqual(
      ["Restofrontapp"],
    );
    expect(catalog.next?.marketing.brand.name).toBe("Salonfront");
    expect(catalog.next?.marketing.domain).toBeNull();
    expect(catalog.registeredCount).toBe(2);
  });
});
