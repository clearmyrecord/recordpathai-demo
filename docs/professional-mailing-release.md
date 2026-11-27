# Professional conviction Pay and Mail — release runbook

Professional subscribers pay no per-packet preparation charge. Optional Wood County conviction mailing is $10 service + $100 court deposit, plus applicable tax on the service. The nonconviction workflow remains manual and has no court fee for qualifying dismissals/not-guilty cases. Complimentary pilots are not eligible for this paid checkout.

## Release gates
- Deploy the tested main commit through the existing Cloud Run workflow; confirm the new revision serves the professional routes.
- Apply sql/professional-mailing.sql to the intended Supabase project if the private queue has not already been migrated. Verify RLS, no anon/authenticated grants, service-only writes, and private packet-documents storage.
- Verify the existing live Stripe account, payment webhook signature delivery, shared Lob funding and two-page attachment acceptance, and scheduled fulfillment. Run genuine isolated sandbox checkout and Lob proof with fictional forms before enabling professional payments. Do not use real client records in QA.
- Keep RECORDPATH_PROFESSIONAL_MAILING_ENABLED unset/false until genuine provider integration is verified. The professional path also requires the existing automatic fulfillment switch, live webhook signing secret, shared DB dispatch control, Lob live checks/attachment switches, verified bank and authorized court profile.
- Do not fabricate independent case approval or switch off safeguards to pass QA.

## Operations
Use the existing operations authorization header (never expose its value in a browser or log).
- GET /api/operator/professional-mail/review-queue lists cases with a recorded exact signed-document review.
- GET /api/operator/professional-mail/review/:caseId/:documentId and /review-pdf/:caseId/:documentId expose the exact private review facts and PDF to authorized operators only.
- POST /api/operator/professional-mail/approve records the case/document IDs, real reviewer_reference, independent_review_confirmed=true and review_checks with identity, docket, charges, discharge, exclusions, form, signature, authorization, court_fee_and_address all verified. Review the actual applicant identity, complete docket, statutory eligibility, signed application, filing authority and fee/address; do not submit example evidence.
- The subscriber sees the approved order in Step 3, authorizes mailing, and opens a Stripe-hosted checkout. Payment is accepted only for the matched signed document and case, with the $10 service and $100 court deposit.
- The existing signed Stripe webhook puts a paid order in paid_hold. The existing scheduled fulfillment route also processes professional orders. The worker rechecks the unrefunded captured payment and exact reviewed PDF, atomically claims once, and creates a Lob check using the shared court-profile builder.
- A claimed order without Lob confirmation requires manual provider reconciliation. Do not automatically retry or collect another payment. One order per case is intentional until support verifies cancellation, refund or correction.
- RecordWatch shows the private order state, Lob check reference, estimated delivery if available, and provider tracking events. Lob acceptance is not proof of court filing.

## Verification
Run node --test tests/professional-mailing.test.mjs plus the full existing security suite. The mocked tests never contact Stripe or Lob. A real sandbox provider proof, production deployment check, and authorized live test are separate release evidence.
