# Auth session production verification

The migration is additive: it creates `AuthMagicLink`, `AuthSession`, and
`AuthEvent` plus their enum types, indexes, and foreign keys. Existing signed
cookies become invalid after release and owners must request a new link.

## Release gate

1. Apply all Prisma migrations before routing traffic to the new application.
2. Confirm `DATABASE_URL`, `REDIS_URL`, `RESEND_API_KEY`,
   `NEXT_PUBLIC_APP_URL`, and the dual-gated `SUPERADMIN_EMAILS` are configured.
3. Request one owner link and one operator link from the production hostname.
4. In `/admin/auth`, confirm each attempt shows `sent` or a safe failure code.
5. Use the owner link once. Confirm a second use redirects to
   `/sign-in?error=invalid-link`.
6. For a multi-site account, confirm sign-in opens `/workspace/select`, then
   selection rotates the cookie and opens only that tenant.
7. Sign out and confirm the old cookie no longer resolves.
8. Remove a test membership and confirm its still-unexpired site session is
   denied immediately.

Record timestamps and screenshots in the release evidence. Do not mark email
receipt or link use as verified unless the real owner performed those actions.

## Failed delivery

Only `FAILED` or stale `PENDING` attempts are retryable. A retry revokes the old
link, creates a new 20-minute credential, and is capped at two replacements.
The console masks account emails and never exposes provider response bodies.
