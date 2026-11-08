# RecordWatch Premium — $39 lifetime per case (Stripe sandbox)

**Current product model:** RecordWatch Premium is a **single USD $39 charge per saved case/filing**. The right to monitor that case continues for the lifetime of the RecordWatch service, with no automatic renewal. Buying one case does not unlock other cases. A separate $50 packet preparation/mailing service and applicable court fees are not included. Never claim automated court feeds or SMS delivery unless the respective provider is configured and operational.

## Stripe test account and prices (Nov 8, 2026)

- Stripe account: RecordPathAI sandbox `acct_1TNJcME2dI5377iP`, **test mode only**.
- Product: Premium RecordWatch `prod_VakCcspPZjVsUq`.
- **ACTIVE one-time $39 USD case price:** `price_1UZdMcE2dI5377iP266NvB6I`, type `one_time`, `recurring=null`, lookup key `recordwatch_premium_lifetime_case`.
- The former $4.99/month price `price_1UZYidE2dI5377iPeLRCbJzO` and $39/year price `price_1UZYifE2dI5377iPPdb0NZTO` are **inactive for new sales**. Existing subscriptions were **not canceled or migrated**.
- Dedicated sandbox webhook: `we_1UZYm8E2dI5377iPnUuEBUqr` at `https://recordpathai.com/api/recordwatch/stripe-webhook`.
- Tax is not configured in this sandbox price; review obligations and configure Stripe Tax before enabling live payments.

## Apply to the existing RecordPathAI Cloud Run service

**Keep the $50 packet Stripe environment and webhook unchanged.** Set this **new, non-secret environment variable** on the RecordPathAI Cloud Run service:

```text
STRIPE_RECORDWATCH_LIFETIME_PRICE_ID=price_1UZdMcE2dI5377iP266NvB6I
RECORDWATCH_LIVE_BILLING_ENABLED=false
```

Preserve the existing RecordWatch **sandbox** `STRIPE_RECORDWATCH_SECRET_KEY` and `STRIPE_RECORDWATCH_WEBHOOK_SECRET` (from Google Secret Manager). Do not paste secrets into GitHub. The older monthly/annual ID environment variables may be left intact for Stripe reconciliation of historical subscriptions; they are not used for new checkout. Use the separate RecordPathAI live account, live price and webhook secret only after an approved production launch.

**Database:** Apply `supabase/migrations/20261108020000_recordwatch_lifetime_cases.sql` to the existing Supabase project, **after** the previously verified `20261108010000_recordwatch_stripe_entitlements.sql`. Do not run a fresh bootstrap. The migration creates `recordwatch_lifetime_cases` with one entitlement per user and saved case, a Stripe Checkout Session/PaymentIntent identifier, revocation status, read-only owner RLS, and a private server migration receipt. The service role is the only writer.

```sql
select id, applied_at from public.recordwatch_billing_migration_receipts
where id in ('20261108010000_recordwatch_stripe_entitlements',
             '20261108020000_recordwatch_lifetime_cases');
```

Both receipts must be present. Once deployed, verify `/api/recordwatch/database-readiness` returns `{"migration_verified":true,"ready":true}`. The separate `/api/recordwatch/billing-readiness` requires the **new one-time price environment variable** and working Stripe configuration; `ready:true` only signals configuration, not a confirmed payment.

## Server-authoritative checkout, fulfillment and refunds

- POST `/api/recordwatch/checkout` requires an authenticated Supabase user and a saved-case UUID owned by them. The server refuses already-active lifetime purchases and directs still-active legacy subscribers to manage their old subscription.
- The server retrieves the configured Stripe price, verifies `one_time`, USD 3900 cents, and creates `mode:"payment"` Checkout, with metadata containing product, user ID, case ID, plan and price ID only (no sensitive case narrative).
- A signed `checkout.session.completed` or `checkout.session.async_payment_succeeded` event, or authenticated `/api/recordwatch/verify-checkout`, checks payment status, session amount, one Stripe line item, user/case ownership, and persists a case-scoped entitlement in Supabase.
- Replayed events cannot duplicate the case payment. If rare parallel checkouts pay for the same case, the second charge is refunded automatically.
- A signed `charge.refunded` or `charge.dispute.created` event revokes only the matching case's Premium status. The existing webhook now listens for these events as well as the old subscription/invoice lifecycle events.
- Payment ledger entries are case-scoped and idempotent. Historical subscriptions remain visible until they expire/cancel, but **new recurring subscriptions are no longer offered**.
- Customer messaging preferences must include the specific saved case; SMS consent and provider readiness are still required.

## End-to-end test checklist

1. Verify the new migration receipts and Cloud Run environment variable, then confirm both readiness endpoints.
2. Sign into RecordPathAI with a sandbox account that owns an actual saved case UUID.
3. From RecordWatch, select the case and click **Unlock This Case — $39 Once**. Confirm Stripe shows a one-time **$39** payment, not a subscription.
4. Complete a **test card** payment. Confirm the return page and webhook yield one active entitlement for exactly that saved case, and one $39 ledger entry.
5. Reload/refresh and check that the same case says **Lifetime Premium** with no renewal date; try another saved case and verify it is not unlocked.
6. Attempt a second purchase of the same case and confirm an HTTP 409 with **no new Checkout Session**.
7. Refund the test payment in Stripe. Confirm webhook delivery and that Premium for the original case is revoked (all unrelated cases unchanged).
8. Verify existing Stripe subscription cancellation and historical billing are still available for older sandbox subscribers.
9. Verify SMS only if an opted-in phone and real delivery provider exist; otherwise show status accurately and do not claim delivery.
10. Run application regression tests, confirm Cloud Run deployment, and review applicable taxes and terms **before enabling live billing**.

## Production limitation

This account currently has a **RecordPathAI sandbox** Stripe connection but no RecordPathAI live Stripe account. Creating a test price, webhook and GitHub code does **not** automatically configure Cloud Run, apply Supabase migrations or enable real customer payments.
