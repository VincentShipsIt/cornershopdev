---
last_verified: 2026-08-20
status: durable
scope: production hosting — Caddy/EC2 vs Vercel
---

# Hosting — single-origin on Caddy, not Vercel

Do not re-open "should the UI live on Vercel?" unless Vincent explicitly
reopens it. Decision recorded 2026-08-19 and effective 2026-08-20.

## Verdict

**Caddy does this product. Do not split.**

House pattern for other Ship Shit apps is Vercel frontend + Caddy API.
This repo is a website factory. Live restaurant sites, niche marketing,
platform subdomains, owner dashboard, and API share one Next.js process
behind `shipshit-caddy`. That is intentional, not a leftover.

## What actually serves traffic

| Hostname | Where | What you see |
|---|---|---|
| `restofront.com` / `www` | AWS `52.8.153.188`, Caddy → `api-cornershop-dev` | Restofront marketing / product |
| `cornershop.dev` / `www` / `api` | Same box, same container | Factory UI + API |
| `domains.cornershop.dev` | Same Caddy instance | Intentional `404`; never proxied to the app |
| `<slug>.restofront.com` | Same box, on-demand TLS | Customer site |
| Customer custom domain | Same box, on-demand TLS after verify | Customer site |

HTTP: `via: 1.1 Caddy`, `x-powered-by: Next.js`. No Vercel headers.
Deploy: published GitHub **release** → Docker → EC2 `i-00e74422e719396c3`.
Push to `main` only runs `verify`.

The container is named `api-cornershop-dev` because a split was sketched
and never finished. It still serves HTML.

## Why not Vercel for the restaurant UI

Customer hostnames must resolve to `PUBLIC_APP_IP`. Caddy issues Let's
Encrypt only after `/api/domains/authorize`. Hostname routing lives in
`src/proxy.ts` on this Next process. ISR `revalidateTag` after publish
must hit the process that serves the live site.

A Vercel cut would **not** take Next off the box. You would run two Next
apps, split cookies (`isSameOriginMutation`, magic links), and split
cache invalidation. Marketing/dashboard on Vercel is the expensive half
and the wrong one before a paying customer.

`CORNERSHOPDEV_API_ORIGIN` in `next.config.ts` is the stub for that split.
Leave it **empty** on this host. Setting it here proxies `/api/*` back
into the same container and loops.

Revisit only after GTM kill criteria are in play, and then only a thin
cut: Vercel for `cornershop.dev` factory marketing. Leave `restofront.com`,
dashboard, and live sites on Caddy.

## Vercel leftover (closed 2026-08-20)

Project `restofrontcom` (`prj_i8C3j660H4Gl43MJHwaWZmQLzwOM`) was the old
restofront Git integration. GitHub repo rename `restofront` →
`cornershopdev` kept repo ID `1304834723`, so every `main` push still
built that Vercel project. It never owned `restofront.com` or
`cornershop.dev` DNS. Builds failed (`BETTER_AUTH_SECRET` missing).

2026-08-19: Git disconnected, preview deploys off, PR comments off.
The operator reports that the project was deleted on 2026-08-20. That
external account action is not independently observable from this repository.
Do not recreate it or `vercel link` this repo. There is no intended
`cornershopdev` Vercel project.

Historical GitHub "Vercel" commit statuses on old SHAs can stay red.
They are not a current deploy.

## Related

- Deploy mechanics and SSM: `production-deploy.md`
- Restofront GTM scorecard: `restaurant-niche-gtm-audit.md`
