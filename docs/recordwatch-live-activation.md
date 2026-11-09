# RecordWatch Premium — production activation

**Product:** USD $39 **one time per saved case**, Premium access for the lifetime of the RecordWatch service. No recurring subscription. Each other filing/case is sold separately. The $50 court-packet service and applicable court filing fees remain independent.

## Stripe live account — already prepared

- Account: **RecordPathAI** `acct_1TNJc5EGlcQZ3lmX` (**livemode true**, not Memory Studio).
- Product (live): `prod_VasFOc7uwGI14X` — RecordWatch Premium — Lifetime Per Case.
- Price (live): `price_1UZgVZEGlcQZ3lmX1AsUeaDz` — USD 3900 cents, `one_time`, nonrecurring, lookup key `recordwatch_premium_lifetime_case`.
- Stripe event destination (live): `we_1UZgUVEGlcQZ3lmXg0eJa4Zn`, URL `https://recordpathai.com/api/recordwatch/stripe-webhook`.
- Webhook events configured: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`.
- **Live webhook intentionally DISABLED** pending secure application configuration, migration and release validation.
- User previously indicated RecordWatch is **not currently collecting sales tax/VAT/GST**. No `automatic_tax` flag was enabled for checkout. Tax settings on the connected live account are active, but no tax registrations were found. Review legal obligations before changing collection behavior.

## Pending setup (do not paste API keys into chat or commit them)

1. **Supabase SQL editor:** Apply `supabase/migrations/20261108020000_recordwatch_lifetime_cases.sql` to the **existing** RecordPathAI Supabase project, after the already-applied `20261108010000_recordwatch_stripe_entitlements.sql`. Do not re-run a full bootstrap. The new table provides the server-only one-purchase-per-user-and-saved-case entitlement and read-only user access.
2. Confirm in Supabase SQL editor:

   ```sql
   select id from public.recordwatch_billing_migration_receipts
   where id in ('20261108010000_recordwatch_stripe_entitlements',
                '20261108020000_recordwatch_lifetime_cases');
   ```

   Both rows must be present.
3. **Google Cloud Secret Manager:** Prepare a LIVE Stripe API secret belonging to RecordPathAI, and the LIVE webhook signing secret for `we_1UZgUVEGlcQZ3lmXg0eJa4Zn`. Configure the Cloud Run service to expose them through env bindings named `STRIPE_RECORDWATCH_SECRET_KEY` and `STRIPE_RECORDWATCH_WEBHOOK_SECRET`, respectively. The code must never use the sandbox API key with this live price. Grant the service identity only the relevant secret access. Never overwrite the separate packet `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
4. **Cloud Run:** Update existing service `recordpathai`, project `recordpathai-production`, region `us-west1`. Set the **non-secret** variables:

   ```text
   STRIPE_RECORDWATCH_LIFETIME_PRICE_ID=price_1UZgVZEGlcQZ3lmX1AsUeaDz
   RECORDWATCH_LIVE_BILLING_ENABLED=true
   ```

   Preserve existing Supabase service-role configuration and identity. Use secret references for both Stripe secrets, never plaintext in source control.
5. **Deploy latest `main`** via `.github/workflows/deploy-cloud-run.yml`. The guarded release script uses a 0%-traffic revision and will refuse promotion until:
   - `/api/recordwatch/billing-readiness` responds HTTP 200 with `mode:"live"`, `prices_configured:true` (Stripe confirmed this account owns an active USD 3900 one-time price), `webhook_configured:true`, `secure_database_configured:true`, `live_enabled:true`, `ready:true`.
   - `/api/recordwatch/database-readiness` responds HTTP 200 with `migration_verified:true` and `ready:true`.
   - Existing static and application smoke checks pass, with automatic rollback safeguards.
6. **After deploy succeeds and both readiness endpoints verify:** Enable webhook `we_1UZgUVEGlcQZ3lmXg0eJa4Zn` in the live **RecordPathAI** Stripe account. Confirm deliveries return HTTP 200 and Stripe signature validation succeeds. Test a complete customer-owned case purchase and verify case-specific Premium entitlement, refresh, no renewal, duplicate purchase rejection, ledger entry, and refund/dispute revocation.
7. Keep automatic court status/SMS claims conditional on verified integrations and the applicant's SMS consent.

**Important:** Creating a Stripe product/price and a disabled webhook does **not** itself enable end-to-end live checkout. Until database migration, correct live secrets, guarded deployment and webhook verification succeed, the site must not claim paid RecordWatch purchases are operational.
