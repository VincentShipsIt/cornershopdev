# Stripe billing operations

Stripe webhooks are the only durable provisioning path. A Checkout browser
return can reconcile a provisioned account and issue its signed session cookie,
but it never creates a user, organization, membership, site ownership, or
subscription.

## Runtime contract

The deployment requires all of:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `CLAIM_TOKEN_SECRET`

Starter and Growth must be distinct active recurring Stripe Price IDs. Test
mode and live mode have separate keys, prices, Customer Portal configurations,
webhook endpoints, and signing secrets. Never copy a test identifier into
Production or a live identifier into local development.

Checkout also requires an unexpired, unused `ClaimInvitation` whose SHA-256
token hash, intended email, and site all match. Issue #13 owns invitation
issuance, operator approval, self-serve ownership proof, rate limiting, and the
claim-attempt audit surface. Until that work ships, an authorized operator must
create invitations through a separately reviewed process; the public claim URL
alone cannot start Checkout.

## Events

Configure only the event types the application processes:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`

Every processed Stripe event ID is committed in `StripeWebhookEvent` in the
same database transaction as its effect. Duplicate deliveries return `2xx`
without repeating provisioning. Subscription handlers retrieve the current
Stripe Subscription and also reject an event older than the last persisted
Stripe event timestamp. Active and trialing grant paid access; incomplete,
incomplete-expired, past-due, unpaid, paused, canceled, missing, and
unconfigured-price subscriptions do not.

## Local and test-mode verification

1. Use test-mode Price IDs and a test secret key in `.env.local`. Never commit
   that file.
2. Start the app:

   ```bash
   bun run dev
   ```

3. In a second terminal, forward only the supported events:

   ```bash
   stripe listen \
     --events checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed \
     --forward-to http://localhost:3000/api/webhooks/stripe
   ```

4. Put the temporary `whsec_…` value printed by that process in
   `STRIPE_WEBHOOK_SECRET` for the local process only, then restart the app.
   The Stripe CLI secret is not the Dashboard endpoint secret.
5. Open a valid test claim invitation and complete Checkout with a Stripe test
   payment method. Confirm that the account reaches `/dashboard` even after
   repeating the event or closing the Checkout return tab.
6. Exercise failure and recovery with Stripe test clocks or Dashboard test
   subscriptions: move the subscription through `past_due`, restore payment,
   schedule cancellation, cancel it, and resume a paused test subscription.
   Confirm `/dashboard` shows the billing action and the custom-domain surface
   returns unavailable whenever access is not active.

The automated suite verifies signature-independent processing rules without
external credentials:

```bash
bun test \
  src/lib/billing-plans.test.ts \
  src/lib/claim-authorization.test.ts \
  src/lib/claim-security.test.ts \
  src/lib/stripe-subscription.test.ts \
  src/lib/stripe-webhook.test.ts \
  src/lib/billing-access.test.ts \
  src/lib/site-claim.test.ts
```

To replay a test event, use Workbench's **Resend** action or the Stripe CLI
event resend command for the event ID. The second delivery must still return
`2xx` and must not add another `StripeWebhookEvent`, subscription, organization,
membership, or owner.

## Production activation blockers

These are deliberate production changes and require Vincent's explicit
authority. This implementation does not perform them:

1. Create or approve the live Starter and Growth Products and recurring Prices.
   Record the approved offer, amount, currency, interval, and live Price IDs.
2. Configure and test the live Customer Portal. Enable only the intended
   payment-method, cancellation, invoice, and plan-change features.
3. Create the live webhook endpoint:

   ```text
   https://cornershop.dev/api/webhooks/stripe
   ```

   Select only the seven event types listed above.
4. Store the live secret key, endpoint signing secret, both live Price IDs, and
   a randomly generated claim-token secret of at least 32 characters as
   encrypted Production parameters under
   `/shipshit/production/cornershopdev/`.
5. Deploy the reviewed release. The deploy now fails before cutover when any
   billing parameter is absent, and `/api/health/ready` reports billing as
   misconfigured without returning any credential or identifier.
6. Complete one explicitly authorized low-risk live Checkout, then verify one
   owner, one organization, one owner membership, one claimed site, one
   subscription, and one event-ledger row. Resend that event and verify counts
   do not change.

Do not create live Products or Prices, enable the live portal, register the live
endpoint, change encrypted parameters, or charge a customer as part of routine
code verification.

## Failed delivery and replay

- Stripe retries failed live webhook deliveries for up to several days. A
  missing database returns `503`; it is never acknowledged as persisted.
- Invalid signatures return `400`.
- A signed but invalid or mismatched claim is recorded, logged without the
  invitation token or a secret, acknowledged, and not retried forever.
- Infrastructure and Stripe API failures return `500`, leaving no committed
  event-ledger row so a retry can process the event.
- Review failed deliveries in Stripe Workbench. Fix the database, configuration,
  or code fault first, deploy the fix, then resend the exact event.
- Rotate a webhook signing secret in Workbench and encrypted deployment
  parameters together. Redeploy before retiring the previous secret. Never put
  either value in an issue, pull request, shell transcript, or repository file.

Reference:
[Stripe webhook delivery and ordering](https://docs.stripe.com/webhooks),
[subscription webhook events](https://docs.stripe.com/billing/subscriptions/webhooks),
[Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), and
[Customer Portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal).
