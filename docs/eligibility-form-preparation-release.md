# Eligibility & court-form preparation hardening — November 7, 2026

## What is implemented

1. **Charge-by-charge audit on both intake screens:** The Form Readiness panel now renders each original/final outcome and separate judgment versus final discharge review status. No public court-record search or database import is required.
2. **Private preparation worksheet:** Applicant can download a plain-text checklist of the single case, every charge, its separate dates, missing fields, mapping status and next verification steps. It is generated in the browser without sending a form, payment, record, or email to third parties. It excludes SSNs, bank data, signatures and private access keys.
3. **Exact court identity:** Record Details requires a human-chosen court type and saves it in canonical court data. A template is selected only if state, county, explicit court type and all-charge outcome match an active entry. No county-only or inferred court match.
4. **Date integrity:** Required charge-specific judgment dates must be real dates not in the future. For a conviction, a separate documented final-discharge date is needed to complete baseline screening. Invalid dates or discharge earlier than disposition trigger review, rather than defaulting to the case close date.
5. **Multi-count caution:** Multiple convictions, mixed outcomes, and applicant-supplied records can be organized and exported for human review, but checkout and auto-filing remain blocked pending verified case-wide legal analysis and court-form approval.
6. **Trust boundary:** Browser localStorage entries cannot supersede the checked-in active template registry. If the eligibility module fails or a state is unsupported, packet checkout fails closed. The early intake can proceed to Record Details with missing items; missing data is not interpreted as approval.

## Operator acceptance test

- Open /eligibility.html and select **Ohio**, **Wood**, **Common Pleas**, one synthetic case and a charge.
- Enter separate judgment and final-discharge dates; try missing, impossible and future dates and review the required-field panel.
- Continue to /record-details.html and verify court type persists, each additional charge has its own judgment/completion dates and the downloaded worksheet includes all counts.
- Try a mismatch (municipal court instead of Common Pleas) and verify no approved Wood County conviction form is selected.
- For a complete single-count synthetic conviction, the active Wood County mapping is discoverable, but neither the preview nor this worksheet proves legal eligibility, payment, mailing or filing.
- Run `npm run test:security`. Production deployment remains through the protected manual Cloud Run workflow only.

## Legal and operational limits

This is **data readiness and reviewed form preparation**, not a substitute for a court-verified legal eligibility engine. Each state's statutory rules, relief mechanism, case-wide conviction count and exclusions require verified current sources; no claim of completed Wave 1 court form integrations is made. One active mapped Ohio Wood County conviction PDF exists in the template index. Other court forms remain unapproved until their source, PDF SHA, field geometry, signature/notice requirements and filing instructions are reviewed.

For Ohio, the authoritative revised statute is https://codes.ohio.gov/ohio-revised-code/section-2953.32 (effective Sept. 30, 2025). Ohio Legal Help notes that nonconviction sealing/expungement has **no filing fee**, while conviction relief filing fees are capped at **$50**, and may be waived when appropriate: https://www.ohiolegalhelp.org/topic/seal-criminal-record . This supersedes unverified assumptions of a universal $100 clerk filing fee; RecordPathAI's own proposed document-preparation fee is separate.

Any proof of final discharge must be verified independently of the disposition date. A reported supervision/termination date from a bulk extract is **unverified** until confirmed. Do not import private court exports into the public site or package them into Cloud Run, publish defendant data, send mail, or charge customers from draft workflow results.

## Remaining launch gates

- Verify each jurisdiction's current statutory provisions and exclusions, actual applicant case history, any multiple-count and recurrence rules.
- Obtain reviewed/approved court PDF maps for each court and outcome, and authorize application routing and filing fees.
- Complete secure authenticated private-record matching, freshness/suppression checks, and personally authorized filing.
- Resolve Lob 403 test-mode authorization, inspect generated proofs, then separately approve actual mail, fee payments and e-filing.
