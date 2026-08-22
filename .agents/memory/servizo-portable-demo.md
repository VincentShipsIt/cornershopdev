---
last_verified: 2026-08-22
status: durable
scope: Servizo portable demo — extractability contract
---

# Servizo portable demo

Servizo is a claimable demo on Cornershopdev, not a Tradefront / `LOCAL_SERVICE`
customer and not a new Prisma vertical yet.

## Surfaces

| Surface | Where |
|---|---|
| Marketing preview | `cornershop.dev/pro/servizo` (also `/preview/servizo` for legacy) |
| Owner app | `cornershop.dev/pro/servizo/app` → Pulse on Vercel |
| Claim | `bun run operator:claim:servizo --email …` after import |
| Discovery | Direct link only — `cornershop.dev/pro/servizo` (not factory-listed) |

## Coupling rules

- Stay on `Vertical.RESTAURANT` site tables until a product-brand niche is
  extracted into its own brand/domain/deploy.
- Do not route Servizo through Tradefront schema or marketing.
- Pulse remains an external HTTPS app linked from integrations / dashboard
  overview; do not merge Pulse UI into the site renderer.
- When extracting: move site draft + claim/org + Pulse under the new product;
  Cornershopdev keeps the factory only.

## Operator commands

```bash
bun run operator:import:servizo
bun run operator:import:servizo --execute
bun run operator:claim:servizo --email owner@example.com
bun run operator:claim:servizo --email owner@example.com --execute \
  --evidence-ref private-crm:servizo-portable-demo-owner-consent
```
