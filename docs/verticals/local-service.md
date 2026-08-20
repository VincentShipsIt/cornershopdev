# Local-service vertical

`LOCAL_SERVICE` is the bounded local-trade implementation for plumbers,
electricians, builders, repair businesses, and artisans. It is registered in
the existing vertical registry and uses the shared crawler, import workflow,
site tables, immutable publication snapshots, renderer, analytics, claim flow,
domain routing, and source-monitoring engine. It does not fork the app and it
does not accept model-authored HTML, CSS, class names, or components.

## Data contract

The generic site columns continue to own name, address, phone, source URL,
images, palette, locale, translations, hours, catalog sections, and external
integrations. Trade-only facts stay in the existing validated JSON attribute
bags:

| Concern | Bounded representation |
| --- | --- |
| Trade | `plumber`, `electrician`, `builder`, `repair`, `artisan`, or `general-trades` |
| Services | Shared catalog sections and items; per-service pricing posture, optional unit, and emergency eligibility |
| Service areas | Up to 24 explicit place names; no inferred radius |
| Availability | Closed posture enum with `not-stated` as the deterministic default |
| Credentials | Up to 16 name/issuer/reference records |
| Insurance | `not-stated`, `insured`, or `not-insured`, plus one bounded evidence detail |
| Trust signals | Up to 16 label/evidence records |
| Projects | Up to 24 title/description/location/HTTPS-or-local-image records |
| Conversion | Shared phone plus `contact`, `quote`, `booking`, and `social` HTTPS integrations |
| Hours | Shared bounded business-hours rows |

The model prompt forbids invented services, service areas, emergency response,
credentials, licences, insurance, guarantees, project outcomes, WhatsApp
numbers, quote tools, and prices. Deterministic imports default every trust and
availability field to empty or `not-stated`.

## Rendering and SEO

The shared renderer consumes a vertical-neutral `businessDetails` projection.
It renders phone, WhatsApp/contact, and quote actions; service pricing badges;
availability posture; service areas; credential and trust lists; completed
projects; business hours; and external tools. It explicitly disables the
restaurant/appointment booking-request form for local trades.

Published local-service sites emit escaped JSON-LD using the narrowest supported
Schema.org subtype (`Plumber`, `Electrician`, `GeneralContractor`,
`HomeAndConstructionBusiness`, or `ProfessionalService`). Structured data may
include services, service areas, hours, credentials, phone, social profiles,
and contact/quote actions only when those facts exist in the validated draft.
Private previews remain `noindex` and emit no structured data.

## Owner editing and persistence

The tenant-scoped dashboard loads the same validated nested draft used by the
preview and publication paths. Owners can edit business copy, phone, address,
hours, trade and availability posture, service areas, insurance evidence,
credentials, trust signals, services, projects, and external tools. Save uses
the existing optimistic draft revision, organization membership, same-origin
mutation, relation-replacement, and audit boundaries. Publish continues to read
only the persisted draft, requires billing, creates an immutable snapshot, and
never promotes an unclaimed or paused site.

## Launch gate

Tradefront is deliberately registered but unlaunched. Its marketing config has
no hostname, domain, or sender. `verticalLaunchReadiness` requires all of the
following before a niche can appear as launched:

1. a configured public domain;
2. that exact domain registered in the proxy hostname list;
3. a configured sender and reply-to address;
4. both mail domains equal to, or subdomains of, the niche domain.

Adding templates, enabling AI, or setting only a domain cannot launch the
product. DNS, sender verification, and the committed config must be reviewed as
one release gate.

## Verification evidence

Focused tests cover:

- fixture and schema round-tripping;
- field bounds and project-image URL safety;
- conservative deterministic defaults;
- provider classification for WhatsApp and quote tools;
- registry, slug, asset namespace, and launch-readiness behavior;
- LocalBusiness subtype, services, areas, hours, actions, and script escaping;
- existing restaurant and beauty vertical compatibility.

Run the complete repository gates on the Mac Studio and in required GitHub CI:

```bash
bunx next typegen
bunx tsc --noEmit
bun run lint
bun test
bun run build
```

Do not run a local Vercel command or deploy this vertical directly. Production
deployment remains release-driven after merge, and the local-service niche must
remain unlaunched until the launch gate above is genuinely satisfied.
