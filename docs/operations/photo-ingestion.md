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
   signature, decoder, dimensions, pixel count, and supported format rather than
   trusting `Content-Type`. Every accepted request body is stream-counted before
   parsing: multipart has a 12.5 MB ceiling and JSON references have a 16 KiB
   ceiling. Missing, chunked, invalid, or dishonest `Content-Length` values cannot
   bypass either path; missing or unsupported media types fail closed.
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
   Hero selection takes a site row lock in a serializable transaction and is also
   protected by a partial unique database index. Full draft replacement reconciles
   catalog selections only by a unique normalized section/item identity; reorder
   follows the same item, while deletion or ambiguity unselects safely.
6. Enhancement accepts approved originals only. The model and numeric policy are
   validated at startup/use, batches and global concurrent runs are bounded,
   Redis meters requests, and a serializable reservation charges the full
   per-image ceiling against the site's admission ceiling before a provider call.
   Provider-reported overspend is recorded truthfully, the derivative is not
   stored, and the site's enhancement circuit remains disabled for review. These
   values are admission controls, not a claim that a provider cannot misreport or
   violate its quoted price.
7. A derivative is stored under original digest plus fidelity-config version and
   starts in `PENDING`. Before storage, provider bytes pass the same byte,
   signature, decoder, dimension, pixel-count, and JPEG/PNG/WebP/AVIF boundary as
   originals. The original remains active until explicit approval.
   Reject and restore switch back to the immutable original without deleting
   either object.
8. Model, storage, stale-lease, and ceiling failures leave the original usable.
   Idempotency is keyed by immutable photo identity plus normalized model/config,
   so even different client request keys converge on one durable operation and
   one provider claim. Audit events record evidence and identifiers, never photo
   bytes or provider response bodies.
9. Import generation removes source-page hero, gallery, and catalog URLs from the
   persisted draft. Discovery ingestion may fail without making a mutable remote
   URL publishable. Publication accepts a hero only when it exactly matches the
   approved selected immutable PhotoAsset projection; otherwise it leaves the live
   pointer unchanged.

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
derivative, and `cleanup: completed`. Cleanup enumerates and deletes the exact
object versions and delete markers, then lists again and fails if any remain. The
runtime role therefore requires `s3:ListBucketVersions`, `s3:DeleteObjectVersion`,
`s3:DeleteObject`, `s3:PutObject`, and `s3:GetObject` on the scoped verification
prefix/bucket. The command emits only labels and digests. A run without `--execute`
performs no writes.

Production evidence remains open in issue #10. The production role denial
observed during that audit must be repaired and reviewed before another authorized
write attempt; this PR does not run production writes or treat code-level tests as
round-trip evidence.

## Regression gates

- `src/lib/photo-discovery.test.ts`: bounded discovery, filtering, classification.
- `src/lib/photo-policy.test.ts`: model/config validation, worst-case admission,
  truthful overrun accounting, canonical operation identity, and concurrency.
- `src/lib/photo-image-validation.test.ts`: bounded decode, signature/media-type,
  dimensions, pixel count, and supported original/derivative formats.
- `src/lib/photo-upload-body.test.ts`: streaming multipart and JSON ceilings across
  missing, chunked, invalid, dishonest, and oversized length cases.
- `src/lib/photo-library.postgres.test.ts`: immutable dedupe, review/selection,
  concurrent hero uniqueness, canonical enhancement claim dedupe, safe catalog
  reorder/delete, import-failure publication gate, gallery preview/live projection,
  restore fallback, immutable publication, audit history, and site cost persistence.
- `src/lib/site-themes/restaurant/theme-registry.test.tsx`: selected gallery
  rendering and provenance across every bounded restaurant renderer.
- `src/lib/storage/images.test.ts`: safe content/config-addressed object keys.
- `src/lib/storage/versioned-cleanup.test.ts`: exact version/delete-marker cleanup
  and fail-closed post-delete verification.
