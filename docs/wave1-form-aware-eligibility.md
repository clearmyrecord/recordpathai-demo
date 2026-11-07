# Wave 1 form-aware eligibility intake (November 2026)

## Scope

2027 proposed Wave 1: **NV, TX, FL, AZ, GA**. The operational **OH pilot** is included so we can test against Wood County's existing conviction mapping. **IL and UT** are included as preparatory initial-pilot jurisdictions, not represented as complete court form libraries. State-wide eligibility and form approval are **not** claimed.

This release is **form-field-aware intake and checkout preflight**, not a rollout of reviewed court PDFs in every county. Actual forms vary by county, court type, outcome, effective version, and required notices.

## Before the screening can be treated as complete

The eligibility page now collects or verifies the following, in advance:

- Full legal name and mailing address, residence state, DOB (identity matching), and contact details.
- **Case state (filing location), county, exact court name/type and case/docket number**, separate from residence.
- First charge's actual description, statute, offense degree, **final disposition**, and **disposition/judgment date**.
- A separate **sentence/probation/parole termination date**, only when supported by records. No automatic conversion from the disposition date.
- A response confirming whether all charges are included and whether related proceedings may still be pending.
- Early access to **each mapped PDF's canonical field list** when an **active** template exists for the exact court, county and case outcome. Additional mapped keys not represented in the existing intake form produce editable fields automatically.

The follow-on Record Details page now provides **a final disposition, disposition date, and supervision termination date for each charge individually**; the previous implementation applied the case-level outcome to every charge, which could misroute mixed dispositions. The user can add all charges and confirm whether the docket is complete.

### Routing

- If any charge is pending, unknown, or missing a final disposition date: **review required**.
- If convictions and dismissals appear in the same case: **mixed case, manual review**; no automatic form selection.
- If all verified final outcomes are convictions: potential `sealing-conviction` form candidate.
- If all verified final outcomes are nonconvictions: potential `sealing-dismissal` form candidate.
- This is only a *form-discovery key*, not a legal eligibility ruling or proof that the form is valid in that state.
- Cases can move from eligibility intake to Record Details while unresolved extra charges are being collected, but they cannot be paid/generated without independent completion and active mapped form checks.

### Mapped form requirements

`js/wave1-form-requirements.js` merges common screening requirements with canonical field paths from the exact approved-template entry in `templates/index.json` and its mapping JSON.

- Current explicit active PDF: Wood County, Ohio **conviction**.
- Wood County nonconviction PDF is uploaded; its mapping is **pending** and is **not activated**.
- Other Wave 1 court PDFs must be discovered, source-checked, mapped in PDF Mapper V7, visually reviewed, and activated **court by court**.
- The review queue and scraped candidate manifests do not activate a form.
- For later approved forms, newly mapped fields appear automatically in eligibility/record details; dynamic fields use canonical `RecordPathDataBridge` paths, with safe validation.
- Signature boxes, generated dates and rows beyond the present charges are excluded from early required user input. Court-specific notarization, service, and legal eligibility must still be verified.

### Checkout safeguards

The packet page now requires an **active template matching state/county/court/outcome**, a successfully loaded field map, all required captured values, a verified list of each charge's final disposition and dates, and completion of the other pre-existing payment/legal gates **before** a Wave 1 customer can pay the RecordPathAI packet-preparation fee or generate a mapped packet. Otherwise it shows a missing-fields/unsupported-form message and does not continue.

**Court filing fees are not RecordPathAI's $50 preparation fee.** Do not generate a $100 check for a Wood County nonconviction. Separate Lob integration and direct clerk fee rules require their own verification and release. No money or mail is sent by this change.

## Current limitations

- The baseline field list for states lacking a reviewed local court PDF is **provisional**: it can collect useful evidence, but cannot promise every eventual form field is already present.
- Existing normalized record data may have gaps, inaccurate original charges, outdated record status or incomplete supervision dates. Treat missing source details as unknown, never invent.
- The current browser-local storage is a prototype, **not an approved repository for sensitive identifiers** such as full SSNs, bank information, or sealed documents. Private approved source ingestion requires authenticated access, updated suppression, source provenance and audit logging.
- Dynamic inputs are only generated for safe canonical keys from locally active mapped templates. Avoid collecting SSNs or applicant signatures through public/local-storage-generated fields.
- The user must review the final assembled form, signatures and court-specific instructions before filing. Nothing here sends a PDF to Lob or e-file.

## Tests

`npm run test:security` includes `tests/wave1-form-aware-intake.test.mjs` for the core routing, mapped-field coverage, charge-level completeness, and HTML/script syntax.
