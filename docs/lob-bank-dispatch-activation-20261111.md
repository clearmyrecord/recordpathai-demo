# RecordPathAI Lob Checks integration — bank connected, live dispatch disabled

The customer has connected a bank account in Lob. Connection is not proof
of verification, Checks API entitlement, attachment pricing, or check funding.
Keep `RECORDPATH_ENABLE_LIVE_DISPATCH=false` until all checks below pass.

## Existing product flow
1. Customer completes Step 1 personal details, Step 2 case details, Step 3 signed mapped court packet.
2. Server stores signed PDF privately and checks unchanged case, docket, charge inventory, final discharge, signed form, filing consent and reviewer evidence.
3. Approved Stripe Checkout charges $50 preparation plus *only* the reviewed, authorized court deposit. Wood County standard conviction deposit is $100 (not RecordPathAI revenue); optional $39 lifetime RecordWatch is a separate purchase. Nonconviction/waiver routes do not create a check.
4. Signed Stripe webhook creates `paid_hold` (never dispatch directly).
5. Protected operator route checks Lob bank verification and reviews the PDF, payee, fee and address; then freshly rechecks expanded Stripe payment intent and charge for refunds/disputes.
6. Atomic Supabase RPC claims that paid job once. Lob Checks API creates one USPS First-Class check with attached signed packet using stable session idempotency key; persist `chk_...` and reconcile provider outcomes.
7. RecordWatch shows the check creation, mailing and receipt state without calling the check ID a postal tracking number or treating delivery as court filing.

## Release checklist
- Apply `20261108000000_packet_review_release_gate.sql`, then `20261111000000_atomic_packet_lob_dispatch.sql` in Supabase (do not assume migrations were applied).
- Confirm Lob account-level Checks API + PDF attachment entitlement and exact per-piece costs, including attachment page count and mail fees. Existing Letters API 403 does **not** establish that Checks API is enabled. Resolve Lob support tickets #191939 / #191948.
- In Lob dashboard, verify bank account (check `verified === true` through GET /v1/bank_accounts/:id) and that correct legal signatory/check images are configured. Never place routing/account numbers in source or frontend.
- Place server-only `LOB_VERIFIED_BANK_ID`, `LOB_LIVE_API_KEY`, `LOB_FROM_ADDRESS_JSON`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` into restricted production secrets, with `RECORDPATH_LIVE_PACKET_CHECKOUT` and `LOB_LIVE_CHECKS_ENABLED` gated independently.
- Verify Wood County Clerk's current check payee, correct delivery address, filing acceptance, no-waiver $100 deposit and any notarization/signature requirements. Confirm court accepts attachment with check in one envelope; *not yet confirmed*. Ohio dismissal-only path does not automatically send a $100 check.
- Test `/api/operator/lob-test-check` with a Lob TEST key/test bank ID and public blank form. The sandbox must return a real `chk_...` and a rendered proof before live use. This route requires `RECORDPATH_OPERATIONS_KEY`; don't share it in chat.
- Run CI (`npm run test:security`). Perform a controlled Stripe sandbox checkout; verify signature and paid-hold reconciliation, then test manual dispatch only against safe synthetic inputs. Review Lob proof, formatting and the check/packet pages.
- Live check emission needs explicit operator approval, real case-specific authorization, legal review, funds and separated court deposit funding, and a last preflight. Switches MUST remain disabled until then.
- Once a dispatch has been claimed, never retry it automatically after any Lob network error or 403. Reconcile Lob dashboard and Stripe first; only a documented manual recovery may reset the job.

**No payments, real checks, mail, bank edits or deployment are performed by this code change.**
