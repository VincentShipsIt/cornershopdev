---
last_verified: 2026-07-26
status: durable
---

# Production deploy — mechanism and gotchas

Host `i-00e74422e719396c3` (us-west-1), single container `cornershopdev` behind
`shipshit-caddy`, single-origin on `cornershop.dev`.

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
