/**
 * Lighthouse CI budgets, run against the production build in CI after
 * `bun run build` (see `.github/workflows/ci.yml`).
 *
 * Routes are deliberately limited to `/` and `/niche/restaurant`: both are
 * fully static (`/niche/[vertical]` uses `generateStaticParams` with
 * `dynamicParams = false` and no database access). Every `/preview/[slug]`
 * route requires a live Postgres lookup (`findSiteView` /
 * `getCachedPublishedSiteView` in `src/lib/sites.ts`), and the CI `verify`
 * job's `DATABASE_URL` is an unconnected placeholder (see the env comment in
 * `.github/workflows/ci.yml`) with no Postgres service running alongside it.
 * Per the task's own escape hatch, that route is excluded rather than
 * standing up a database service just for this budget check.
 */
module.exports = {
  ci: {
    collect: {
      url: [
        "http://127.0.0.1:4173/",
        "http://127.0.0.1:4173/niche/restaurant",
      ],
      numberOfRuns: 1,
      // `next.config.ts` sets `output: "standalone"`, which `next start` (and
      // therefore `bun run start`) does not support — Next itself warns
      // `"next start" does not work with "output: standalone"`. The
      // `lighthouse:serve` script assembles `.next/standalone` (copying in
      // `.next/static` and `public`, mirroring the `Dockerfile`'s production
      // COPY steps) and runs the bundled `server.js` directly instead.
      //
      // `PLATFORM_HOSTNAMES=127.0.0.1` is also required: `src/proxy.ts`
      // queries the `Domain` table for any request whose hostname isn't a
      // recognized platform hostname, which would 500 against this CI job's
      // placeholder `DATABASE_URL`. Setting it to the bare loopback hostname
      // (the port is stripped by `normalizeHostname` before comparison)
      // makes 127.0.0.1:4173 match, short-circuiting that DB lookup exactly
      // like production traffic to `cornershop.dev` itself does.
      startServerCommand: "bun run lighthouse:serve",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 30000,
      // No `settings.preset` is set: Lighthouse's own default form factor is
      // already mobile (throttled network + CPU, 412x823 emulated viewport),
      // i.e. the "mobile preset" this budget targets is the tool's default.
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
};
