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
docker exec cornershopdev \
  bun run operator:import:le-petit-meunier
```

The preflight stops if the canonical slug, the legacy
`restaurant-le-petit-meunier` slug, the normalized source identity, or the
source URL already exists. After confirming the RDS recovery window is healthy,
execute the same reviewed import:

```bash
docker exec cornershopdev \
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
docker exec cornershopdev \
  bun run operator:grant-superadmin --email owner@example.com
```

Apply it only after confirming the target:

```bash
docker exec cornershopdev \
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

## Deployment

The manually dispatched GitHub Actions workflow builds the Docker image without
production secrets, uploads the immutable image archive to the private
deployment bucket, and assumes the repository-scoped AWS OIDC role. Merging to
`main` never deploys automatically. An operator dispatches production only after
the scoped IAM policy, SSM parameters, host bootstrap, and DNS prerequisites are
reviewed and ready. The role may upload only Cornershopdev artifacts and send only
`AWS-RunShellScript` commands to the production instance.

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
