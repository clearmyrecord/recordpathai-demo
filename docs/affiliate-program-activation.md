# RecordPathAI affiliates — production activation and payout operations (2026-11-09)

## Business terms and controls

- Approval-only independent affiliates; 20% of collected RecordPathAI **service fees**.
- $7.80 per eligible paid $39 RecordWatch purchase; $10 for an eligible paid $50 packet-preparation service.
- Court filing deposits, taxes, shipping and third-party costs are **never** commissionable. Do not award duplicate commissions per charge when cases share a filing.
- First-touch 30-day attribution, single commission per unique Stripe Checkout Session, 30-day refund/dispute hold, $50 minimum payout.
- No judicial, clerical, jail, probation/parole, or other public official paid referrals in the course of their official duties. No attorney/firm fee-splitting without separate documented ethics review.
- All public affiliates must clearly disclose paid promotions and must not promise eligibility or court outcomes. No bulk outreach using criminal-record personal data.
- Private Supabase service role only; partners never see customer court records, names or payout bank details.
- **Owner-reviewed payouts. Automatic payouts stay OFF.** Every Stripe Global Payouts PayoutIntent is created with \`confirmation_method:"manual"\` and requires a separate explicit owner confirmation, after which the ledger is reconciled.

## Existing components

- \`/partners.html\`: application, referral link, earnings summary, Stripe-hosted recipient onboarding for approved partners.
- \`/partners-admin.html\`: private operations screen. Requires logged-in owner AND separate operations secret (entered per browser session; not stored).
- \`server.js\`: verified Stripe Checkout commissions on successful platform fees, refunds and disputes invalidate unpaid commissions; payout module is separate from both RecordWatch and packet-checkout flows.
- \`src/affiliate-payout-service.js\`: recipient onboarding, payment-by-payment commission review, atomic payout batch reservation, manual confirmation and reconciliation.
- \`src/affiliate-payouts.js\`: payout guardrails and validation.
- \`tests/affiliate-payouts.test.mjs\`: funds movement and eligibility regression tests.

## Activation requirements (complete these in order)

**Do not mark payouts live until the entire checklist passes.** The deployed source, database migrations, Cloud Run configuration, and Stripe account must agree.

1. Apply \`supabase/migrations/20261108030000_affiliate_referrals.sql\` to the correct private RecordPathAI Supabase database if not previously applied. Do not rerun the original full bootstrap.
2. Apply \`supabase/migrations/20261109030000_affiliate_payouts.sql\`. Verify exactly one row for each migration in \`public.affiliate_program_migrations\`, that the new payout table exists and has RLS, and that no anon/authenticated permissions were granted.
3. In the **RecordPathAI live Stripe account** (never Memory Studio), confirm Treasury / Global Payouts is enabled and identify a US USD financial account, which has sufficient *available* funds to cover payout + fees. The financial account had $0 available at initial review; fund it via the verified Stripe flow.
4. In the Stripe Dashboard's API keys section, create a **new restricted live API key**, not an ordinary \`sk_live_\` key. Stripe's documented minimum permissions: \`Recipient Configuration: Write\`, \`Money Management Financial Accounts: Read\`, \`Money Management Payout Methods: Write\`, \`Money Management Outbound Payments: Write\`, and \`Money Management Payout Intents: Write\`. Store it in Google Cloud Secret Manager, never source code, GitHub issues, logs, screenshots or ChatGPT.
5. Cloud Run existing service \`recordpathai\`, project \`recordpathai-production\`, region \`us-west1\`: configure \`AFFILIATE_PROGRAM_ENABLED=true\`; \`AFFILIATE_PAYOUTS_LIVE_ENABLED=true\`; \`STRIPE_AFFILIATE_PAYOUT_KEY\` (Secret Manager reference to the restricted key); \`STRIPE_AFFILIATE_FINANCIAL_ACCOUNT_ID\` (verified Treasury ID); \`AFFILIATE_OWNER_USER_ID\` (exact UUID of the authenticated owner from Supabase Auth), and preserve \`RECORDPATH_OPERATIONS_KEY\` (existing >=32-character secret). Never copy secret values into a public repo or a SQL migration.
6. Deploy the tested \`main\` branch via the protected GitHub workflow. Verify \`/api/affiliates/readiness\` reports applications and referral tracking true. No automatic payouts should be enabled.
7. From \`/partners.html\`, use two **separate verified user accounts** for an approved test affiliate and referred customer. The partner applies and remains pending. In \`/partners-admin.html\`, owner reviews marketing/conflicts/disclosures and approves; the partner then receives a unique tracking link.
8. Partner selects individual or organization, starts Stripe-hosted payout onboarding, and enters sensitive details **directly in Stripe**. Account ownership stays bound to the authenticated partner; Stripe ACH capability must become active. No bank account number is collected by RecordPathAI.
9. In the admin screen, owner verifies partner identity/tax compliance and clears payout hold. Test actual live purchases only when explicitly authorized and using real approved credentials. Confirm 20% of service-only net qualifying revenue, one unique commission per paid session, and no commission on the court filing fee.
10. After the 30-day hold, owner clicks **Verify matured customer payments**. The server retrieves each source Stripe Checkout session, succeeded PaymentIntent and charge from the correct existing Stripe account, rejects refunds/disputes, and marks only eligible payments approved.
11. At >=$50 approved eligible earnings, the owner clicks **Prepare payout**. The server verifies Stripe recipient and live Treasury available balance, and atomically reserves approved commission rows. Stripe creates a **manual confirmation** PayoutIntent.
12. Owner checks the recipient and exact amount, types the amount in cents, and confirms the real transfer. The server re-verifies the source commission ledger and payout-intent fields before sending. Never accept the amount or recipient from the public form.
13. Owner clicks **Reconcile with Stripe** until posted. A posted payout means funds have left Stripe, **not** that a bank has credited the money. Reconcile returns/failures and reopen verified commissions only after Stripe confirms funds returned. Partner dashboard shows pending/eligible/sent amounts without customer information.
14. Review 1099 reporting, taxes, FTC disclosures, any applicable state consumer-protection and professional ethics rules with qualified counsel before scaling.

## Important release limitations

- This implementation uses owner-confirmed disbursement; it does not create an unattended daily payout job.
- Missing migrations, identity, operations key, restricted Stripe key, active recipient, tax clearance, 30-day hold, $50 floor or funding cause a **fail-closed** response.
- Do not publish "automatic affiliate payouts enabled" while \`automatic_payouts_enabled:false\`.
- The live global-payouts secret cannot be enabled by a GitHub code commit; it requires an actual Secret Manager / Cloud Run configuration change.
- No recipient, payout or live transfer should be fabricated for smoke testing. Stripe sandbox may be used separately to validate the mechanics without moving real funds.

## Source references

- [Stripe Global Payouts](https://docs.stripe.com/global-payouts)
- [Send payouts and required restricted key permissions](https://docs.stripe.com/global-payouts/send-money)
- [Recipient account onboarding](https://docs.stripe.com/global-payouts/recipient-creation)
- [Payout status, returns and reconciliation](https://docs.stripe.com/global-payouts/manage-payouts)
- [FTC endorsements and affiliate disclosures](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking)
