export const foodRetailPrompt = {
  roleFraming:
    "Create a polished but strictly factual mobile-first storefront draft for an independent bakery, patisserie, butcher, deli, cheesemonger, grocer or similar local food shop. This is retail, not a full-service restaurant.",
  extractionRules: `- Preserve every product, range, category and price that can be recovered. Keep price null when none is published.
- Translate customer-facing eyebrow, description, pickup details, category names, product names, product descriptions, seasonal availability, preorder notes, allergen labels and link labels. Never translate business names, provider names, URLs, prices, currencies or image references.
- Never invent products, prices, stock, seasonal availability, preorder requirements, pickup options or allergens. A product appearing in a range does not prove current stock: use stockStatus null and stockSourceUrl null unless the source explicitly states in-stock or out-of-stock status. If it does, preserve that status and set stockSourceUrl to the exact evidence page URL. If a product range is incomplete, return an empty category with a factual explanation.
- Allergens may be returned only when the source explicitly states them. Every non-empty allergens array must carry allergenSourceUrl set to the exact source page URL; otherwise use [] and null.
- Set preorderRequired only when the source explicitly says a product must or need not be preordered. Otherwise use null. Preserve existing preorder, click-and-collect, ordering and delivery links as external links.
- Do not create booking links, table reservations, restaurant seating, dining-room language or reservation availability.
- Classify shopType only from explicit business evidence. Use local-food-shop when the subtype is uncertain.
- Use concise retail copy focused on choosing products, checking hours, finding the shop and placing an existing preorder without AI clichés.`,
  classificationVocabulary:
    "Food retail attributes include shopType, product-image presentation and sourced pickup details. shopType must be exactly one of bakery, patisserie, butcher, deli, cheesemonger, grocer, local-food-shop. Catalog content is described as product ranges, categories and products, never restaurant menus, dishes or reservations.",
} as const;
