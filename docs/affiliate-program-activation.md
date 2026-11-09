# RecordPathAI partner referral program (v1, approval only)

## Launch posture
The code and public informational page may be deployed, but the live program is **OFF by default**. Do not set `AFFILIATE_PROGRAM_ENABLED=true` until the migration is applied, partner compliance is reviewed, first-touch attribution has been tested, and appropriate Stripe refunds/disputes are configured. There are **no automatic transfers or payouts** in v1. The public page is `/partners.html`.

## Terms proposed for initial partners
- 20% of collected RecordPathAI **service fees**: USD $7.80 on a $39 one-time RecordWatch purchase; USD $10 on the planned $50 packet-preparation charge **only if and when packet checkout launches**.
- Zero commission on **court fees, government deposits, attorney services, third-party charges, shipping costs, taxes, and reversed payments**. For a Wood County $189 total illustration, only $89 is eligible as platform-fee revenue; total potential commission is $17.80.
- A visitor who arrives through an approved partner's `?ref=RPAI...` link stores a first-touch code in their browser for up to 30 days; a verified login binds that referral permanently to one user account, if there was no prior referred account or prior lifetime purchase. Qualified paid purchases must occur within 30 days of that binding.
- One commission per verified Stripe Checkout Session; 30-day hold; minimum $50 threshold. Refunded/disputed transactions void unpaid earnings. The dashboard never reveals customers' names, case histories or charges.
- Payouts require operations review, tax onboarding, identity verification, compliance approval and a separately logged manual payout decision. No automatic payout integration has been implemented.
- Where filing rules allow multiple cases on one application, the intended paid service is **per application**, not per charge. Current $39 RecordWatch checkout remains per saved case until grouped-case entitlements are implemented. Do not credit multiple duplicate purchases as intended pricing.

## Compliance and allowed partners
- Start with approved independent creators, publishers, community businesses and nonprofits. Prohibit commissions to court staff, judges, probation/parole officers and public officials acting in their official duties, or for soliciting supervised populations.
- Attorney/firm/legal-client referrals need attorney-ethics review before any approval. RecordPathAI is informational software, not a law firm, and must not share legal fees. Never represent the program as court-sponsored or as legal advice.
- FTC clear and conspicuous disclosure at the point of recommendation, e.g. **“I may earn a commission if you purchase through my link.”** Monitor advertising for misleading eligibility, timing or outcome claims.
- No bulk publication of criminal-record personal data, spam, misleading endorsements, or direct solicitation of vulnerable individuals. All partners approved individually.
- Review federal/state/local affiliate marketing, tax-reporting, data privacy, FTC, attorney ethics, and relevant outreach policies with qualified counsel before launch.

## Activation steps
1. Keep existing live RecordWatch Stripe checkout as-is. Deploy the partner code with `AFFILIATE_PROGRAM_ENABLED` unset or `false`; confirm `/api/affiliates/readiness` returns `applications_open:false` and `automatic_payouts_enabled:false`.
2. In the correct RecordPathAI **Supabase SQL editor**, apply **only** `supabase/migrations/20261108030000_affiliate_referrals.sql`. Do **not** rerun the core/bootstrap migrations or paste live payment secrets into the SQL editor.
3. Confirm `select id from public.affiliate_program_migrations where id='20261108030000_affiliate_referrals';` returns exactly one row and that the four tables exist with RLS enabled.
4. In Cloud Run **recordpathai** service `recordpathai-production` in `us-west1`, add plain environment variable `AFFILIATE_PROGRAM_ENABLED=true`, retain all existing Stripe and Supabase secrets, and deploy with production guards. This is **not** a Stripe secret.
5. Check `https://recordpathai.com/api/affiliates/readiness` returns `applications_open:true`, `referral_tracking_enabled:true`, `automatic_payouts_enabled:false`. Enroll a test publisher from a dedicated test account. Applications default to `pending`.
6. After compliance review, manually approve an applicant **in a secure admin-only SQL session** (not a public API), for example:
   ```sql
   update public.affiliate_partners
   set status='approved', compliance_approved_at=now(), updated_at=now()
   where user_id='<verified-affiliate-user-uuid>' and status='pending';
   ```
   Replace the placeholder with a **verified** UUID from an actual application. Do not approve a test applicant with an invented ID. Their partner dashboard then shows `https://recordpathai.com/?ref=RPAI...`.
7. On a separate eligible non-partner customer account, visit that link, sign in, and verify the referral row was added. Never put court or criminal-charge information in link parameters or Stripe metadata.
8. For a true end-to-end payout test, use a controlled live charge only with explicit authorization. Confirm one unique commission per session ($7.80 RecordWatch) and 30-day hold. Refund it and confirm the unpaid commission becomes `void` with reason `refund`. Existing $39 checkout and refund behavior must not regress.
9. To recognize packet-preparation commissions later, wait until `/api/stripe/webhook` safely processes verified packet payments and listens to `charge.refunded` and `charge.dispute.created`. Court fees must remain separate from service fees.
10. Before paying partners, set up a verified payout method/Stripe Connect or manual payroll route, required tax reporting, ledger review, payout reconciliation, clawbacks, and legal approval. No payout can currently be issued from the website.

## Manual commission review and payout safety
Only service-role/admin SQL access can update `affiliate_commissions`. A pending commission may become `approved` after its `available_after` date and refund/dispute checks. No automated job performs this transition. Actual transfer and marking `paid` require an independent reconciled action, and should not be implemented by editing partner-side forms.

## Links
- [FTC endorsement / affiliate disclosure guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking)
- [Ohio attorney conduct rules (5.4, 7.2)](https://www.supremecourt.ohio.gov/docs/LegalResources/rules/profConduct/profConductRules.pdf)
- [Stripe Connect onboarding and payout overview](https://stripe.com/connect/marketplaces)
- [Wood County posted criminal sealing fees](https://clerkofcourt.co.wood.oh.us/189/Criminal-Division-of-the-Clerk-of-Courts)
