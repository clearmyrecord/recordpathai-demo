# Professional Pay and Mail and case alerts — release runbook

Professional subscribers pay no per-packet preparation charge. Optional Wood County conviction mailing and SMS/email case alerts are a $10 per-filing add-on plus the $100 court deposit and applicable service tax. Application preparation remains included. The professional notification entitlement and delivery integration must be verified before selling this bundle. Qualifying Wood County dismissal and not-guilty filings use a $10-only checkout and the Lob letters endpoint, with no court deposit or check. Complimentary pilots are not eligible for this paid checkout.

## Release gates
- Deploy the tested main commit through the existing Cloud Run workflow; confirm the new revision serves the professional routes.
- Apply sql/professional-mailing.sql if the private queue does not exist, then sql/professional-mailing-addons.sql to add the fee-specific provider receipt and private alert tables. Verify RLS, no anon/authenticated grants, service-only writes, and private packet-documents storage.
- Verify the existing live Stripe account, payment webhook signature delivery, shared Lob funding and two-page attachment acceptance, and scheduled fulfillment. Run genuine isolated sandbox checkout and Lob proof with fictional forms before enabling professional payments. Do not use real client records in QA.
- Keep RECORDPATH_PROFESSIONAL_MAILING_ENABLED unset/false until genuine provider integration is verified. The professional path also requires the existing automatic fulfillment switch, live webhook signing secret, shared DB dispatch control, Lob live checks/attachment switches, verified bank and authorized court profile for convictions. No-fee letters require LOB_LIVE_LETTERS_ENABLED, confirmed dismissal mailing acceptance and private two-page attachment proof. Before opening bundle checkout, set RECORDPATH_PROFESSIONAL_ALERTS_ENABLED only after both shared providers and private preference/delivery tables have passed verification.
- Do not fabricate independent case approval or switch off safeguards to pass QA.

## Operations
Use the existing operations authorization header (never expose its value in a browser or log).
- GET /api/operator/professional-mail/review-queue lists cases with a recorded exact signed-document review.
- GET /api/operator/professional-mail/review/:caseId/:documentId and /review-pdf/:caseId/:documentId expose the exact private review facts and PDF to authorized operators only.
- POST /api/operator/professional-mail/approve records the case/document IDs, real reviewer_reference, independent_review_confirmed=true and review_checks with identity, docket, charges, discharge, exclusions, form, signature, authorization, court_fee_and_address all verified. Review the actual applicant identity, complete docket, statutory eligibility, signed application, filing authority and fee/address; do not submit example evidence.
- The subscriber sees the approved order in Step 3, authorizes mailing, and opens a Stripe-hosted checkout. Payment is accepted only for the matched signed document and case, with the $10 mailing and case alert add-on plus the applicable court deposit ($100 conviction, $0 qualifying nonconviction). Any checkout with mismatched pricing requires operator reconciliation; do not reopen or create a duplicate payment.
- The existing signed Stripe webhook puts a paid order in paid_hold. The existing scheduled fulfillment route also processes professional orders. The worker rechecks the unrefunded captured payment and exact reviewed PDF, atomically claims once, and creates a Lob check or letter using the shared court-profile builders. The letter route never creates a check.
- A claimed order without Lob confirmation requires manual provider reconciliation. Do not automatically retry or collect another payment. One order per case is intentional until support verifies cancellation, refund or correction.
- RecordWatch shows the private order state, Lob check or letter reference, estimated delivery if available, and provider tracking events. Lob acceptance is not proof of court filing.

## Verification
Run node --test tests/professional-mailing.test.mjs plus the full existing security suite. The mocked tests never contact Stripe or Lob. A real sandbox provider proof, production deployment check, and authorized live test are separate release evidence.

## Professional alert consent and delivery
- Opt in independently to email and SMS from the professional filing packet. The recipient is the verified professional account holder, not an unverified client contact. SMS requires an Auth-confirmed US phone number and explicit consent; STOP/START resets SMS consent through the existing signed Twilio webhook.
- The scheduler sends neutral payment, mail submission and independently verified court-event notices only after rechecking the captured, unrefunded Stripe payment. The private unique delivery ledger prevents duplicate sends; ambiguous provider results are held. No case identifiers, client names, charges or dates appear in outbound text. The email links to RecordWatch Professional. Opt out through the packet or reply STOP.
- Verify account phone enrollment, opt-in/opt-out, provider receipts, delivery ledger, and both fee-specific end-to-end paths before enabling production. The staging database schema alone does not establish provider readiness.
