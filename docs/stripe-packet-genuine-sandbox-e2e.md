# RecordPathAI — genuine Stripe sandbox -> isolated Postgres acceptance

## Current boundary
The production webhook accepts **only cs_live_** Stripe sessions; it must not be relaxed
for QA. The existing /api/operator/stripe-test-checkout creates a deliberate
"packet-sandbox-simulation" product and is NOT a packet release proof. The old
RecordWatch sandbox destination is not the packet webhook destination.

This directory contains an isolated, test-only receiver and isolated PostgreSQL schema.
Its CI workflow validates **Stripe SDK HMAC verification + real PostgreSQL insertion**
with synthetic Stripe event and stubbed API retrieval. Passing CI is NOT proof of
a genuine Stripe-delivered event. Do not set signedEventDeliveryProven from CI.

## Requirements for the external genuine event acceptance test
1. Provision a **separate** PostgreSQL database literally named
   recordpathai_packet_sandbox, with no production tables, no production Supabase
   connection, and no permissions to Lob. Apply
   sql/packet-sandbox-isolated-postgres.sql to this isolated database.
   Its table has RLS enabled and public/anon/authenticated access revoked.
   Provision a dedicated staging DB role permitted only SELECT and INSERT
   on `packet_sandbox_paid_holds` and grant it a narrowly scoped RLS policy
   (or use a dedicated table owner in this isolated database). Do not reuse
   the production Supabase service role or expose an admin URL to a browser.
2. Build the dedicated `Dockerfile.packet-sandbox` (never the production `Dockerfile`), and deploy it **on a distinct staging service**.
   Runtime requires RPAI_PACKET_SANDBOX_ONLY=true,
   STRIPE_TEST_SECRET_KEY=sk_test_..., STRIPE_TEST_PACKET_WEBHOOK_SECRET=whsec_...,
   RPAI_SANDBOX_DATABASE_URL=postgres://.../recordpathai_packet_sandbox.
   The service checks database identity and refuses live activation flags. Only the staging container contains `pg`; the existing production application, image, routes, and dependencies remain unchanged. Store Stripe API and webhook signing keys in the staging service's secret store; never send them in chat or commit them.
   Never bind production SUPABASE_SERVICE_ROLE_KEY, Stripe live keys, or Lob keys.
3. In the **RecordPathAI Stripe sandbox account**, create a distinct webhook endpoint
   to https://<staging-service>/stripe/packet-sandbox-webhook, subscribing to
   checkout.session.completed and checkout.session.async_payment_succeeded.
   Save the endpoint's test whsec_ signing secret **only** in the staging service.
4. Create a **Stripe TEST checkout**, through a staging-only operator script or
   sandbox dashboard, with metadata: productType=record-sealing-packet,
   sandboxOnly=true, userId and saved_case_id synthetic UUIDs,
   serviceFeeCents=5000, courtFeeCents=10000, fulfillmentMode=lob_check,
   and $50 + $100 synthetic line items. Complete it using a Stripe **test card**;
   do not use any real bank/card data or production customer/case.
5. Check Stripe's event delivery dashboard for HTTP 200 on the new
   **packet staging** endpoint. In the isolated PostgreSQL database, confirm
   exactly one row for that cs_test_ session: status='paid_hold',
   court_fee_cents=10000, payment_method='lob_check'. Resend the same event
   once and confirm the row count remains exactly one. Deliberately fail
   an HMAC signature and confirm HTTP 400. No checks or mail should exist.
6. Capture the event ID, session ID, time, webhook delivery status, database
   row count and zero side effects in the release ticket; redact signing secrets,
   personal details, event payload and database credentials.
7. Remove temporary webhook destination after completion if no staging service
   will be retained. Keep production packet checkout, Lob live checks and
   live dispatch disabled until **separate clerk and funding approvals**.

### Known obstacles
The connected Stripe sandbox currently has an enabled **RecordWatch-only**
webhook destination. A separate staging Postgres database/service and its
signing secret have not yet been provided. Without them, it is unsafe to
assert genuine Stripe delivery into isolated database.
