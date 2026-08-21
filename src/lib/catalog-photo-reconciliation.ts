type CatalogShape = Array<{
  name: string;
  items: Array<{ name: string }>;
}>;

export type CatalogItemPosition = {
  sectionIndex: number;
  itemIndex: number;
};

function normalizedIdentityPart(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function catalogItemIdentity(sectionName: string, itemName: string): string {
  return `${normalizedIdentityPart(sectionName)}\0${normalizedIdentityPart(itemName)}`;
}

/**
 * Full draft saves replace catalog rows. A selected immutable photo follows its
 * business item only when section + item names identify one unambiguous target;
 * otherwise the safe outcome is to require the owner to select it again.
 */
export function catalogPhotoReplacementPosition(input: {
  previousSectionName: string;
  previousItemName: string;
  replacementCatalog: CatalogShape;
}): CatalogItemPosition | null {
  const previousIdentity = catalogItemIdentity(
    input.previousSectionName,
    input.previousItemName,
  );
  const matches = input.replacementCatalog.flatMap((section, sectionIndex) =>
    section.items.flatMap((item, itemIndex) =>
      catalogItemIdentity(section.name, item.name) === previousIdentity
        ? [{ sectionIndex, itemIndex }]
        : [],
    ),
  );
  return matches.length === 1 ? matches[0]! : null;
}
