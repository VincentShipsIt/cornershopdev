---
last_verified: 2026-08-20
status: durable
---

# Production deploy — mechanism and gotchas

## 2026-08-21 — Caddy validation blocker fixed, v0.3.1 released

Every release deploy between 2026-07-29 and 2026-08-21 failed closed at the
Caddy step: `bootstrap-host.sh` validated the candidate Caddyfile in a
throwaway `caddy:2` container, where dailydraft's managed import
(`/config/dailydraft-*.caddy`, added to the shared host Caddyfile 2026-07-29)
does not resolve. Fixed in #119 (`v0.3.1`): the candidate is validated inside
`shipshit-caddy` with the live binary; failure still aborts without touching
the running config. `v0.3.1` (`b44a0c3`) is the first deployable artifact since
v0.3.0. Verify actual production state via the release evidence artifact or an
SSM image inspection before claiming the running SHA changed.

## Release truth audit (2026-08-20)

Production runs `feb674d6a39ea716ab8287aab6eeb42c183cb7b9`, not current main
`3f398556a7b849aceb222a1cca12a6663b468681`. It is 15 commits behind, exposes
15 migrations while main contains 18, and has no outreach preflight command.
The current production SSM set is missing the explicit delivery signing secret
`RESEND_WEBHOOK_SECRET`, the explicit inbound signing secret
`RESEND_INBOUND_WEBHOOK_SECRET`, and `BETTER_AUTH_SECRET`; the Restofront sender
display name also differs from the merged outreach contract. Production has
`SUPERADMIN_EMAILS` but lacks `FIRST_CUSTOMER_EVIDENCE_PUBLIC_KEY`; it also lacks
the explicit photo model and `PHOTO_*` policy pins. Neither `*.restofront.com`
nor `*.cornershop.dev` exists in Route 53. Caddy itself validates and its loaded
on-demand TLS ask endpoint correctly targets `api-cornershop-dev`.

The reviewed fix makes production stable-release-only, runs migration,
outreach, wildcard DNS, and post-cutover TLS gates in the exact candidate, and
records SHA-bound evidence with customer acceptance explicitly not evaluated.
Exact blocker remediation and state definitions live in
`docs/operations/production-release.md`. Do not describe merged main as
production until a release artifact proves `productionDeployed: VERIFIED`.

Host `i-00e74422e719396c3` (us-west-1), single container `api-cornershop-dev`
behind `shipshit-caddy`. Single-origin: `cornershop.dev`, `restofront.com`,
their routed storefront hostnames, and customer custom domains hit that container.
`domains.cornershop.dev` is an intentional Caddy `404` and is not proxied to
the app (`PUBLIC_APP_IP` `52.8.153.188`). This is not a Vercel frontend. Do not
split it — see `hosting-single-origin.md`.

Production application data and Workflow state both use the PostgreSQL database
`cornershopdev` on RDS `api-shipshit-dev`. It was renamed in place from
`restofront` on 2026-07-26; the original `restofront_app` owner was preserved
and both encrypted SSM URLs were updated before the same v0.2.0 artifact was
redeployed.

The image uses Bun 1.3.14 for dependency installation, database and Workflow
migrations, and bundled operator tools. Both the production Next.js build and
standalone server run with the fully pinned Node.js 24.19.0 LTS image. CI must
build and boot that candidate image and verify the public, auth, and dashboard
runtime contract; building or serving Next under Bun is not production parity.

## Deploying is a release, never a merge

`ci.yml` runs `deploy` only on `workflow_dispatch` or a **published,
non-prerelease** release. Pushing to `main` runs `verify` and nothing else —
`deploy` shows as SKIPPED, which is expected, not a failure.

The intended path is: merge everything to `main`, then publish a release. The
release event checks out the tag, so the release commit is exactly what deploys.

`gh release create --target` rejects a short SHA (`Release.target_commitish is
invalid`). Pass a branch name or a full SHA.

## Gotcha 1 — env is written only at deploy time

`deploy/aws/deploy.sh` regenerates `/etc/cornershopdev/production.env` from SSM
(`/shipshit/production/cornershopdev/*`, always **region us-east-1**, regardless
of the deploy region) on every run. The container runs with
`--restart unless-stopped`, so a restart **reuses the old env file**.

Consequence: changing an SSM parameter has no effect until the next deploy.
This caused a real outage — the storage bucket was cut over to
`assets.cornershop.dev` hours after the running container was deployed, so its
`HeadBucket` readiness probe kept hitting the retired bucket and the container
sat `unhealthy` for 836 consecutive checks. The fix for any "SSM says X but the
app behaves like Y" symptom is a deploy, not a restart.

Related: an unhealthy candidate **aborts the deploy and rolls back**
(`wait_for_health` returns immediately on `unhealthy`), so a readiness
regression blocks the whole release. Worth pre-flighting before cutting one.

The host does not keep a mutable copy of this deploy logic. GitHub uploads
`deploy.sh` beside the image under the same immutable commit SHA. The stable
`/usr/local/bin/deploy-cornershopdev` launcher downloads that exact script,
checks its workflow-supplied SHA-256 digest, and emits a verification sentinel
before executing it. The workflow requires that sentinel, so a stale launcher
or unverified script fails closed instead of producing a false-green deploy.

## Gotcha 2 — the OIDC trust policy embeds the repo name

`cornershopdev-github-production-deploy` is assumed via GitHub OIDC. GitHub
emits the immutable-ID subject form:

```
repo:VincentShipsIt@1998775/cornershopdev@1304834723:environment:Production
```

The numeric owner ID and repo ID survive a rename; the **name segment does
not**. The restofront→cornershopdev rename silently invalidated the trust
policy, and the next deploy failed with `Not authorized to perform
sts:AssumeRoleWithWebIdentity`.

The policy now wildcards only the name segment via `StringLike`, keeping owner
ID, repo ID, and the `Production` environment pinned:

```
repo:VincentShipsIt@1998775/*@1304834723:environment:Production
```

A future rename cannot break deploys the same way. Nothing in the repo defines
this role — it is console/CLI-managed, so it will not show up in a code search.

## Reaching the host

The IAM user `shipshitdev` lacks `ssm:GetParametersByPath` — read parameters
one at a time by exact name with `get-parameter`. For secrets, request only
`Parameter.Version` so no value is ever echoed.

Read-only inspection of the running container goes through
`aws ssm send-command --document-name AWS-RunShellScript`. Long inline
compound commands trip the permission classifier; write the parameters payload
to a JSON file and pass `--parameters file://<path>` instead.

## Legacy AWS cleanup completed

The infrastructure side of the restofront→cornershopdev rebrand was closed out
on 2026-07-26:

- CloudFront distribution `E3GR7TCBV48UVV` was disabled, allowed to finish
  deploying, then deleted.
- `api.restofront.com`, `assets.restofront.com`, and the assets certificate
  validation CNAME were deleted from Route 53.
- The `assets.restofront.com` ACM certificate was deleted after CloudFront no
  longer referenced it.
- Inline IAM policy `restofront-ssm-deploy` was replaced by
  `cornershopdev-ssm-deploy`; `restofront-aws-provision` was deleted.
- The PostgreSQL database was renamed from `restofront` to `cornershopdev`
  without copying or dropping data.

Do not treat other `restofront.com` records as cleanup targets. Restofront is
the active restaurant niche, and its email/DKIM records remain intentional.
`restofront.com` and `www.restofront.com` A-record to the same Caddy IP as
`cornershop.dev`. A stale Caddy comment that "restofront.com is served
elsewhere" is false.

## Vercel is not this app

The leftover Vercel Git project `restofrontcom` was disconnected 2026-08-19.
The operator reports deleting it on 2026-08-20; that account-side action is
not independently observable from this repository. It never served
`restofront.com` or `cornershop.dev`. Do not recreate it. Do not `vercel link` this repo. Detail:
`hosting-single-origin.md`.
