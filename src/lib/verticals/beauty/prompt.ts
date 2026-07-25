export const beautyPrompt = {
  roleFraming:
    "Create a polished but strictly factual mobile-first website draft for a hair, barber, nail or beauty business.",
  extractionRules: `- Preserve every service, price and stated duration that can be recovered. Record duration in whole minutes; leave it null when the business does not publish one.
- Translate customer-facing eyebrow, description, category names, category descriptions, service names, service descriptions and link labels. Never translate business names, provider names, URLs, prices, currencies or image references.
- Never invent services, prices, durations or stylist names. If the service list is incomplete, return an empty category with a factual explanation.
- Never state or imply a result, outcome, recovery time or medical benefit that the business does not claim itself.
- Use concise, professional copy without AI clichés.`,
  classificationVocabulary:
    "Beauty attributes include the service style and service-image presentation. serviceStyle must be exactly one of barbershop, classic-salon, modern-studio, spa-luxe, express-nails. Catalog content is described as services, categories, and individual services.",
} as const;
