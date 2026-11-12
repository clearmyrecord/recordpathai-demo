# RecordPathAI — paid packet and court-fee fulfillment (private operations)

Last revised: November 7, 2026. This runbook distinguishes **implemented code** from **outside-the-repository launch gates**. Nothing is automatically mailed, charged, or submitted by a code commit.

## Product and money rules

- Three-step customer eligibility remains free. The packet preparation service is $50.
- For a standard Wood County **Common Pleas conviction** sealing application without an accepted poverty affidavit, the published court deposit is **$100**, producing a proposed total of **$150**. The $100 belongs to the court. It is **not** RecordPathAI revenue.
- Nonconvictions, an accepted poverty affidavit, other relief mechanisms and all other courts must have separate fee decisions. Never assume $150 nationwide.
- Wood County's published filing rules exclude criminal sealing/expungement applications from e-filing and e-mail/fax; use physical filing until the clerk confirms an accepted alternative.
- Lob checks use USPS First-Class Mail, with their own processing / eligible tracking events. Do not promise a USPS Certified tracking number, delivery date, or acceptance by a court for a physical check.
- Do not claim the court receives money simply because Stripe was paid. A paid checkout creates a private `paid_hold` fulfillment job until a separate authorized disbursement occurs.

Sources:
- https://codes.ohio.gov/ohio-revised-code/section-2953.32
- https://clerkofcourt.co.wood.oh.us/189/Criminal-Division-of-the-Clerk-of-Courts
- https://clerkofcourt.co.wood.oh.us/167/Location-Hours
- https://www.co.wood.oh.us/lawlibrary/Common_Plea_CH3.html
- https://docs.lob.com/#tag/Checks
- https://docs.stripe.com/payments/checkout/fulfill-orders

## Code implemented

- `src/court-profiles.js`: unique state/county/**court type** mailing and filing facts. Only mapped approved forms may qualify for release.
- `src/packet-pricing.js`: $50 service / $100 Wood court deposit quote. Quotes explicitly **never approve collection**.
- `src/packet-release.js`: reviewer attestations, 30-day review freshness and SHA-256 binding to saved case and charge inventory. After any material edit, checkout fails closed.
- `supabase/migrations/20261108000000_packet_review_release_gate.sql`: RLS-protected reviewer approvals, private signed PDFs, and an idempotent `paid_hold` fulfillment queue. Customer sessions cannot change approved fees.
- `packet.html`: signed PDF sample download, option to prepare a real signed document **privately** for review, and server-released checkout readiness before any Stripe redirect.
- `/api/packet/private-upload`: owner-authenticated, PDF-validated (<=8 MB / <=6 pages) upload to private Supabase bucket; never publicly linked.
- `/api/packet/checkout-readiness`: server-owned eligibility/reviewer check returning reasons, not sensitive charges.
- `/api/operator/packet/fingerprint`: operations-key guarded review fingerprint for an owned saved case; never returns the actual charges.
- `/api/operator/packet/release`: operations-key guarded reviewer approval; requires verified evidence, exact unchanged saved case and previously uploaded private signed PDF.
- `/api/operator/stripe-test-checkout`: isolated $150 **Stripe sandbox** using a distinct test key, no customer case and no packet unlock.
- `/api/recordwatch/stripe-webhook`: Existing Stripe-signed RecordPathAI live webhook, now also routes **only** `metadata.productType=record-sealing-packet` checkout events to the separate packet queue. It verifies the live checkout again through the packet Stripe key, writes `paid_hold` idempotently, and never dispatches mail. Existing RecordWatch entitlement handling remains separate.
- `/api/stripe/webhook`: Optional dedicated packet webhook retained for independent Stripe signing secret deployment. Both endpoints call the same server-side packet reconciliation routine. Do **not** register the optional second endpoint without also installing its **own** signing secret; the existing live RecordWatch destination is sufficient if both API keys point to the same RecordPathAI account.
- `/api/operator/packet/fulfillment-status`: inspect a paid hold without customer details.
- `/api/operator/packet/dispatch-lob`: separate operations-key action; requires live bank verification, an approved unchanged case, paid job, approved private PDF, explicit live-dispatch setting and Lob permission. Check issue uses a stable idempotency key, current clerk address and a short-lived private attachment link.
- `/api/packet/download-approved`: customer-authenticated, Stripe-verified PDF response; fetches the **exact privately stored signed PDF** and checks its SHA-256 before download. No post-payment regeneration.
- `/api/operator/lob-test-check`: a Lob **test-mode** $100 check with synthetic addresses and public blank Wood form; returns proof ID/status but never mails or draws real funds.
- `/api/operator/packet/lob-check-status`: polls the official Lob check status and only marks actual mailing/delivery when supported tracking events exist. Court acceptance remains separate.
- `stripe-test-success.html`: sandbox return is noindex, never unlocks a production packet.
- `tests/packet-release-and-lob.mjs`: fail-closed policy and print-mail payload tests.

## Required setup; not solved by a GitHub code commit

1. **Supabase:** connect an authorized administration account and apply the new SQL migration. Confirm the private `packet-documents` bucket and service-role access. Never put service-role keys in HTML, localStorage or a repository.
2. **Case validation:** using the official docket verify applicant identity; current court type; every original/final charge; separate judgment, termination and final discharge dates; fines; pending matters; exclusions; and correct form version. The court-specific release is a human-reviewed finding, not a public data import.
3. **Signed PDF:** have the applicant submit the signed PDF for private review. Verify that the storage upload succeeded, the signature appears in the mapped field, and the SHA-256 matches the unchanged case. Do not publish a real applicant PDF, docket or signature.
4. **Operator approval:** set a random secret of at least 32 bytes `RECORDPATH_OPERATIONS_KEY` on Cloud Run. Verify the case's fingerprint using `GET /api/operator/packet/fingerprint?user_id=<UUID>&case_id=<UUID>` with header `x-recordpath-operations-key`. Then submit an evidence-backed review to `POST /api/operator/packet/release`. A release requires all positive statutory and filing checks, the exact approved fee, signed document path/hash, verified payee and court address, reviewer ID/date and evidence references.
5. **Stripe sandbox:** configure `STRIPE_TEST_SECRET_KEY=sk_test_...` for RecordPathAI (do **not** use the separate Memory Studio account). Call `POST /api/operator/stripe-test-checkout` with the operations key. Verify the checkout and $150 test transaction in Stripe's test dashboard. This never unlocks or mails a real packet.
6. **Stripe live:** Verify that both `STRIPE_SECRET_KEY` (packet API access) and `STRIPE_RECORDWATCH_SECRET_KEY` (existing RecordWatch API access) belong to the same **RecordPathAI live** Stripe account. Confirm the production `STRIPE_RECORDWATCH_WEBHOOK_SECRET` correctly validates the live `checkout.session.completed` and `checkout.session.async_payment_succeeded` events already delivered to `POST /api/recordwatch/stripe-webhook`. The existing signed endpoint now verifies packet checkouts with the packet Stripe API key and creates an idempotent `paid_hold` row. No new webhook signing secret is required for that **shared destination**. If a dedicated `POST /api/stripe/webhook` is added later, configure its own `STRIPE_WEBHOOK_SECRET`; do not copy the RecordWatch destination secret. Verify signed event processing, paid status, ownership and exactly-once queue persistence with a controlled approved test case. Only after proof and bank/court approval set `RECORDPATH_LIVE_PACKET_CHECKOUT=true`. Real $150 has separate $50 preparation and $100 court-fee line items.
7. **Lob:** resolve the previously observed HTTP 403 with Lob support. Verify that the account is actually entitled to **checks with attachments**, not just letters. Obtain a **verified funding bank** in Lob. Confirm the clerk's exact check payee, whether a check is accepted for this filing, required copies, service and mailing requirements. Then configure `LOB_LIVE_API_KEY`, `LOB_VERIFIED_BANK_ID`, `LOB_FROM_ADDRESS_JSON`, `LOB_LIVE_CHECKS_ENABLED=true`. Configure `LOB_TEST_API_KEY=test_...` and `LOB_TEST_BANK_ACCOUNT_ID=bank_...`, then use `POST /api/operator/lob-test-check` to generate a proof without sending a real check. Test Lob checks with the **test key** and synthetic documents first; test mode does not send mail.
8. **Dispatch only after payment and approval:** set `RECORDPATH_ENABLE_LIVE_DISPATCH=true` only once Lob/fee authorization is confirmed. An authorized operator calls `POST /api/operator/packet/dispatch-lob` with `stripe_session_id` in JSON. On errors, check the Lob dashboard before retrying. `submitted_to_lob` is not `mailed` or `court_accepted`. Reconcile print, mail and docket acceptance separately.
9. **Paperwork retention:** handle legal records, payment evidence, signatures and any court notice in private storage with restricted access and a retention policy. Do not expose private PDFs or case details in GitHub logs, Stripe metadata, or Lob metadata.
10. **Case closure:** verify clerk acceptance/docket stamp. Treat proof of delivery, court acceptance and grant of sealing relief as separate statuses.

## Onboarding other Ohio counties

The existing Ohio agent queue in `docs/ohio-docket-agent1.md` assigns **87 counties** other than Wood to official-source research. Do not mark them integrated simply because a docket link is found.

For every **court division** in a county, separately verify its ID and type, case search, all fields actually displayed by its public docket, official form PDF and every required field, source/version, fee schedule, waivers, signature/notary rules, recipient/payee, approved physical/e-filing route, source URLs and date checked. Add a reviewed profile to `src/court-profiles.js` only after these items are confirmed; add a matching active entry to `templates/index.json` only after the exact form PDF and mapping are approved. Every new route must pass sample signed PDF, quote/fee waiver, approval fingerprint, Stripe sandbox, private PDF, and Lob **test** proof checks before opening live checkout.

No real customer payout, filing or mail is automatic or inferred from code readiness.
