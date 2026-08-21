import { describe, expect, it } from "bun:test";
import { catalogPhotoReplacementPosition } from "@/lib/catalog-photo-reconciliation";

const previous = {
  previousSectionName: "Dinner",
  previousItemName: "Wild mushroom pasta",
};

describe("catalog photo replacement reconciliation", () => {
  it("follows a uniquely identified item across section and item reordering", () => {
    expect(
      catalogPhotoReplacementPosition({
        ...previous,
        replacementCatalog: [
          { name: "Dessert", items: [{ name: "Tiramisu" }] },
          {
            name: " Dinner ",
            items: [
              { name: "Fish" },
              { name: "WILD   MUSHROOM PASTA" },
            ],
          },
        ],
      }),
    ).toEqual({ sectionIndex: 1, itemIndex: 1 });
  });

  it("unselects when the item is deleted or renamed", () => {
    expect(
      catalogPhotoReplacementPosition({
        ...previous,
        replacementCatalog: [
          { name: "Dinner", items: [{ name: "Fish" }] },
        ],
      }),
    ).toBeNull();
    expect(
      catalogPhotoReplacementPosition({
        ...previous,
        replacementCatalog: [
          { name: "Dinner", items: [{ name: "Seasonal pasta" }] },
        ],
      }),
    ).toBeNull();
  });

  it("fails closed when duplicate names make identity ambiguous", () => {
    expect(
      catalogPhotoReplacementPosition({
        ...previous,
        replacementCatalog: [
          {
            name: "Dinner",
            items: [
              { name: "Wild mushroom pasta" },
              { name: "Wild mushroom pasta" },
            ],
          },
        ],
      }),
    ).toBeNull();
  });
});
