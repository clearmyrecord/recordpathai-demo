# Wave 1 release operations: county → source → PDF → intake → applicant review

**Project:** RecordPathAI, November 2026. **Wave 1:** Nevada (17), Texas (254), Florida (67), Arizona (15), Georgia (159) = 512 Census county/equivalent targets. Ohio remains a distinct pilot.

## 1. County discovery and monitoring

- Browser dashboard: `/admin/wave1-operations.html`.
- Sources: `data/wave1-court-catalog.json` (512 Census FIPS), `data/wave1-agent-progress.json` (last reviewed snapshot) and `templates/index.json` (actual active mapped PDFs). Distinguish cataloged vs researched vs source leads vs verified/active.
- Five GitHub agents: `.github/workflows/wave1-county-discovery.yml`. Runs in preview mode unless repository secret `SERPAPI_KEY` and repository variable `WAVE1_SEARCH_ENABLED=true` are configured. Default limit: five counties × one query per state, weekdays, at most 25 search requests each full run.
- Results go to a separate `automation/wave1-discovery` branch and review PR. The live dashboard on `main` intentionally does not claim pending automated research is approved or that 512 county courts are integrated.

**A discovered form is not proof of a court's filing procedure, required fee, current law or legal eligibility.** Scrapers must obey source policies. No CAPTCHA circumvention.

## 2. PDF Mapper V7 — one source map can serve multiple counties

1. An operator verifies the official source URL and the court or agency responsible for the specific relief action.
2. Lawfully obtain a current blank PDF and store it under `assets/forms/`, with no applicant records inside the file.
3. From the reviewed Wave 1 research ledger, identify the `source.id`, its `counties[]` (5-digit FIPS) and the exact court/agency.

```bash
node tools/stage-wave1-mapper-candidate.mjs \
  --source-id=REVIEWED_SOURCE_ID \
  --county-fips=13121 \
  --court-type=arrest-agency \
  --court-name="Official reviewed agency name" \
  --pdf=assets/forms/ga/statewide/arrest-agency/form.pdf \
  --pdf-source-url=https://official.example.gov/forms/form.pdf \
  --ledger=/secure/reviewed-wave1-ledger.json \
  --write
```

The script checks the Census county and lead association, computes the original PDF SHA-256, extracts PDF geometry/form widgets and proposes canonical V7 field mappings using `tools/prepare-form-candidates.mjs` and `js/pdf-auto-map.js`. It creates only `admin/form-candidates/{id}.json` with pending-review flags. A source shared across counties lists its proposed coverage FIPS, but coverage for *each* court still requires confirmation.

Open `/pdf-mapper-v7.html`, import the candidate JSON, load the correct PDF, review field positions, all required form fields and signature controls, and download a reviewed mapping. The existing active-template rules still require authorized review before `templates/index.json` is updated. PDF changes invalidate prior SHA-bound mapping approvals.

## 3. Capture form fields at eligibility, not after checkout

`/eligibility.html` and `/record-details.html` already use `js/wave1-form-requirements.js` and `js/wave1-intake-ui.js` to ask common case questions and jurisdiction-sensitive preparatory questions *before* the user gets to packet/payment. Once an officially approved court map is active for an exact jurisdiction and final outcome, new required canonical PDF fields are also included in screening.

No unverified scraper suggestion is marked legally required. The absence of an active mapping blocks filing-ready packet generation and payment for that jurisdiction. Mixed dispositions and multi-charge cases remain under manual review.

## 4. Applicant-provided record prefill (functional, local-only)

Both intake pages now show **Have a copy of your court record?** with a fictional example JSON, required applicant/authorized-user confirmation, a preview of the case/charge count, and explicit application to the local case draft. The supported schema is `recordpathai.case-import.v1` and **only one case / one applicant** is accepted per import. The browser does not upload the source document anywhere.

- Original and final charges, individual final dispositions and disposition dates are copied only when provided. No conviction is inferred from the arrest offense.
- Any reported probation/parole termination date is preserved under `reported_termination_date_unverified`. It does **not** populate `discharge_date` or start an eligibility clock without independent documentary verification.
- Each import resets charge-completeness and proceedings confirmations. Applicant must review all additional form entries prompted by the exact approved mapping.
- No DOB, SSN, bank information, signature or address is invented or imported from a bulk record.
- The existing page uses browser-local storage for draft information. Do not import sensitive records on shared computers; the secure hosted private database must replace this prototype before opening broad bulk lookups.

## 5. Private bulk court source staging — schema and CLI prepared, not activated

An opt-in SQL migration `supabase/migrations/20261107000000_private_court_source_staging.sql` prepares three confidential source tables with no anonymous or signed-in user access:

- `court_source_import_batches`: issuing clerk, source authority, file version, FIPS, quarantined review state.
- `court_source_case_versions`: separate case and defendant identities, docket source, completeness and review state.
- `court_source_charge_versions`: separate original/final offenses, final disposition date, *reported* vs *evidence-verified* supervision termination date.

The migration is **not applied automatically to production**. An authorized database administrator must inspect and apply it to the correct Supabase project.

An operator with approved access to official records can validate a local JSONL export offline first:

```bash
node tools/import-authorized-court-jsonl.mjs \
  --input=/private/court-export.jsonl \
  --manifest=/private/source-authorization.json
```

It reads one case and defendant per JSONL row, with `sourceCaseKey`, `caseNumber`, `courtName`, `defendantName`, and `charges[]` (each with `sourceChargeKey`, `originalCharge`, `finalCharge`, `originalStatute`, `finalStatute`, `finalDisposition`, `dispositionDate`, `terminationDate`). A separate manifest needs `sourceKey`, `issuingAgency`, `state`, `countyFips`, `officialSourceUrl`, `dataAsOf`, `authorityReference` and `authorizedBy`. No raw records or full names are printed by the CLI; do not put input JSONL inside the Git repository.

When the authorization, production migration and secrets have been confirmed, an authorized operator **may** use:

```bash
RECORDPATH_PRIVATE_INGEST_ENABLED=true \
RECORDPATH_SUPABASE_URL="https://your-approved-project.supabase.co" \
RECORDPATH_SUPABASE_SERVICE_ROLE_KEY="from-secret-manager-not-chat" \
node tools/import-authorized-court-jsonl.mjs \
  --input=/private/court-export.jsonl \
  --manifest=/private/source-authorization.json \
  --ack-authorized --execute
```

Only service-role credentials can write the quarantined tables. The process deliberately does **not** add search endpoints for people's names or let customers access rows from other applicants. A separate authenticated match/record-release service, identity proof, use permissions, court-status verification and audit trail are required before private index data can populate a customer's actual case.

### Current release readiness

- **Available now:** 512-county catalog and public-metadata dashboard; five-state opt-in discovery worker framework; PDF-fingerprint + draft mapper stage; applicant-controlled single-case preview/prefill in eligibility and Record Details; supervised offline source-import validator.
- **Still gated:** automatic paid searches (API key/enable flag), officially reviewed Wave 1 court PDF mappings, production SQL application, importing any real private court records, verified applicant-to-record search, legal eligibility, actual form filing, and any clerk-fee or Lob mailing actions.
