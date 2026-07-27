# Auth session production verification

The Better Auth migration is additive: it creates `Session`, `Account`, and
`Verification`, adds Better Auth's required user fields, and leaves
`AuthMagicLink`, `AuthSession`, and `AuthEvent` in place for a rollback-safe
release. The application stops reading `AuthSession`; existing cookies become
invalid after release and owners must request a new link.

Better Auth owns token consumption and revocable sessions. The platform keeps
its scanner-safe confirmation page, delivery audit trail, retry caps,
superadmin dual gate, and site-scoped authorization. Checkout creates sessions
through a private Better Auth plugin only after the one-time return token,
membership, invitation, and active subscription are revalidated.

## Release gate

1. Apply all Prisma migrations before routing traffic to the new application.
2. Confirm `DATABASE_URL`, `REDIS_URL`, `RESEND_API_KEY`,
   `NEXT_PUBLIC_APP_URL`, and the dual-gated `SUPERADMIN_EMAILS` are configured.
   Configure a dedicated `BETTER_AUTH_SECRET` with at least 32 random
   characters. `CLAIM_TOKEN_SECRET` is accepted as a rollout fallback only.
3. Request one owner link and one operator link from the production hostname.
4. In `/admin/auth`, confirm each attempt shows `sent` or a safe failure code.
5. Use the owner link once. Confirm a second use redirects to
   `/sign-in?error=invalid-link`.
6. For a multi-site account, confirm sign-in opens `/workspace/select`, then
   selection binds the same revocable session to one tenant.
7. Sign out and confirm the old cookie no longer resolves.
8. Remove a test membership and confirm its still-unexpired site session is
   denied immediately.
9. Confirm direct GET requests to `/api/auth/magic-link/verify` and direct POST
   requests to `/api/auth/sign-in/magic-link` cannot bypass the platform's
   staged verification and rate-limited issuer.
10. Confirm `/api/auth/checkout/bootstrap` is not directly reachable; only the
    validated `/api/auth/checkout` return route may invoke it internally.

Record timestamps and screenshots in the release evidence. Do not mark email
receipt or link use as verified unless the real owner performed those actions.

## Failed delivery

Only `FAILED` or stale `PENDING` attempts are retryable. A retry revokes the old
link, creates a new 20-minute credential, and is capped at two replacements.
The console masks account emails and never exposes provider response bodies.
