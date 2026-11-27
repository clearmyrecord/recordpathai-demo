# RecordPathAI Professional — design partner pilot

## Offer and scope
Invite eligible legal aid nonprofits and university clinics to a proposed 90-day, no-software-fee Wood County pilot, subject to mutual agreement and approval. No obligation to refer paying consumers, no referral commission, no sharing of client data in exchange for access. Court costs remain separate. Private attorney subscription pricing ($99/month solo, $249/month firm) is a hypothesis only, not activated.

## Demonstration
professional.html and js/professional-pilot-demo.js run three fictional cases only. No live form output, network data, storage, signature, billing, filing or notifications. No real-client intake.

## Production prerequisites (all pending)
- Legal review of provider role, confidentiality, unauthorized practice, disclosures, filing and fees; independent startup counsel engagement separate from partner feedback.
- Organization identity and administrator verification, attorney license/authority checks, supervising attorney controls for students/staff.
- Supabase tenant isolation and deny-by-default RLS; explicit matter-specific client authorization; secure authentication, MFA, encryption, audit events, access revocation, retention and sealed-record handling; security assessment and cross-tenant tests.
- Attorney legal decision and documented approval of exact form version/content; mixed/unknown dispositions held for review; verified form mapping and signatures.
- Court-approved submission method and payer/fee policy; separate professional billing from consumer checkout; no automatic mailing, payment or submission.
- Verified case-status sources; opt-in monitoring only; minimal notices and no sensitive case details in SMS/email.
- Data processing terms, security review, accessibility and written partner approval before any real client data.

## Success measures
On synthetic or approved test matters: baseline vs assisted preparation minutes, number of correction cycles, form routing accuracy reviewed by counsel, accessibility, usability, and partner feedback. No individual case data in marketing or analytics. Do not claim success, partner adoption or legal compliance until verified.

## Implemented staging workspace (November 26, 2026)
- `professional-workspace.html` connects to existing authentication; explicitly rejects any Supabase host except RecordPathAI staging. Requires an active operator-provisioned membership and AAL2 session. No real client inputs are present.
- `sql/professional-pilot-staging.sql` was applied to staging only. Four tables have row-level security, column-level insert grants, no authenticated update/delete privileges, and organization membership checks. Only verified attorney memberships can insert immutable fictional review decisions. Mixed scenarios cannot be marked review-complete. Pilot access expires at the configured date, at most 90 days from start.
- Rollback-only staging SQL fixture test verified cross-tenant read and insert denial, staff review denial, mixed-outcome hold, same-tenant review success and MFA denial. All fixtures rolled back; no partner accounts provisioned. Supabase security advisors showed no findings naming the four new tables; existing unrelated findings remain outside this change.
- New market admission: no mandatory notarization, no SSN (full or partial), no additional mandatory fields outside the existing canonical intake. Require verified court-specific forms, fees, signatures and submission channels. Wood County Common Pleas only; Bowling Green Municipal deferred. Do not create shared consumer cases or copy data between organization and consumer workspaces.
- Still pending before real client use: independent legal/security review and signed partner terms, matter-specific access and consent, data lifecycle, verified attorney onboarding, MFA enrollment and sign-in UX, confidential intake and documents, exact PDF generation/review, signature process, case monitoring and filing verification. Professional billing stays off. Staging is not a production attorney portal.

## Signed-document repair and verification
The initial migration attempted to insert directly into Supabase-managed Storage metadata and returned an internal error. Neither signed-document table nor the bucket existed afterward. Replaced the attempted bucket with bounded private staging database bytea (2 MiB limit) and SHA-256 constraint; no raw PDF SELECT grant to authenticated users. Corrected migration applied successfully. Rollback-only staging fixtures verified hash rejection, owner-only metadata, denied raw PDF reads, MFA and denial of manual filing reports before exact-document review. No test records retained.
The signed review API uses the current authenticated user's RLS-protected case and approval before server-only PDF access. It requires two correct official form pages, rejects unsigned review markers, stores the exact hash, and rechecks authorization on download. Signature is attorney-attested, not independently authenticated; actual signing remains external. No automated filing, Stripe billing, live RecordWatch, or real-client production access. Latest browser and CI verification still required. 
