# Cornershopdev

Cornershopdev turns an existing local-business website—or just a business name—into a private, prefilled, mobile-first website preview. The registered vertical supplies the schema, prompts, providers, templates and language for its trade while the business keeps the ordering, delivery or booking tools it already uses.

## Product flow

1. Paste a restaurant URL or name.
2. Import public website content with SSRF-safe fetching and bounded HTML reads.
3. Deterministically recover structured business facts, hours, bounded catalog
   candidates, relevant navigation, authentic source assets, and field-level
   provenance before any model is considered.
4. Recover source logos/favicons and CSS/meta brand colours, repairing contrast
   where necessary before the palette reaches a renderer.
5. Detect the source language and preserve it as canonical. When OpenRouter is
   configured, generate a complete English translation in the structured pass.
6. Preserve first-party photography and optionally enhance exposure, colour, crop, noise, and clarity without changing the food or venue.
7. Save a private preview through a durable PostgreSQL-backed Workflow.
8. Verify ownership through a one-time business-domain email invitation or a concierge-approved owner email.
9. Claim the restaurant through invitation-bound Stripe Checkout; the completed checkout creates the prefilled owner account.
10. Authorize the restaurant domain for on-demand TLS and show the exact DNS records.
11. Monitor and maintain the menu, imagery, and external links from the dashboard.

## Customer workspace and operator console

Each claimed site has a tenant-scoped `/dashboard` workspace. Owners can edit
their site, connect a domain, review first-party booking leads, and move each
request from `NEW` to `CONTACTED` or `CLOSED`. Contact details are returned only
after the session is revalidated against that site's organization membership.

`/admin` is the platform operator console. It requires both a database
`SUPERADMIN` role and an email listed in `SUPERADMIN_EMAILS`. It shows signups,
subscriptions, request totals, portfolio traffic and conversion summaries, and
bounded per-site operational rows. The private owner/outreach recipient is
stored separately from the sourced public business email and is visible only in
this dual-gated console. Lead creation never sends mail: an
operator must review the persisted preview, confirm the initial Restofront
email, and can pause every workflow before its next send.

## First-party analytics

Analytics run only on verified customer domains. Factory pages, private preview
routes, bots, and automated browsers are excluded. The browser creates an
ephemeral visit UUID in `sessionStorage` and sends only:

- event UUID
- visit UUID
- site view or CTA click
- server-owned site identity derived from the verified request hostname
- server timestamp

Raw analytics events never store IP addresses, user-agent strings, referrers,
paths, query strings, provider URLs, names, email addresses, phone numbers, or
booking notes. A one-minute Redis limiter may use a transient hash derived from
the connection address; it is not written to PostgreSQL.

Booking requests remain the authoritative lead count, so a dropped analytics
beacon cannot lose a real lead. The corresponding `LEAD_CREATED` event is
server-owned and best effort. Client and operator workspaces expose 7, 30, and
90-day distinct-visit, CTA-visitor, booking-lead, and conversion metrics.
Raw analytics events are retained for 120 days and pruned daily under a
PostgreSQL advisory lock.

## Restaurant themes

New restaurant previews use a versioned theme registry driven by service model,
primary customer intent, menu experience, brand traits, price position,
location count, and photography quality:

- `terroir-editorial@1` — reservation-led, seasonal and editorial
- `counter-service@1` — external-order-led commerce browsing
- `after-dark@1` — atmospheric reservations, events and late-night visits

The public registry and live renderer power `/themes/restaurant`. AI may choose
only these IDs plus a closed set of validated colour and presentation tokens,
plain-text reasons, confidence, and two alternatives. Unknown IDs, arbitrary
CSS/HTML/classes/components/font URLs, malformed tokens, and low-contrast
colour combinations are rejected or repaired before rendering. Missing or
invalid model output uses the deterministic scorer.

The six earlier cuisine-era templates (`heritage`, `fresh`, `bold`,
`nocturne`, `coastal`, and `warm`) remain as a compatibility renderer. A stored
restaurant without a valid structured selection keeps its existing layout;
theme adoption is never inferred from a deployment.

Dish imagery is a saved presentation setting rather than a destructive edit.
Heritage and fine-dining templates default to a clean text-led menu; casual,
fresh, coastal, and bold concepts default to a small highlights gallery. Owners
can show or hide the gallery from the dashboard without deleting any images.

## Food retail vertical

`FOOD_RETAIL` is a bounded vertical for bakeries, pâtisseries, butchers,
delis, cheesemongers, grocers and similar local food shops. It reuses the shared
site/catalog/integration/publish engine but deliberately does not inherit table
reservations or restaurant lead capture. Its primary conversion action is an
existing preorder, click-and-collect, ordering or delivery link.

The schema supports product ranges, store hours, location and sourced pickup
details, seasonal availability, preorder notes, approved product photography,
and allergens only when an exact source URL is stored with the label. Unknown
products, prices, stock, pickup promises and allergens remain empty. English and
French storefront copy and translation overlays are included.

The vertical is registered for private studio imports and owner dashboards but
is not publicly launched: its marketing domain, hostnames and sender are null.
The implementation contract, test fixture, structured-data mapping and required
domain/sender/production-config evidence are documented in
[`docs/verticals/food-retail.md`](docs/verticals/food-retail.md).

## Internationalization

Site data uses one canonical source locale plus structured translation
overlays. Prices, currencies, images, addresses, provider names, and external
booking or ordering URLs remain shared, so translating a site cannot fork its
operational data. Menu sections, menu items, descriptions, dietary labels, and
link labels keep the same order and count in every locale.
If an existing provider URL already exposes a `lang` parameter, the rendered
link updates only that preference while preserving the same provider and flow.

Imports read the document language when available. Non-English sources receive
an English translation in the same schema-validated OpenRouter generation.
Restaurant templates and interface copy use small server-side dictionaries.
The canonical site is available at `/preview/[slug]`; translations use
`/preview/[slug]/[locale]` and expose language alternates in metadata.

## Stack

- Next.js 16 App Router and React 19
- Bun 1.3.14 for installs, Prisma/Workflow migrations, and operator tooling;
  pinned Node.js 24.19.0 LTS for Next.js builds and the production standalone
  server
- Tailwind CSS v4 and shadcn/ui
- Prisma 7 with PostgreSQL and the `pg` driver adapter
- Vercel AI SDK 6 with OpenRouter for structured text generation and optional
  source-photo enhancement
- Workflow DevKit with its self-hosted PostgreSQL World
- Amazon S3 and CloudFront for persistent enhanced derivatives
- Redis for public preview rate limits
- Stripe subscriptions
- Resend passwordless sign-in links
- Caddy on-demand TLS for verified customer domains

## Local setup

```bash
cp .env.example .env.local
bun install
bun run dev
```

The marketing site and deterministic preview flow work without external credentials. Production integrations activate when their environment variables are configured.

Do not run migrations against production from a local machine. Create the
database, then apply the committed migrations through the reviewed release
environment:

```bash
bun run db:migrate:status
bun run db:migrate:deploy
```

Preview and production service isolation, readiness checks, backups, restores,
and credential rotation are documented in
[`docs/operations/platform-services.md`](docs/operations/platform-services.md).
The one-price offer, evidence gates, founder-cost worksheet, second-lead
qualification, and 30-day decision record for the first paid restaurant are in
[`docs/operations/first-customer-validation.md`](docs/operations/first-customer-validation.md).
The read-only production evidence command and its fail-closed manifest are in
[`docs/operations/first-customer-production-exercise.md`](docs/operations/first-customer-production-exercise.md).
The bearer-authenticated `/api/health/ready` route verifies PostgreSQL, Redis,
Amazon S3, billing, and the operator-alert outbox without returning secret
values. Each application
instance coalesces concurrent checks and caches their aggregate result for five
seconds.

## Required production configuration

### Database

- `DATABASE_URL`

### Platform readiness

- `HEALTHCHECK_TOKEN`

Use distinct, randomly generated values with at least 32 bytes for Preview and
Production. Readiness callers send the value as a bearer token; the endpoint
fails closed when it is absent or invalid.

### AI generation

Restaurant crawling, same-origin page discovery, SSRF checks, and source
reconstruction run locally without a model. JSON-LD, metadata, explicit contact
links, semantic address markup, source navigation, logos/favicons, and CSS/meta
colours are recovered with bounded parsers. Every accepted fact keeps its source
URL, extraction method, and excerpt; evidence values are capped before draft
validation and malformed email candidates are skipped. Same-origin navigation
is persisted as safe internal hrefs, including for HTTP-only source sites.
Structured menu/product/service candidates
are accepted only when deterministic schema evidence exists. Each JSON-LD
entity keeps its owning page URL for provenance and relative asset resolution;
catalog availability remains unknown unless the source explicitly states it.

The persisted draft keeps the repaired palette, logo, favicon, contact details,
hours, canonical language, source navigation, authentic asset URLs, and the
evidence records used to recover them. Customer renderers consume that same
brand data. OpenRouter is optional and used to normalize or enrich the recovered
content into a structured vertical draft:

- `OPENROUTER_API_KEY`
- `OPENROUTER_TEXT_MODEL` defaults to `openrouter/auto`

OpenRouter Auto selects a compatible language model per import. Structured output
is schema validated before it is persisted.

Optional image enhancement runs through the same key and the same provider. The
model must expose `image` output; the default does.

- `OPENROUTER_IMAGE_MODEL` defaults to `google/gemini-3.1-flash-image`

Without `OPENROUTER_API_KEY` an import still completes with the reconstructed
business identity, branding, contact details, hours, integrations, and any
bounded structured catalog candidates. Hero enhancement is skipped.

- `WORKFLOW_ENABLED=true`
- `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`
- `WORKFLOW_POSTGRES_URL`

With workflow execution enabled, each server instance participates in a
database-backed due dispatcher. Active Starter subscriptions are checked every
30 days and Growth subscriptions every 7 days. The due slot and run state are
persisted before a bounded Workflow run starts, so restarts and duplicate
dispatchers are safe. Past-due/canceled subscriptions and paused sites perform
no source fetches. Findings enter the owner/operator review queue and never
mutate a draft or published version automatically.

### Authentic image enhancement

Configure the private production S3 bucket and its CloudFront public origin:

- `AWS_REGION`
- `S3_BUCKET`
- `S3_PUBLIC_BASE_URL`

Cornershopdev never creates a dish photograph from menu text. Enhancement requires
an existing HTTPS source image from the restaurant, an owner upload, or customer
UGC with explicit reuse permission. The immutable original URL and its
provenance are stored alongside the enhanced S3 derivative.

Allowed edits are exposure, white balance, highlight and shadow recovery,
denoising, sharpness, resolution, straightening, subtle cropping, and removal of
transient non-material distractions such as sensor dust. Ingredients, garnishes,
portions, plating, tableware, people, architecture, and material scene elements
must not be added, removed, replaced, moved, or regenerated. Owners can disable
automatic enhancement and must review the derivative before publishing.

### Preview abuse protection

Configure the isolated Redis service:

- `REDIS_URL`

Public imports are limited to five preview generations per IP address per hour.
Production fails closed when Redis is not configured, preventing an unbounded AI
generation endpoint.

### Billing

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `STRIPE_LEGACY_PRICE_IDS` (optional comma-separated access allowlist used
  during price migrations; never offered in Checkout)

Configure the webhook endpoint as:

```text
https://cornershop.dev/api/webhooks/stripe
```

Test-mode verification, the exact event allowlist, retry/replay behavior,
Customer Portal setup, and the production activation blockers are documented
in [`docs/operations/stripe-billing.md`](docs/operations/stripe-billing.md).
Checkout requires a valid hashed claim invitation; a public preview URL alone
cannot authorize billing or ownership. Launch Checkout offers only the Starter
founding subscription; the deployment-time Stripe preflight proves that it is
the active, tax-exclusive EUR 49.00 monthly Price.

### Owner sign-in

- `CLAIM_TOKEN_SECRET` with at least 32 random characters
- `BETTER_AUTH_SECRET` with at least 32 random characters, dedicated to session
  signing and distinct from `CLAIM_TOKEN_SECRET` in production
- `RESEND_API_KEY`
- `EMAIL_FROM`

### Operator alerts

- `OPERATOR_ALERT_EMAILS`
- `RESEND_API_KEY`

Checkout webhook, publication, and public-site health failures use a durable,
deduplicated outbox with bounded delivery retries. Deployment and exercise
instructions are in
[`docs/operations/platform-services.md`](docs/operations/platform-services.md).

### Restofront outreach

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `WORKFLOW_ENABLED=true`
- the complete `WORKFLOW_POSTGRES_*` contract listed above

Before release, run the read-only outreach preflight inside the reviewed
container. It checks the committed migration, registered Restofront sender and
reply-to, Workflow configuration, and the enabled Resend delivery webhook. It
prints only check names, booleans, the public webhook endpoint, and timestamps;
it never prints secret values and never sends an email.

```bash
bun run operator:preflight-outreach --environment production
```

### Customer domains

- `PUBLIC_APP_IP`
- `CUSTOM_DOMAIN_CNAME`
- `PLATFORM_HOSTNAMES`

The application records the hostname and returns the production A or CNAME
target. After DNS resolves, the owner verifies it in the dashboard. Caddy issues
TLS only when its authorization callback confirms that the domain is verified
and belongs to a restaurant.

### Production routing

The app is single-origin. Caddy on the EC2 application host terminates TLS for
every ingress the factory operates — `cornershop.dev`, `www`, `api`, `domains`,
and each customer storefront via on-demand TLS — and reverse-proxies all of them
to the one application container. No niche gets its own platform subdomain; a
niche brings only the storefront domain its customers actually type.

Leave `CORNERSHOPDEV_API_ORIGIN` empty. It exists for a future split deployment,
where it makes `next.config.ts` proxy `/api/*` to a separate API origin. Setting
it on a single-origin host proxies `/api/*` to a hostname that resolves back to
this same container, where the rewrite fires again — an infinite loop.

## Security boundaries

- Import URLs are limited to HTTP(S), DNS-resolved before every redirect, and rejected when any address is local or private.
- HTML responses are content-type checked, timeout bounded, and capped at 1.5 MB.
- AI output is validated with Zod before it enters the product.
- Existing booking and ordering links are extracted from source material and override model-generated links.
- Stripe webhooks verify the raw body signature.
- Restaurant claims require a hashed, expiring invitation bound to one site,
  intended email, and Stripe Checkout session. Raw invitation tokens are kept
  in URL fragments so embedded preview assets cannot receive them as referrers.
- Self-serve claims require the exact imported business email or an address on
  the exact source hostname. Ambiguous ownership requires a dual-gated
  superadmin approval from the operator console.
- Claim invitation requests and checkout attempts use isolated Redis rate-limit
  buckets and fail closed in production. Creation, verification, checkout,
  acceptance, and rejection events are recorded without tokens or contact data.
- Better Auth owns revocable, database-backed dashboard sessions behind a
  signed HTTP-only, same-site cookie.
- Restaurant mutations require a session matching the restaurant slug.
- Image enhancement and domain management require that same restaurant-scoped session.
- Public preview generation is rate limited and fails closed in production.
- Enhanced derivatives are persisted to private S3 storage and served through CloudFront while authentic originals and provenance remain available.
- Arbitrary restaurant images load directly in the browser instead of through the Next.js image proxy.

## Useful routes

- `/` — marketing and URL intake
- `/create` — import and preview studio
- `/claim/[slug]` — pricing and claim checkout
- `/dashboard` — authenticated vertical-aware owner management
- `/dashboard?demo=1` — local demo dashboard
- `/admin` — dual-gated superadmin operator console
- `/api/analytics/events` — first-party cookieless live-site event intake
- `/preview/[slug]` — private full-screen site preview
- `/preview/[slug]/[locale]` — translated site preview
