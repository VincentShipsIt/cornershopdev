export const restaurantPrompt = {
  roleFraming:
    "Create a polished but strictly factual mobile-first restaurant website draft.",
  extractionRules: `- Preserve every menu item and price that can be recovered.
- Translate customer-facing cuisine, eyebrow, description, menu names, menu descriptions, dietary labels and link labels. Never translate restaurant names, provider names, URLs, prices, currencies or image references.
- Never invent menu items. If menu data is incomplete, return an empty menu section with a factual explanation.
- Use concise, warm hospitality copy without AI clichés.`,
  classificationVocabulary:
    "Restaurant attributes include cuisine and menu-image presentation. Catalog content is described as menus, sections, and dishes.",
} as const;
