# RecordPathAI RecordWatch Premium email + SMS activation
Date: 2026-11-08. Status: code deployed, **sending disabled by default**.
Target Cloud Run: project `recordpathai-production`, region `us-west1`, service `recordpathai`.

## Customer terms and consent
- Free case tracking has **no outbound email or SMS**.
- $39 one-time RecordWatch Premium is scoped to the purchased **saved case**. Do not duplicate charges for several cases that may lawfully share one sealing application; grouped-filing entitlements remain a separate feature.
- When Premium is active, users can separately opt in to email or to SMS in `/recordwatch-dashboard.html`. Email starts OFF, SMS starts OFF. SMS consent may not be mandatory to purchase Premium.
- Messages at 180/90/30/7/0 days before a saved case's estimated eligibility date contain no charges, names, arrest dates, or court documents. This is a *timeline reminder*, not an official court notice or assurance of eligibility.
- SMS disclosures identify the sender, varying message frequency, message/data rates, STOP/HELP, Terms and Privacy. Signed STOP disables SMS even across multiple Premium cases for the same phone. Signed START unblocks but **does not** silently re-enroll a customer; new case-dashboard consent is required.
- No provider or Stripe key may be stored in frontend JS, GitHub, localStorage, marketing exports or applicant messages.

## Phase A — one-time Supabase migration
In the **correct RecordPathAI Supabase project**, execute only:
`supabase/migrations/20261108040000_recordwatch_premium_delivery.sql`
after the prior lifetime entitlement and notification-preference migrations. Do **not** rerun bootstrap. The SQL adds explicit email consent timestamp fields, private STOP suppression and exactly-once alert delivery ledger.

Verify in the SQL editor:
```sql
select count(*) as migration_verified from public.recordwatch_alert_migration_receipts
where id = '20261108040000_recordwatch_premium_delivery';
select count(*) as tables_created from information_schema.tables
where table_schema='public' and table_name in
('recordwatch_alert_deliveries','recordwatch_sms_suppressions','recordwatch_alert_migration_receipts');
select count(*) as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
('recordwatch_alert_deliveries','recordwatch_sms_suppressions','recordwatch_alert_migration_receipts') and c.relrowsecurity;
```
Expect 1, 3, 3 respectively. Fail closed if absent.

## Phase B — email (Resend)
1. Create/access the RecordPathAI Resend business account at https://resend.com . Verify domain `recordpathai.com` in Resend by adding its required DNS TXT/SPF/DKIM records with your DNS host. The from-address must be verified, e.g. `alerts@recordpathai.com`.
2. Create restricted outbound email API key in Resend. Store its value ONLY in Google Cloud Secret Manager (e.g. `recordwatch-resend-api-key`); grant access to existing Cloud Run runtime identity. Do **not** paste the secret into chat or GitHub.
3. Configure Cloud Run environment `RESEND_API_KEY` from this secret and `RECORDWATCH_EMAIL_FROM=matt@recordpathai.com` (the sender used by the successful owner-controlled test).
4. Leave `RECORDWATCH_ALERTS_LIVE_ENABLED=false` until migration, verification and delivery test have passed.

## Phase B2 — isolated end-to-end email test, with all customer alerts still OFF
The owner verified direct Resend inbox delivery to `matt@recordpathai.com` on Nov 8, 2026. That confirms API access, **not** the full Premium case dispatch. For a controlled Premium end-to-end test:
1. Keep `RECORDWATCH_ALERTS_LIVE_ENABLED=false`. Set `RECORDWATCH_ALERTS_TEST_ENABLED=true`, and set `RECORDWATCH_ALERTS_TEST_USER_ID` to the authenticated test owner's exact Supabase Auth UUID. This ID must not be guessed. No other account may use this test-only path.
2. Ensure the testing case has an active, non-refunded $39 lifetime Stripe entitlement, a confirmed auth email, and an affirmative case-specific email opt-in. A refunded test checkout is intentionally blocked.
3. In the paid case dashboard, click **Send test email**. Each case/channel permits at most one test per UTC day. The result indicates the provider accepted the request, not proof of inbox delivery.
4. Verify the message in the owner's inbox and the private `recordwatch_alert_deliveries` ledger. No scheduler job is needed for this user-initiated test, and no background alert is enabled by the test flag.
5. Disable `RECORDWATCH_ALERTS_TEST_ENABLED` after testing; remove `RECORDWATCH_ALERTS_TEST_USER_ID` from Cloud Run when not needed.

## RecordPathAI Twilio sender number
- **Business SMS number:** `+1 702-605-6585` (Las Vegas, Nevada).
- Twilio setup screenshot (2026-11-08): compliance profile **Complete**; Messaging Service selection and A2P registration **not yet started**. An assigned number does **not** establish authorization to send customer SMS.
- Assign this number to the approved Messaging Service once registration is complete. Do not put Twilio tokens in this file.

## Phase C — US SMS (Twilio)
1. Use a paid Twilio account. Complete US A2P 10DLC Brand and Campaign registration (or an applicable verified toll-free route), using a publicly inspectable RecordWatch opt-in screenshot/flow. Phone numbers/campaigns must be registered before production texts. Do **not** set campaign approval to true while registration is pending.
2. Create Messaging Service, add the approved sender, enable automatic STOP/HELP filtering. In Twilio's Messaging Service request configuration, set incoming message webhook:
   `https://recordpathai.com/api/recordwatch/inbound-sms` using POST `application/x-www-form-urlencoded`.
   Verify `X-Twilio-Signature` is forwarded unmodified. Signature check uses EXACT canonical URL; if the configured URL differs, set `TWILIO_WEBHOOK_URL` to that same HTTPS URL.
3. Store Twilio auth token ONLY in Google Secret Manager. Configure Cloud Run:
   `TWILIO_ACCOUNT_SID=AC...` (non-secret identifier)
   `TWILIO_AUTH_TOKEN` from secret
   `TWILIO_MESSAGING_SERVICE_SID=MG...`
   `TWILIO_WEBHOOK_URL=https://recordpathai.com/api/recordwatch/inbound-sms`
   `RECORDWATCH_SMS_CAMPAIGN_APPROVED=true` **only after verified approval**.
4. Test signed inbound STOP, suppression table update and provider's own STOP block. Test START using a consented owner-controlled device; START must NOT automatically turn on Premium preferences.

## Phase D — activate and test
1. Provision a random 32+ byte `RECORDWATCH_ALERTS_SCHEDULER_KEY` in Secret Manager and attach it to the Cloud Run environment. Never put this secret in source, deployment logs, public HTTP calls or screenshots.
2. Set `RECORDWATCH_ALERTS_LIVE_ENABLED=true` **only after** phases A-C are approved. The in-memory old nightly runner is disabled by default; do not enable `RECORDWATCH_LEGACY_NIGHTLY_ENABLED`.
3. Verify `GET https://recordpathai.com/api/recordwatch/alerts/readiness` reports `migration_verified:true`, `email_ready:true`, `sms_ready:true` for the available channel(s), `ready:true`, `daily_scheduler_configured:true`. An absent provider means that channel is NOT live.
4. In the paid case's RecordWatch dashboard, check the independent email and/or SMS boxes and save. Customer email must be confirmed in Supabase auth; SMS phone must be valid +1 E.164 and must not be suppressed.
5. Use the **Send test email** or **Send test SMS** buttons. They send to the signed-in account's confirmed email or to the separately consented case phone ONLY, at most once per case/channel per UTC day. The result says provider accepted, **not** necessarily delivered. Prior to live activation, use Phase B2 owner-limited test mode (SMS still requires approved registration).
6. Check provider dashboards and spam filters / handset receipt, plus private ledger `recordwatch_alert_deliveries`. Never claim completed delivery merely from an accepted API request. Check a refunded or disputed lifetime Premium case and a free case: both MUST remain blocked.
7. Schedule daily in **Cloud Scheduler**, e.g. 15:00 UTC, HTTP POST to `https://recordpathai.com/api/operator/recordwatch/run-alerts`. Use a secure scheduler configuration that supplies `x-recordwatch-alerts-key` from a protected secret; restrict who can read job configuration and never expose its value publicly. Do not claim scheduled sending until that job exists and its authenticated request has passed.
8. Monitor operator results (counts only) and provider delivery dashboards. Ledger prevents duplicate sends and marks ambiguous delivery failures `failed_review`; **do not auto-retry** without checking the provider, to prevent duplicates. This v1 daily worker reads at most 1000 active paid cases; if `more_cases_possible:true`, implement pagination before expansion.

## Honest readiness
Email/SMS code and preference UI are shipped, but no real customer should receive a message unless migration, provider credentials, A2P approval where applicable, explicit consent, authenticated daily scheduler and end-to-end tests are complete. The $39 payment entitlement is Stripe-backed and remains separate from messaging provider readiness.

## References
- Twilio A2P: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart
- Twilio STOP: https://help.twilio.com/articles/223134027
- Resend: https://resend.com/docs/api-reference/emails/send-email
