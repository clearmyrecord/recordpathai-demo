# Wood County, Ohio — Court filing pilot legal / form validation (November 7, 2026)

## Source-of-truth check

**Ohio Revised Code, current in November 2026:** §2953.32 (effective September 30, 2025), §2953.33 (nonconvictions), §2953.61 (multiple related charges).
- https://codes.ohio.gov/ohio-revised-code/section-2953.32
- https://codes.ohio.gov/ohio-revised-code/section-2953.33
- https://codes.ohio.gov/ohio-revised-code/section-2953.61
- https://clerkofcourt.co.wood.oh.us/189/Criminal-Division-of-the-Clerk-of-Courts

**Official court blank PDFs:**
- https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF
- https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/143/Application-for-Sealing-295333-Dismissal-PDF

Both published PDF packets have four pages; page 4 provides **four charge rows**, one case number and one conviction/dismissal date, one conviction sentence/supervision termination date, one unsigned applicant declaration, while page 3 contains separate address verification. Confirm with clerk how to handle multiple cases, different charge/judgment dates and fields when >4 rows; do not discard counts, abbreviate statutes incorrectly, or pick a form based on an original trafficking allegation when final conviction is reduced.

The published conviction form is revised **February 12, 2024**, predating the September 30, 2025 change to R.C. 2953.32. Its broad instructions concerning domestic violence, protection-order offenses and court-cost payment may not match the current statute. Do not rely on the PDF's printed helper text as a complete legal screening engine.

## Key verified legal timing rules (conditional filing windows, not determinations)
- Minor misdemeanor conviction: six months from verified final discharge (seal or expunge).
- Other eligible misdemeanors: one year from verified final discharge (seal or expunge).
- Eligible F4/F5 felony: one year to seal; 11 years to expunge.
- Eligible F3 felony: three years to seal; 13 years to expunge, subject to conviction limits and statutory clumping.
- R.C. 2921.43 conviction: seven years to seal after final discharge; felony expungement ten additional years after sealing window.
- Eligible third/fourth degree domestic violence misdemeanors and violation of protection-order convictions: **seal only**, **do not expunge** under R.C. 2953.32(A)(2).
- Grand-jury no bill: two years after the no-bill report is submitted to court. The disposition date cannot silently replace the grand-jury report date.
- Dismissal/acquittal: journal/minute date governs initial timing, but dismissals without prejudice require limitations review, and various exclusions and §2953.61 may restrict expungement.

**Do not conflate three distinct dates:** (a) disposition or conviction journal date; (b) sentence/supervision termination date; (c) final discharge after completion of all sentence components including fines. Importantly, the Wood County extract column labeled “Termination Date” has not been established as a verified (b) or (c). Do not start an automated eligibility clock from it.

## Court fee: previously misstated
R.C. 2953.32(D)(3) authorizes a $50 application fee **plus** a local court fee of up to $50, regardless of how many conviction records are requested in one application, subject to poverty-affidavit exception. The Wood County criminal division publishes a **$100** criminal record-sealing deposit. The deposit is *not* the same thing as RecordPathAI's proposed $50 preparation fee. Confirm the actual amount, eligible waiver and acceptable payment method with the clerk **before** charging or creating checks. Nonconviction application fee requirements are separate; do not create a universal $100 court fee for every outcome.

## Review-only application test, no private court records in repository
The test used the applicant's self-identified identity and a locally held copy of the official blank conviction form to create a private **DRAFT / NOT FOR FILING** preview. No case number was entered because candidate 2006 case matches were not confirmed against the authenticated CourtView docket. No original/final conviction offense, judge, judgment date, termination date, final discharge date, signature, financial assertion or fee was invented or marked verified.

No private court data, applicant names, or candidate case IDs should enter GitHub logs, checked-in test fixtures, publicly cached pages or searchable customer profiles. The applicant's own preview must remain private, and any future production private data needs documented access rights, identity proofing and source audit.

## Implementation
- `js/ohio-case-review.js`: pure, browser/Node compatible, source-backed *advisory* timeline module. It deliberately returns `eligible:false`, `allowPayment:false`, `allowMail:false`, `safeToFile:false` even when a potential timing date is calculable.
- Eligibility and Record Details show explicit case-level verification issues. Original allegation is captured separately from final conviction.
- `packet.html`: Wood County/Ohio pilot checkout is fail-closed until a trusted authenticated approval workflow is built. A self-asserted date, browser approval or 2024 printed application cannot authorize a $50 charge.
- `js/rules.js`: legacy Ohio calculator must not assume disposition date equals discharge or label a record likely eligible solely because time has elapsed.
- `tests/wood-county-ohio-2026-legal-preflight.test.mjs`: test statute changes, date discipline, four form charge slots, court fee, nonconviction and excluded convictions, checkout gate.

## Actual-filing blockers
1. Confirm the applicant's correct docket by official CourtView and match identity, case number, judge and *complete* final counts.
2. Verify each original versus final statute/degree, judgment, any dismissals, and whether related counts share one act.
3. Obtain authoritative sentence and supervision termination records, fines/restitution sentence obligations and resulting final discharge date.
4. Check applicant-wide convictions/pending matters, excluded offenses, R.C. 2953.61 and F3 aggregate rules.
5. Obtain approval of current Wood County form version, signature / notarization / service requirements, local court fee and a case-specific reviewed form mapping.
6. Implement a trusted court/legal reviewer release gate on the server, then prepare the real PDF for *applicant review*. Only after separate applicant approval could payment and filing be considered.

Until those checks are done, the pilot test is an **incomplete private preparation draft**, not a legally eligible filing or paid service.
