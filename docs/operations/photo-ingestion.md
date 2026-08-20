# Provenance-safe photo ingestion and harmonization

## Safety contract

The system may improve pixels only after it has persisted evidence of a real
photo. It never generates a missing product, dish, treatment result, person,
building, logo, or material scene element.

1. The importer reads at most six first-party content pages and ranks at most
   `PHOTO_DISCOVERY_MAX_IMAGES` references. It filters known logo, icon, tracking,
   avatar, map, GIF, and SVG assets.
2. Every accepted URL passes the existing DNS-pinned SSRF boundary and a 12 MB
   response limit. Uploads are authenticated, limited to 12 MB, and checked by
   binary signature rather than trusting `Content-Type`.
3. Bytes are SHA-256 addressed under the site's vertical namespace. S3 writes
   use `If-None-Match: *`; `(siteId, contentSha256)` is unique in PostgreSQL.
   Replays therefore return the existing immutable original.
4. First-party discoveries enter `PENDING`. Owner uploads and references carry
   `OWNER` provenance and are approved by the authenticated owner action that
   supplied them. Rejected originals cannot be selected.
5. Candidate `HERO`, `GALLERY`, and `CATALOG` roles are deterministic hints.
   The owner chooses the real placement. All selections increment the private
   draft revision and never publish automatically. Gallery reads project only
   approved selected assets, retain original URL plus provenance, and fall back
   to the immutable original unless an enhanced derivative is explicitly
   approved. Publishing copies that projection into the immutable site version,
   so later restore/reject actions change private preview only until republished.
6. Enhancement accepts approved originals only. The model and numeric policy are
   validated at startup/use, batches and global concurrent runs are bounded,
   Redis meters requests, and a serializable reservation enforces per-image and
   per-site microdollar ceilings before a provider call.
7. A derivative is stored under original digest plus fidelity-config version and
   starts in `PENDING`. The original remains active until explicit approval.
   Reject and restore switch back to the immutable original without deleting
   either object.
8. Model, storage, stale-lease, and ceiling failures leave the original usable.
   Idempotency keys make request replays return the durable run instead of paying
   twice. Audit events record evidence and identifiers, never photo bytes or
   provider response bodies.

## Configuration

Use the variables documented in `.env.example`. Cost values are integer
micro-US-dollars. The configured estimate must be a conservative upper bound for
one request and cannot exceed the per-image ceiling; the per-image ceiling cannot
exceed the per-site ceiling. Unsupported image models fail validation rather than
silently routing to an unknown provider.

## Production round trip

After explicit production authorization, run inside the deployed application
container:

```bash
bun run operator:verify-image-storage --environment production --execute
```

Success requires two distinct objects, byte-identical reads for original and
derivative, and `cleanup: completed`. The command emits only labels and digests.
A run without `--execute` performs no writes.

## Regression gates

- `src/lib/photo-discovery.test.ts`: bounded discovery, filtering, classification.
- `src/lib/photo-policy.test.ts`: model/config validation, ceilings, concurrency.
- `src/lib/photo-library.test.ts`: upload binary signature validation.
- `src/lib/photo-library.postgres.test.ts`: immutable dedupe, review/selection,
  gallery preview/live projection, restore fallback, immutable publication,
  audit history, and site cost persistence.
- `src/lib/site-themes/restaurant/theme-registry.test.tsx`: selected gallery
  rendering and provenance across every bounded restaurant renderer.
- `src/lib/storage/images.test.ts`: safe content/config-addressed object keys.
