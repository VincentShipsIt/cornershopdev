FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/cornershopdev_build
ENV DATABASE_URL=$DATABASE_URL
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN bun install --frozen-lockfile

FROM dependencies AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV WORKFLOW_TARGET_WORLD=@workflow/world-postgres
COPY . .
# Runtime secrets are injected by the host environment. Next evaluates auth
# routes while collecting page data, so the builder gets a non-production
# placeholder that is not inherited by the runner stage.
RUN BETTER_AUTH_SECRET=build-only-better-auth-secret-32-bytes bun run build
RUN bun build scripts/grant-superadmin.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/grant-superadmin.ts
RUN bun build scripts/import-le-petit-meunier.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/import-le-petit-meunier.ts
RUN bun build scripts/verify-environment-isolation.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/verify-environment-isolation.ts
RUN bun build scripts/verify-image-storage-roundtrip.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/verify-image-storage-roundtrip.ts
RUN bun build scripts/dispatch-operator-alerts.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/dispatch-operator-alerts.ts
RUN bun build scripts/monitor-public-site.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/monitor-public-site.ts
RUN bun build scripts/preflight-outreach.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/preflight-outreach.ts
RUN bun build scripts/preflight-platform-edge.ts \
  --target=bun \
  --packages=external \
  --outfile=.operator-scripts/preflight-platform-edge.ts

FROM oven/bun:1.3.14-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_EXTRA_CA_CERTS=/app/certs/aws-rds-global-bundle.pem

ADD --checksum=sha256:e5bb2084ccf45087bda1c9bffdea0eb15ee67f0b91646106e466714f9de3c7e3 \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  /app/certs/aws-rds-global-bundle.pem
RUN chmod 0444 /app/certs/aws-rds-global-bundle.pem

COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/prisma ./prisma
COPY --from=builder --chown=bun:bun /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=bun:bun /app/package.json ./package.json
COPY --from=builder --chown=bun:bun /app/.operator-scripts ./scripts
COPY --chown=bun:bun deploy/aws/container-entrypoint.sh ./deploy/aws/container-entrypoint.sh

USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=18 \
  CMD wget --header="Authorization: Bearer ${HEALTHCHECK_TOKEN}" \
    -qO- http://127.0.0.1:3000/api/health/ready >/dev/null || exit 1
ENTRYPOINT ["/app/deploy/aws/container-entrypoint.sh"]
