# Restofront first-customer validation runbook

**Runbook version:** 2026-07-26

**Issues:** [#20](https://github.com/VincentShipsIt/cornershopdev/issues/20)
and [#47](https://github.com/VincentShipsIt/cornershopdev/issues/47)

**Candidate:** Le Petit Meunier

**Current decision:** `HOLD — do not invite or charge`

This is the commercial and operational exit plan for the first paid Restofront
restaurant. It separates verified platform evidence from evidence that can only
come from an authorized restaurant owner and a real payment. A working preview,
green deploy, or founder test never substitutes for owner consent, ownership
verification, a settled Stripe charge, or a published customer domain.

## The one-price offer

### Restofront Founding Restaurant — €49/month

VAT is added when applicable. There is no setup fee, annual alternative,
discount, trial, second tier, or usage charge in the first-customer offer. The
restaurant can cancel monthly.

The outcome is one maintained, mobile-first restaurant website on the
restaurant's own domain:

- Restofront imports the existing public menu and restaurant details into a
  private preview.
- The owner reviews and corrects the preview before anything is published.
- The owner can edit menu content and restaurant details after claiming.
- Restofront connects the restaurant's custom domain and provides SSL.
- Existing booking, ordering, and delivery destinations are preserved as
  external links.
- Hosting, the owner workspace, first-party booking-request inbox, and
  first-party traffic/conversion reporting are included.
- Founder-assisted import, verification, and domain setup are included for this
  validation customer and measured as onboarding cost.

The offer does **not** include native ordering, POS integration, loyalty,
branded apps, Google Business Profile synchronization, SEO or revenue
guarantees, unlimited redesigns, or rights to reuse images the restaurant does
not own. Generated food imagery is removed from this offer. Only source images,
owner uploads, or explicitly permissioned customer imagery may go live.

### Promise ledger

| Promise | Offer status | Evidence or gate |
| --- | --- | --- |
| Private prefilled preview | Working | Le Petit Meunier preview returned HTTP 200 on 2026-07-26. Owner approval is still absent. |
| Owner-editable menu and details | Working in the customer workspace | A real owner edit remains unverified. Access depends on safe claim and provisioning. |
| Existing booking/ordering destinations preserved | Working in product design | Compare the source and published URLs before launch; no customer-path evidence exists yet. |
| Custom domain and SSL | Working platform capability | Must be proven on a domain the restaurant has authorized. A platform or Restofront domain does not count. |
| Booking-request inbox and first-party analytics | Deployed in PR #59 | Analytics activate only on a verified customer domain; no customer-domain data exists yet. |
| Safe private Save and atomic Publish | Upcoming, blocked by #18 | Do not imply that edits are isolated from the public site until #18 passes. |
| Secure, owner-bound invitation | Upcoming, blocked by #13 | Do not send a claim URL or accept an email as ownership proof. |
| Durable one-plan billing lifecycle | Upcoming, blocked by #8 and #13 | Do not initiate a live checkout until the authorized claim and webhook lifecycle pass. |

The live Restofront marketing page still advertises `$25` Starter and `$50`
Growth plans and claims generated imagery. That page conflicts with this offer.
It must be aligned to the single €49 plan and authentic-image policy before it
is used in a sales conversation. Until then, this runbook is the source of truth
for the validation offer.

## Production evidence snapshot

The following is platform-readiness evidence only.

| Check | Verified evidence | What it does not prove |
| --- | --- | --- |
| PR #59 | Merged as `ae915911e55f76edbcd0134c6b867c8215147150`; PR `verify` passed. | No customer used the lead inbox or analytics. |
| Production deploy | Workflow run `30216461217` deployed the same SHA. `verify`, `deploy / deploy`, Systems Manager deployment, and production verification completed successfully at 2026-07-26 19:20 UTC. | No payment, claim, edit, publish, or customer-domain journey occurred. |
| Cornershopdev ingress | `cornershop.dev` and `www.cornershop.dev` returned HTTP 200 through Caddy at 2026-07-26 20:13 UTC. | This is the factory domain, not a customer domain. |
| Restofront AWS DNS cutover | `restofront.com` resolved to `52.8.153.188`; `www.restofront.com` was a CNAME to the apex and resolved to the same address. Both returned HTTP 200 through Caddy and rewrote to `/niche/restaurant`. | Restofront is the niche marketing domain, not proof that a restaurant authorized DNS. |
| Live health | `/api/health/live` returned HTTP 200 on both `cornershop.dev` and `api.cornershop.dev`. | Liveness is not the bearer-authenticated dependency-readiness check and not an alert-delivery test. |
| Candidate preview | `/preview/le-petit-meunier` returned HTTP 200 through both Cornershopdev and Restofront. | The restaurant owner has not been verified and has not approved the content or imagery. |

Keep the GitHub run URL, probe timestamps, response codes, DNS answers, and the
final customer artifacts together in issue #20. Never attach secrets, raw
tokens, private customer contact data, or Stripe payment details beyond the
non-sensitive identifiers needed to verify the event.

## Acceptance evidence matrix

Statuses mean:

- `VERIFIED` — objective evidence already exists.
- `DOCUMENTED` — the rule or offer is written, but the customer event has not
  happened.
- `BLOCKED` — a named engineering dependency prevents safe execution.
- `HUMAN` — only an authorized person or real-world event can supply evidence.

| Issue criterion | Status on 2026-07-26 | Required acceptance evidence | Dependency or owner |
| --- | --- | --- | --- |
| #20: operator creates or opens the Le Petit Meunier lead | `HUMAN` | Timestamped operator-console record for the canonical `le-petit-meunier` site, with no private contact data copied into GitHub. | Operator action; not blocked by #18, #13, or #8. |
| #20: verified owner accepts a single-use invitation | `BLOCKED` | Invitation audit events showing creation, verification, one acceptance, expiry, and failed replay; owner identity/authority attestation stored privately. | #13, plus real owner consent. |
| #20: Stripe collects the first payment and webhook provisions the account | `BLOCKED` | Settled live-mode Checkout/Payment identifier, matching idempotent webhook event, and one user, organization, owner membership, and active subscription. Redact personal/payment data. | #13 then #8, plus customer authorization to charge. |
| #20: owner signs in and edits a menu item | `BLOCKED` | Owner session audit, before/after value, and owner confirmation that the edit is intentional. | #13 and #8 provision access; real owner action. |
| #20: Save changes only the private preview | `BLOCKED` | Before/after captures proving the draft changed while the public snapshot and custom domain did not. | #18. |
| #20: Publish atomically updates the public site | `BLOCKED` | Publish audit event and immutable version identifiers; old version remains live on a forced validation failure; new version appears only after successful publish. | #18. |
| #20: verified custom domain serves the correct site with valid SSL | `BLOCKED` | Owner-authorized DNS change, platform domain-verification record, public DNS answer, valid certificate, HTTP 200, and content/version match to the published snapshot. | #18 for the served snapshot; #13 and #8 for the safe paid-owner path; owner/domain administrator action. |
| #20: booking and ordering links remain unchanged | `HUMAN` | Machine-readable source-versus-published URL comparison plus owner confirmation for every retained provider link. | Final launch check; not directly blocked by #18, #13, or #8. |
| #20: checkout, publish, and public-site failure alerting | `BLOCKED` | One safe synthetic failure per path with timestamped alert receipt, destination, acknowledgement, and runbook link. | #8 owns checkout failure behavior; #18 owns publish failure behavior. Public-site alerting remains a separate operations gate. |
| #20: price, onboarding time, support, and decision date recorded | `DOCUMENTED` | Completed worksheet below and a calendar/review link dated exactly 30 days after the first settled charge. | Founder records actuals; no engineering dependency. |
| #20: evidence and operational instructions attached | `DOCUMENTED` | Link this runbook now; attach the completed evidence rows only after each event occurs. | Issue owner. |
| #47: one price and offer written before the first conversation | `DOCUMENTED` | Immutable link to this runbook revision predating the first recorded conversation. | Commercial owner. Public pricing must be aligned before use. |
| #47: every promised capability is working, upcoming, or removed | `DOCUMENTED` | Promise ledger above reviewed immediately before the conversation. | Commercial owner; update when #18, #13, or #8 lands. |
| #47: first restaurant pays and reaches a published custom domain | `BLOCKED` | Same payment, publication, DNS, SSL, and content-match evidence as #20. | #13, #8, #18, and customer action. |
| #47: founder-assisted work and recurring support cost recorded | `HUMAN` | Completed onboarding entries and at least the first 30 days of support entries in the worksheet. | Founder; actual activity only. |
| #47: second qualified restaurant lead documented | `HUMAN` | A second lead record satisfying every qualification rule below. | Commercial acquisition; no engineering dependency. |
| #47: dated keep/change/stop review scheduled and recorded | `HUMAN` | Calendar/review link scheduled for `first settled charge date + 30 calendar days`, then completed decision record. | Founder; cannot be dated until a real first charge exists. |

## Exact dependency boundary

### #18 — safe draft and publish

#18 blocks proof that Save is private, Publish is validated and atomic, failed
publication leaves the current site untouched, and the custom domain always
serves the latest immutable published snapshot. It therefore blocks #20's
private-Save, atomic-Publish, publish-alert, and correct-published-domain
criteria, plus #47's published-custom-domain criterion.

#18 does not block writing the offer, creating/opening the operator lead,
qualifying a second lead, measuring founder time, comparing source integration
URLs, or scheduling the decision after a real charge.

### #13 — secure claiming and ownership verification

#13 blocks any claim invitation, owner acceptance, or checkout being treated as
authorized. It therefore blocks #20's verified single-use invitation, safe
first payment, provisioned owner access, real owner edit, and the trusted-owner
portion of the custom-domain journey. It also blocks #47's paid-customer exit.

A public preview URL, an email entered into checkout, founder familiarity with
the restaurant, or control of the Restofront domain is not ownership proof.

### #8 — durable Stripe provisioning and subscription lifecycle

#8 blocks a live charge because provisioning still cannot be accepted as
idempotent and browser-independent, the full subscription lifecycle is not
verified, and access gates are incomplete. It therefore blocks #20's payment
and provisioning criterion, the paid owner session used for the edit, checkout
failure evidence, and subscription-gated publication. It also blocks #47's
first-payment and published-custom-domain exit.

Neither a Stripe test-mode success nor a browser return from Checkout counts as
the first payment.

## Founder-assisted onboarding and support-cost worksheet

Create one private worksheet per customer. GitHub receives only redacted totals
and evidence links.

### Customer and commercial record

| Field | Actual |
| --- | --- |
| Customer record ID | `[private CRM/operator ID]` |
| Restaurant | `[name]` |
| City/country | `[city, country]` |
| Authorized owner/representative verified at | `[timestamp — pending]` |
| Offer revision shown | `[commit SHA]` |
| Price | `€49/month + applicable VAT` |
| First settled charge at | `[timestamp — pending]` |
| Stripe non-sensitive evidence ID | `[pending]` |
| Custom domain | `[pending]` |
| Published version ID | `[pending]` |
| 30-day review date | `[first settled charge date + 30 calendar days]` |

### One-time founder-assisted onboarding

Record minutes, even when the activity is bundled into the €49 offer.

| Activity | Started | Finished | Founder minutes | External cost | Notes/evidence |
| --- | --- | --- | ---: | ---: | --- |
| Lead review and source validation |  |  |  |  |  |
| Content/menu import and corrections |  |  |  |  |  |
| Ownership verification assistance |  |  |  |  |  |
| Owner walkthrough and intentional edit |  |  |  |  |  |
| Booking/ordering link comparison |  |  |  |  |  |
| DNS and SSL assistance |  |  |  |  |  |
| Publish and acceptance checks |  |  |  |  |  |
| Billing/support handoff |  |  |  |  |  |
| **Onboarding total** |  |  | **0** | **€0.00** |  |

Also record owner claim elapsed time separately. The live kill threshold is
more than 20 minutes to complete a claim, or fewer than 60% of owners who start
and finish it.

### Recurring support log

| Date | Category | Founder minutes | External cost | Root cause | Repeatable fix or product change |
| --- | --- | ---: | ---: | --- | --- |
|  | content/menu |  |  |  |  |
|  | domain/SSL |  |  |  |  |
|  | billing |  |  |  |  |
|  | booking/ordering link |  |  |  |  |
|  | incident/other |  |  |  |  |
| **First 30-day total** |  | **0** | **€0.00** |  |  |

Recurring support above 30 founder minutes per customer per month triggers the
existing stop/change threshold.

### Unit economics

Fill these with actual provider charges and an explicit internal founder-hour
rate; do not silently value founder time at zero.

```text
monthly revenue excluding VAT                    = €49.00
payment processing                               = [actual]
incremental hosting/storage/AI/email              = [actual]
other customer-variable cost                     = [actual]
gross profit before founder labour                = revenue - variable costs
gross margin                                      = gross profit / revenue

internal founder hourly rate                      = [explicit €/hour]
recurring support cost                            = support minutes / 60 × rate
monthly contribution after recurring support      = gross profit - support cost
onboarding labour cost                            = onboarding minutes / 60 × rate
12-month onboarding amortization                  = onboarding labour cost / 12
12-month monthly contribution after founder work  =
  gross profit - support cost - onboarding amortization
```

Record CAC separately. The existing commercial stop threshold is CAC above
€200 at €49/month.

## Second-qualified-lead gate

Do not open the P2 gate until a second restaurant satisfies every item below.
A scraped listing, generated preview, email address, or restaurant name alone is
not a qualified lead.

- It is a single-location independent restaurant in the same launch city and
  country as the validation customer.
- It has a weak or missing website, a public menu that can be lawfully reviewed,
  and existing booking/ordering providers that can remain external.
- A named owner or authorized decision-maker has explicitly agreed to discuss
  the Restofront offer or requested follow-up through a lawful channel.
- The lawful contact basis and consent/follow-up evidence are recorded
  privately; no consent is inferred from public contact details.
- The decision-maker's problem, current website/provider setup, pricing
  reaction, principal objection, and target decision timing are recorded.
- A concrete next step and date exist.
- No payment or domain change is requested before #13 and #8 pass.

Required redacted issue evidence:

```text
Lead record ID:
Qualified at:
City/country:
Fit criteria passed:
Decision-maker authority verified:
Lawful contact/consent evidence location:
Problem and pricing reaction:
Principal objection:
Next step and date:
Disqualifying risk:
```

## Thirty-day keep/change/stop review

**Template version:** 2026-07-26

**First settled charge date:** `[YYYY-MM-DD — pending]`

**Decision meeting date:** `[YYYY-MM-DD = first charge + 30 calendar days]`

**Calendar/review link:** `[pending]`

**Decision owner:** Vincent

Schedule the meeting within 24 hours of the first settled live-mode charge.
Because no first charge is verified, the meeting date is intentionally blank;
inventing a date would falsely imply that the 30-day clock has started.

### Inputs at the decision meeting

| Measure | Actual | Keep/change/stop comparison |
| --- | ---: | --- |
| Delivered previews |  | Conversation rate below 8% after at least 50 delivered previews is a stop/change signal. |
| Qualified conversations |  | Record channel and lawful contact basis. |
| Paying customers |  | Fewer than 5 from roughly 60 previews, or below 4% preview-to-paid, is a stop/change signal. |
| Preview-to-paid conversion |  | Compare with 4%. |
| CAC |  | Above €200 at €49/month is a stop/change signal. |
| Claim completion time |  | Above 20 minutes is a stop/change signal. |
| Claim completion rate |  | Below 60% is a stop/change signal. |
| Founder onboarding minutes |  | Explain the largest manual steps. |
| Recurring support minutes/customer |  | Above 30 minutes/month is a stop/change signal. |
| Gross margin before founder labour |  | Use actual variable costs. |
| Contribution after founder labour |  | Include recurring support and 12-month onboarding amortization. |
| Prompted menu-update completion |  | Below 30% of live customers is a stop/change signal. |
| Credible legal/compliance challenges |  | Any credible challenge is a stop signal pending resolution. |
| Second qualified lead |  | Must exist before P2. |
| Customer outcome and retention intent |  | Owner statement or behavior; never founder inference. |

### Decision record

Choose exactly one:

- `KEEP` — continue the same €49 offer and one-city wedge for the next cohort.
- `CHANGE` — state one falsifiable change to price, scope, onboarding, channel,
  or product, its owner, deadline, and success threshold.
- `STOP` — stop acquiring or charging new restaurants, preserve customer
  obligations, and document the failed threshold and wind-down actions.

```text
Decision:
Decided at:
Evidence window:
Thresholds passed:
Thresholds failed:
Customer statement/evidence:
Second-lead status:
Reason:
Next action:
Owner:
Due date:
Issue/PR links:
```

## Execution order and human-action gates

1. Align the public Restofront pricing/promise copy with this offer.
2. Complete #18, #13, and #8; require green CI and an exact-head verifier pass
   for each current implementation head.
3. Demonstrate checkout, publish, and public-site failure alerts without a
   customer or live charge.
4. Open the canonical Le Petit Meunier lead and store the operator evidence.
5. Obtain owner consent and verify authority through #13. This cannot be
   delegated to code or inferred.
6. Have the owner review the source content, images, price, hours, and retained
   provider links.
7. Only with explicit customer authorization, run one live €49 checkout and
   verify webhook-only provisioning.
8. Have the owner sign in, make an intentional menu edit, prove Save isolation,
   then publish.
9. Only with owner/domain-administrator authorization, change DNS; verify SSL,
   published-version identity, and retained external links.
10. Start the worksheets, schedule the +30-day review, and qualify the second
    lead through a lawful, consented conversation.

Steps 5, 7, 8, 9, and the real sales conversation in step 10 are human-action
gates. This runbook authorizes none of them and records none as complete.
