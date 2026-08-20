# Platform services runbook

Cornershopdev needs PostgreSQL, Redis, and Amazon S3 before production can accept
public imports. Production runs on the shared `api.shipshit.dev` EC2 host in an
isolated container, while data services and credentials remain isolated.

## Environment isolation

Never copy production database or AWS credentials into pull-request builds.
CI uses non-connecting placeholders; runtime credentials are loaded from
encrypted SSM parameters on the EC2 host.

| Service | Production isolation | Runtime variables |
| --- | --- | --- |
| PostgreSQL | Dedicated database and login on the existing private RDS instance | `DATABASE_URL` |
| Workflow | PostgreSQL World with a Cornershopdev job prefix and bounded concurrency | `WORKFLOW_*` |
| Redis | Dedicated container and persistent Docker volume, not published to the host | `REDIS_URL` |
| Images | Private versioned S3 bucket served through CloudFront OAC | `AWS_REGION`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL` |
| Billing | Stripe Checkout, signed webhooks, and Customer Portal | `STRIPE_*`, `CLAIM_TOKEN_SECRET` |
| Operator alerts | Durable PostgreSQL outbox delivered through Resend | `OPERATOR_ALERT_EMAILS`, `RESEND_API_KEY` |
| Restofront outreach | Explicit operator send, Workflow follow-up, signed Resend delivery events | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `WORKFLOW_*` |

Preview database provisioning is still an external infrastructure gate. Do not
mark it complete because a Preview URL exists in a local file or CI placeholder.
After the managed Preview database is created, compare the two reviewed runtime
values without printing either value:

```bash
bun run operator:verify-environment-isolation
```

Inject `PRODUCTION_DATABASE_URL` and `PREVIEW_DATABASE_URL` into that process
from the approved secret stores; do not put either value in shell history. The
command first compares normalized host, port, database, and schema identifiers,
then opens read-only transactions and compares the observed server/database
identities. It rejects credential-only differences, IPv4 and bracketed or
unbracketed IPv6 loopback hosts, malformed values, matching configuration,
matching observed identities, and unreachable targets. Attach its hash-only
JSON output to the release record; never attach the input URLs. This proves
database identity separation, not provider backup policy.

After configuring production, redeploy it and request `/api/health/ready`. The
route returns `200` only when the runtime services and billing configuration are
ready.
When configuration is missing, it returns `503` with the missing variable names
and remediation guidance. Provider failures return a generic unreachable
response without variable names or provider details. The route never returns
connection URLs, tokens, or provider error bodies.

Set a distinct `HEALTHCHECK_TOKEN` with at least 32 random bytes in each
environment. Readiness callers must send it as a bearer token:

```bash
curl --fail-with-body \
  --header "Authorization: Bearer $HEALTHCHECK_TOKEN" \
  https://<deployment-host>/api/health/ready
```

The route fails closed when the token is missing or invalid. Each application
instance also coalesces concurrent probes and caches the aggregate result for
five seconds to avoid amplifying health checks into the database, Redis, and
S3 providers.

Readiness also checks the operator-alert configuration and durable queue. An
exhausted alert or a due failed delivery returns `503` with instructions to run
the dispatcher; recipients and provider errors are never returned.

## Restofront outreach preflight

Outreach remains disabled until the operator has reviewed the private preview
and explicitly confirms the initial send. Creating or reopening a lead never
sends an email. The global pause in `/admin` is checked before every Workflow
send and every pause/resume change is written to the operator audit log.

Store `RESEND_WEBHOOK_SECRET` as a SecureString at
`/shipshit/production/cornershopdev/RESEND_WEBHOOK_SECRET`. In Resend, register
and enable this exact endpoint:

```text
https://cornershop.dev/api/webhooks/resend
```

Subscribe it to `email.sent`, `email.delivered`, `email.bounced`,
`email.complained`, `email.failed`, and `email.suppressed`. Before approving a
release, run the read-only preflight inside the exact candidate image with its
deployment env:

```bash
docker run --rm \
  --env-file /etc/cornershopdev/production.env \
  --network shipshit \
  --entrypoint bun \
  <reviewed-image> \
  run operator:preflight-outreach --environment production
```

The command opens read-only PostgreSQL transactions to verify
`20260819084000_outreach_operator_safety`, its required tables/columns/index,
and Workflow database reachability; lists Resend webhook metadata; and validates
the registered Restofront identity (`Vincent from Restofrontapp` with replies
to `vincent@restofront.com`). It performs no database writes, configuration
changes, or email sends. Output contains only check names, booleans, the public
webhook endpoint, and timestamps—never database URLs, API keys, signing
secrets, or provider error bodies. A failed check is a release blocker; do not
weaken the preflight or mark it ready from configuration screenshots.

## Image storage round trip

Bucket reachability alone does not prove the application write/read path.
After explicit production authorization, execute:

```bash
docker exec api-cornershop-dev \
  bun run operator:verify-image-storage --environment production --execute
```

The command writes separate `original-hero` and enhanced `hero` fixtures through
`storeSiteImage`, retrieves both with the configured S3 client, verifies their
exact SHA-256 content, and deletes both in a `finally` cleanup. Output contains
only fixture labels, digests, cleanup status, environment, and timestamp—never
bucket names, keys, URLs, credentials, or provider error bodies. A run without
`--execute` performs no write. When verification and cleanup both fail, the
output retains the primary write/read or content-mismatch failure and reports
`cleanup: failed` separately. Do not claim the production round trip until the
real command succeeds and cleanup is recorded as `completed`.

## Runtime operator alerts

Checkout webhook infrastructure failures, persisted-draft or server publication
failures, and failed public `/api/health/live` checks create a durable
`OperatorAlert`. The fingerprint deduplicates each incident for 15 minutes.
Delivery uses the configured factory sender and `OPERATOR_ALERT_EMAILS`, leases
each row against concurrent workers, and stops after three total attempts:
immediate delivery, retries after one and five minutes, then terminal exhaustion
after the third failure. A database or delivery exception for one row is counted
as pending and does not prevent later alerts in the same batch from running.
Recipient addresses and provider responses are absent from alert rows,
readiness responses, and command output.

Stripe webhook failure responses schedule their operator alert with Next.js
`after`, which sends the response without waiting for Resend while extending the
request lifecycle until alert capture settles. Do not replace this with a
floating promise; it may be dropped after the response completes.

Production deploys install a local systemd timer named
`cornershopdev-public-health.timer`. Every two minutes it starts the exact
deployed image with the encrypted environment file and checks the public HTTPS
endpoint. Alert draining is deliberately isolated in
`cornershopdev-operator-alerts.timer`, which runs every minute and processes at
most five rows per invocation. Five worst-case five-second delivery timeouts
consume 25 seconds inside its 45-second service limit; a saturated alert queue
therefore cannot delay or terminate the independent public health check. Both
timers use the existing host and providers; they create no separate billable
monitoring service.

Useful commands:

```bash
systemctl status cornershopdev-public-health.timer
journalctl -u cornershopdev-public-health.service --since '30 minutes ago'
systemctl status cornershopdev-operator-alerts.timer
journalctl -u cornershopdev-operator-alerts.service --since '30 minutes ago'
docker exec api-cornershop-dev bun run operator:dispatch-alerts
```

The repository owner owns primary response; the release operator is backup.
An `EXHAUSTED` row or alerting readiness failure is actionable: restore Resend
configuration/provider availability, run the dispatcher, confirm `DELIVERED`,
then document the incident. Do not reset attempt counters or delete the row to
make readiness green.

The code path is not evidence of delivery. Exercise each of the three alert
kinds in an authorized Preview environment, then one controlled production
public-health alert. Record timestamps and receipt without including recipient
addresses. Until those exercises occur, keep the acceptance item open.

## Database release procedure

Committed migrations in `prisma/migrations` are the only production schema
source. Do not use `prisma db push` or `prisma migrate dev` against Preview or
Production.

1. Confirm the target shell or CI environment contains the reviewed target
   `DATABASE_URL`.
2. Take or verify a provider backup before any destructive migration.
3. Before the account-email migration, run this read-only duplicate preflight:

   ```sql
   SELECT LOWER("email"), COUNT(*)
   FROM "User"
   GROUP BY LOWER("email")
   HAVING COUNT(*) > 1;
   ```

   Resolve any returned rows before deploying; the migration itself also fails
   closed on this condition.
4. Check migration state with `bun run db:migrate:status`.
5. Apply pending migrations with `bun run db:migrate:deploy`.
6. Redeploy the application and confirm `/api/health/ready` returns `200`.
7. Record the migration name, target environment, operator, and backup reference
   in the release record.

### Reviewed fixture imports

Approved lead previews must be imported with a dedicated create-only operator
script. Do not send them back through `/api/import`: that route crawls and
regenerates content instead of preserving the reviewed fixture.

Le Petit Meunier uses the canonical slug `le-petit-meunier`. Run the dry-run
inside the healthy production container first:

```bash
docker exec api-cornershop-dev \
  bun run operator:import:le-petit-meunier
```

The preflight stops if the canonical slug, the legacy
`restaurant-le-petit-meunier` slug, the normalized source identity, or the
source URL already exists. After confirming the RDS recovery window is healthy,
execute the same reviewed import:

```bash
docker exec api-cornershop-dev \
  bun run operator:import:le-petit-meunier --execute
```

The importer writes the site, catalog, integrations, version snapshot, import
job, and audit event in one serializable transaction. It verifies the expected
relation counts before commit and reads the canonical row back afterward.

### Superadmin bootstrap

The operator console at `/admin` is protected by two independent gates:

1. the user's PostgreSQL `platformRole` is `SUPERADMIN`;
2. the normalized email is present in the deployment's comma-separated
   `SUPERADMIN_EMAILS`.

Store `SUPERADMIN_EMAILS` as a SecureString under
`/shipshit/production/cornershopdev/SUPERADMIN_EMAILS`, deploy it, then preview
the role change:

```bash
docker exec api-cornershop-dev \
  bun run operator:grant-superadmin --email owner@example.com
```

Apply it only after confirming the target:

```bash
docker exec api-cornershop-dev \
  bun run operator:grant-superadmin --email owner@example.com --execute
```

The script can create a platform-only operator with no customer organization.
Removing either the database role or the environment entry revokes `/admin`.

The container applies committed Prisma migrations and the idempotent Workflow
bootstrap before it starts accepting traffic. A candidate must pass its
container health check before Caddy is reloaded. A failed migration stops the
candidate and leaves the current production container running.

## Backup and restore

- RDS keeps seven days of automated backups with deletion protection enabled.
- Keep Preview restore drills separate from Production. Perform a quarterly
  restore into a new, isolated database and verify the migration table and a
  sample restaurant record before deleting the drill database.
- Restore by creating a new database from the selected recovery point, applying
  any later reviewed migrations, validating it, then replacing `DATABASE_URL`
  through a reviewed environment change. Do not overwrite the existing database
  in place.
- S3 versioning protects image originals and derivatives from accidental
  replacement. Retain authentic source URLs and provenance in PostgreSQL.
- PostgreSQL backups include `OperatorAlert`; restore drills must confirm one
  delivered and one exhausted fixture retain attempts, timestamps, and status.
- After restore, run the alert dispatcher with delivery disabled until DNS and
  database identity are confirmed, preventing stale pending alerts from being
  mailed from a drill environment.

## Credential ownership and rotation

The repository owner is accountable for provider access, backup policy, and
release approval. A migration operator may execute the reviewed commands but
must not copy credentials into issues, pull requests, logs, or local production
environment files.

Rotate database and external-provider credentials every 90 days and immediately after
suspected exposure or an operator access change:

1. Create the replacement credential.
2. Update the matching SecureString under
   `/shipshit/production/cornershopdev/`.
3. Deploy the exact reviewed image and verify readiness.
4. Revoke the old credential only after production is healthy.
5. Record the date, owner, affected environment, and verification result without
   recording the credential value.

For `RESEND_API_KEY` or `OPERATOR_ALERT_EMAILS`, keep the old delivery path
active while the replacement is configured, dispatch all due rows, deploy and
confirm alerting readiness, then revoke the old key. For database rotation,
re-run the non-secret environment-isolation command after both environments are
updated. For S3 credentials or policies, re-run the cleanup-safe round trip in
Preview first and Production only with explicit approval.

## Deployment

The manually dispatched GitHub Actions workflow builds the Docker image without
production secrets, uploads the immutable image archive to the private
deployment bucket, and assumes the repository-scoped AWS OIDC role. Merging to
`main` never deploys automatically. An operator dispatches production only after
the scoped IAM policy, SSM parameters, host bootstrap, and DNS prerequisites are
reviewed and ready. The role may upload only Cornershopdev artifacts and send only
`AWS-RunShellScript` commands to the production instance.

The candidate image installs dependencies and runs migrations/operator commands
with Bun 1.3.14, but both the Next.js production build and standalone web server
run on the fully pinned Node.js 24.19.0 LTS Alpine image. CI starts the exact
candidate image, confirms both runtime versions and the Node PID 1 command,
then exercises public, sign-in, Better Auth session, and unauthenticated
dashboard responses before a release can use that image.

The host deployment script:

1. Loads Cornershopdev parameters from SSM without printing them.
2. Starts or verifies the isolated Redis container.
3. Loads the exact image artifact and starts a candidate.
4. Waits for `/api/health/ready`.
5. Swaps container names, reloads Caddy, and rolls back on failure.

The authorization migration intentionally changes the signed session payload
from an email address to the immutable database user id. Existing browser
sessions are invalidated once on rollout; affected customers sign in again by
requesting a new magic link.

Route53 sends `cornershop.dev`, `www.cornershop.dev`, and
`domains.cornershop.dev` to the EC2 Elastic IP. Caddy owns TLS termination.
Customer domains use on-demand TLS, gated by
`/api/domains/authorize`; unverified hostnames cannot cause certificate
issuance.
