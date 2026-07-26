# Cornershopdev

Cornershopdev turns an existing restaurant website—or just a restaurant name—into a private, prefilled, mobile-first website preview. The restaurant keeps its existing booking, ordering, and delivery providers. It claims the finished preview, subscribes, then connects its domain.

## Product flow

1. Paste a restaurant URL or name.
2. Import public website content with SSRF-safe fetching and bounded HTML reads.
3. Recover the menu, contact details, imagery, and external integrations.
4. Derive the colour palette from the source branding and select a cuisine-aware layout.
5. Detect the source language, preserve it as canonical, and generate a complete English translation during the same structured AI pass.
6. Preserve first-party photography and optionally enhance exposure, colour, crop, noise, and clarity without changing the food or venue.
7. Save a private preview through a durable PostgreSQL-backed Workflow.
8. Claim the restaurant through Stripe Checkout; the completed checkout creates the prefilled owner account.
9. Authorize the restaurant domain for on-demand TLS and show the exact DNS records.
10. Monitor and maintain the menu, imagery, and external links from the dashboard.

## Restaurant templates

Restaurant sites use Geist Sans rather than the Cornershopdev marketing display
font. The renderer automatically combines the imported brand palette with a
cuisine-aware layout:

- `heritage` — French, bistro, brasserie, and traditional restaurants
- `fresh` — healthy, vegan, vegetarian, organic, salad, and juice concepts
- `bold` — American, burger, barbecue, steak, and diner concepts
- `nocturne` — Japanese, sushi, ramen, izakaya, and Korean concepts
- `coastal` — seafood, fish, oyster, and coastal restaurants
- `warm` — Italian, pizza, pasta, Mediterranean, Spanish, and fallback concepts

Each template changes the hero structure, menu layout, weight, spacing, image
treatment, and copy—not only the colours.

Dish imagery is a saved presentation setting rather than a destructive edit.
Heritage and fine-dining templates default to a clean text-led menu; casual,
fresh, coastal, and bold concepts default to a small highlights gallery. Owners
can show or hide the gallery from the dashboard without deleting any images.

## Internationalization

Restaurant data uses one canonical source locale plus structured translation
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
- Bun
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
The bearer-authenticated `/api/health/ready` route verifies PostgreSQL, Redis,
and Amazon S3 without returning secret values. Each application
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

Restaurant crawling, same-origin page discovery, SSRF checks, contact recovery,
and integration detection run locally without a model. OpenRouter is used only
to normalize recovered content into a structured restaurant draft:

- `OPENROUTER_API_KEY`
- `OPENROUTER_TEXT_MODEL` defaults to `openrouter/auto`

OpenRouter Auto selects a compatible language model per import. Structured output
is schema validated before it is persisted.

Optional image enhancement runs through the same key and the same provider. The
model must expose `image` output; the default does.

- `OPENROUTER_IMAGE_MODEL` defaults to `google/gemini-3.1-flash-image-preview`

Without `OPENROUTER_API_KEY` an import still completes: the draft falls back to
the deterministic composer and hero enhancement is skipped.

- `WORKFLOW_ENABLED=true`
- `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`
- `WORKFLOW_POSTGRES_URL`

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

Configure the webhook endpoint as:

```text
https://api.cornershop.dev/api/webhooks/stripe
```

### Owner sign-in

- `CLAIM_TOKEN_SECRET` with at least 32 random characters
- `RESEND_API_KEY`
- `EMAIL_FROM`

### Customer domains

- `PUBLIC_APP_IP`
- `CUSTOM_DOMAIN_CNAME`
- `PLATFORM_HOSTNAMES`

The application records the hostname and returns the production A or CNAME
target. After DNS resolves, the owner verifies it in the dashboard. Caddy issues
TLS only when its authorization callback confirms that the domain is verified
and belongs to a restaurant.

### Production routing

The frontend remains on Vercel at `cornershop.dev` and `www.cornershop.dev`.
Set `CORNERSHOPDEV_API_ORIGIN=https://api.cornershop.dev` in the Vercel production
environment so same-origin `/api/*` requests are proxied to the API without
changing browser URLs. Route `api.cornershop.dev` and customer restaurant
domains through Caddy on the EC2 application host.

## Security boundaries

- Import URLs are limited to HTTP(S), DNS-resolved before every redirect, and rejected when any address is local or private.
- HTML responses are content-type checked, timeout bounded, and capped at 1.5 MB.
- AI output is validated with Zod before it enters the product.
- Existing booking and ordering links are extracted from source material and override model-generated links.
- Stripe webhooks verify the raw body signature.
- Dashboard sessions are HMAC-signed, HTTP-only, same-site cookies.
- Restaurant mutations require a session matching the restaurant slug.
- Image enhancement and domain management require that same restaurant-scoped session.
- Public preview generation is rate limited and fails closed in production.
- Enhanced derivatives are persisted to private S3 storage and served through CloudFront while authentic originals and provenance remain available.
- Arbitrary restaurant images load directly in the browser instead of through the Next.js image proxy.

## Useful routes

- `/` — marketing and URL intake
- `/create` — import and preview studio
- `/claim/[slug]` — pricing and claim checkout
- `/dashboard` — authenticated restaurant management
- `/dashboard?demo=1` — local demo dashboard
- `/preview/[slug]` — private full-screen restaurant preview
- `/preview/[slug]/[locale]` — translated restaurant preview
