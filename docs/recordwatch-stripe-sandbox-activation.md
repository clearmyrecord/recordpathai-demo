# Premium RecordWatch — Stripe sandbox activation

**Scope:** RecordWatch premium monitoring only. This Stripe sandbox is separate from court packet checkout and from the Memory Studio Stripe accounts. Never use sandbox credentials to collect live money.

## Confirmed Stripe sandbox objects (Nov 8, 2026)

- Account: RecordPathAI sandbox (`acct_1TNJcME2dI5377iP`)
- Product: Premium RecordWatch (`prod_VakCcspPZjVsUq`)
- Monthly USD $4.99: `price_1UZYidE2dI5377iPeLRCbJzO`, recurring monthly
- Annual USD $39.00: `price_1UZYifE2dI5377iPPdb0NZTO`, recurring yearly
- Webhook endpoint: `we_1UZYm8E2dI5377iPnUuEBUqr` at `https://recordpathai.com/api/recordwatch/stripe-webhook`, sandbox only
- Sandbox Customer Portal: `bpc_1UZYnIE2dI5377iPwgN7ouxF` (default), payment method update, invoice history, cancellation at period end, no plan switching
- Stripe Tax collection is **not enabled**. Product and price tax codes are left unset while obligations are reviewed.

## Required Cloud Run configuration

In Google Cloud Console, open **Cloud Run > recordpathai > Edit & Deploy New Revision > Variables & Secrets**. Preserve the existing packet Stripe settings.

Set these **non-secret environment variables**:

```
STRIPE_RECORDWATCH_MONTHLY_PRICE_ID=price_1UZYidE2dI5377iPeLRCbJzO
STRIPE_RECORDWATCH_ANNUAL_PRICE_ID=price_1UZYifE2dI5377iPPdb0NZTO
RECORDWATCH_LIVE_BILLING_ENABLED=false
```

Add these **secrets using Google Secret Manager** and reference them as Secret Manager-backed environment variables. Do not commit or paste values into a public issue, chat, or source file:

- `STRIPE_RECORDWATCH_SECRET_KEY`: the **RecordPathAI sandbox** API secret key (`sk_test_...`); never use another merchant's key
- `STRIPE_RECORDWATCH_WEBHOOK_SECRET`: the signing secret (`whsec_...`) for webhook endpoint `we_1UZYm8E2dI5377iPnUuEBUqr`; available under the Stripe sandbox event destination's signing secret
- `SUPABASE_SERVICE_ROLE_KEY`: existing RecordPathAI private Supabase service-role key (if absent); service-role key must remain private

The existing `SUPABASE_URL` or `PUBLIC_SUPABASE_URL` must point to the RecordPathAI project. **Do not change** `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`: those belong to the separately verified court packet payment flow.

## Required Supabase migration

Review and apply `supabase/migrations/20261108010000_recordwatch_stripe_entitlements.sql` to the existing RecordPathAI Supabase project. It revokes direct client writes to the paid-subscription table and restricts Premium status to verified server-side Stripe events. Verify the full earlier Premium RecordWatch migration is present. Verify the service-role key can read and write `recordwatch_subscriptions` and ledger entries.

## Webhook

The sandbox event destination is already created in Stripe with these events:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

**Do not** register sandbox events to the packet endpoint `/api/stripe/webhook`. The correct dedicated endpoint is `/api/recordwatch/stripe-webhook`.

## Readiness and testing

Visit `https://recordpathai.com/api/recordwatch/billing-readiness`. It should return HTTP 200 with `ready:true`, `mode:"sandbox"`, `prices_configured:true`, `webhook_configured:true`, and `secure_database_configured:true` after configuration. This checks configuration presence, **not** that checkout or webhook fulfillment was successful.

Then test, with a **sandbox** card/test data only:
1. Sign into RecordPathAI using a testing account.
2. From RecordWatch, purchase the $4.99/month sandbox plan, confirm the checkout amount and success return.
3. Verify Stripe `checkout.session.completed` and subscription/invoice events show delivered in Stripe; check RecordWatch status, actual billing period, and ledger receipt.
4. Open Account > Manage subscription to confirm Customer Portal and payment-method update work.
5. Cancel renewal from the portal, confirm `cancel_at_period_end` and Premium access continuing only through the paid period.
6. Simulate renewal/payment failure and verify `invoice.paid`/`invoice.payment_failed` update status correctly; check webhook retries/idempotency.
7. Repeat with $39/year and confirm there is no duplicate subscription or charge.
8. Verify no notification is claimed as sent unless configured SMS/email providers actually delivered it.

**Never enable live checkout** based only on deployment tests. Add RecordPathAI's live Stripe environment, separate live price IDs and signing secret, after sandbox end-to-end verification and applicable legal/tax checks.
