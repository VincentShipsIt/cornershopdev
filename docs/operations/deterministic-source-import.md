# Deterministic source import

The public import path produces a useful private preview without
`OPENROUTER_API_KEY`. Network access and source reconstruction are deliberately
separate boundaries:

1. `src/lib/importer.ts` normalizes the supplied URL, resolves every destination,
   rejects private/local answers, pins the connection to the validated public
   address, revalidates redirects, caps response sizes, and discovers at most six
   relevant same-origin pages.
2. `src/lib/source-reconstruction.ts` operates only on those already-fetched
   documents. It never performs network I/O.
3. `deterministicDraft` validates the recovered data through the selected
   vertical schema before persistence.

## Accepted evidence

- Business identity and contact data: JSON-LD, metadata, semantic address
  markup, and explicit `tel:`/`mailto:` links.
- Hours: JSON-LD `openingHoursSpecification` or `openingHours` values.
- Catalog candidates: schema.org `MenuSection`, `MenuItem`, `OfferCatalog`,
  `Product`, or `Service` entities. Unsupported or currency-less prices remain
  unset; missing items are never generated.
- Branding: JSON-LD and explicit logo/favicon/hero markup plus CSS custom
  properties and `theme-color` metadata. Colour pairs are normalized and
  repaired to WCAG contrast thresholds before rendering.
- Navigation: at most twelve labelled, same-origin links found inside source
  navigation landmarks.
- Assets: at most twenty-four HTTPS source URLs with official-source provenance.
  Credentials, custom ports, local/private literals, mixed-content URLs, and
  data URLs are rejected. Any later server-side image read goes through the
  importer's DNS/redirect SSRF boundary again.

Each recovered fact stores a field name, value, source URL, extraction method,
and bounded excerpt in `Site.sourceData`. The same record also stores source
navigation and authentic brand/content asset URLs. `Site.logoUrl`,
`Site.faviconUrl`, `Site.draftPalette`, contact columns, hours, and structured
catalog rows feed private previews and immutable published snapshots.

## Bounds and non-goals

- 24 JSON-LD blocks, 240 traversed entities, 12 navigation links, 24 assets,
  80 evidence records, 12 catalog sections, 40 items per section, and 120 items
  total.
- Malformed JSON-LD or HTML is ignored locally; valid independent evidence can
  still produce a preview.
- The importer captures source image URLs and provenance only. Bulk gallery
  generation and image enhancement are separate owner-reviewed pipelines.

Focused coverage lives in `src/lib/source-reconstruction.test.tsx` with French
structured data, malformed Spanish markup, SSRF-hostile assets, contrast repair,
persisted scalar projection, and an HTML-to-no-model-renderer path.
