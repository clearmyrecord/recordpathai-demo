# Wood County 2000–2026 — private data bridge and aggregate pilot

**State:** staging-ready, not production-authorized. Source review: 2026-11-18.
The `Joined Charges` tab is the authoritative working *extract* for this integration, **not** the Ohio judiciary's certified docket or a legal eligibility determination.

## Existing source and reconciliation

- 54,548 historical source charge rows (2000–2026 annual exports).
- 14,884 distinct raw Case IDs; repeated annual extracts must not be counted as separate people, convictions or applications.
- Last verified preliminary spreadsheet categories: blue 14,350; green 16,746; red 9,943; yellow 13,509.
- Private converter QA on the 54,548-row source (with aliases, DOBs and Gmail message IDs excluded from intermediate CSV): **14,885 case-and-defendant groups, 28,551 provisional charge groups, 25,997 repeated export rows consolidated, one Case ID with multiple normalized defendant names**.
- The separate November 15 disposition-to-termination study found 28,546 provisional charge keys under a *different* [case, charge number, normalized statute base, normalized charge description] grouping. **Do not force the two figures to match or claim either is legally unique**. The extractor also has more than one date basis; reported termination is not final discharge.
- `data/wood-county-screening-snapshot.json` has aggregate-only metrics. `admin/wood-county-pilot.html` displays those aggregates, not personal data, and does not query private source tables.

## Private data conversion

From the user's authorized **Joined Charges** worksheet, export only that tab as UTF-8 CSV. Do not commit CSV, raw XLSX, DAT, JSONL or applicant identifiers to GitHub. Preserve the original file separately and do not edit the master sheet.

```bash
node tools/convert-wood-county-joined-csv.mjs \
  --input=/private/wood-county-joined.csv \
  --output=/private/wood-county-quarantined.jsonl \
  --expect-rows=54548
```

The converter:
- validates source headers and source-row count;
- retains annual report provenance and **unverified** source charge status, status date, statute code audit, disposition and reported termination as separate fields;
- never treats source offense description as a verified *final* charge or source status as a certified disposition;
- does not export DOB, aliases, Gmail message IDs or scenario sealing dates;
- groups cases by Case ID **and defendant name**, without silently merging identity conflicts;
- deduplicates identical [charge number, statute, charge description] within a case using the latest annual report, without merging likely amendments;
- rejects oversized per-case groups and mismatched counts; creates an exclusive mode-0600 private JSONL, not an application log.

### Authorization and database staging

The existing private-source importer requires an independently documented authorization manifest recording the issuing agency, exact official source link, jurisdiction (`OH`, FIPS `39173`), source date, lawful access authority and the authorized operator. **Do not invent these references or treat possession of a spreadsheet as automatic authorization for public matching or outreach.**

```bash
node tools/import-authorized-court-jsonl.mjs \
 --input=/private/wood-county-quarantined.jsonl \
 --manifest=/private/wood-county-authorization.json
```

Only after reviewing that private manifest, verifying the correct *staging* Supabase project and loading an approved service-role credential from a secure secret store may an operator enable a quarantined upload:

```bash
RECORDPATH_PRIVATE_INGEST_ENABLED=true \
 RECORDPATH_SUPABASE_URL="https://staging-project.supabase.co" \
 RECORDPATH_SUPABASE_SERVICE_ROLE_KEY="FROM_SECRET_MANAGER" \
 node tools/import-authorized-court-jsonl.mjs \
  --input=/private/wood-county-quarantined.jsonl \
  --manifest=/private/wood-county-authorization.json \
  --ack-authorized --execute
```

The `20261118000000_wood_county_reported_source_observations.sql` additive migration extends the existing RLS-protected private charge-version table. There is **no** anonymous/authenticated read grant and **no** browser-accessible matching endpoint. Keep staging imports `quarantined` until independent review.

## Hard gates to any customer-facing linkage

1. Determine access and permitted-use terms for the Wood County extracts, and record source/record version provenance.
2. Independently verify applicant identity, correct docket, amended/final counts, official disposition and whether connected charges are subject to R.C. 2953.61.
3. Verify probation, parole, fines and other conditions **separately** from the source `Termination Date`; establish final discharge only with supporting evidence.
4. Apply current Ohio R.C. 2953.32 and 2953.33 and offense-subsection exclusions, including F3 aggregate counts. The workbook's blue/green/red/yellow codes are merely triage.
5. Build audited, applicant-scoped release and correction/dispute controls; never expose a bulk criminal-record name search.
6. Use customer-entered **Supabase** data for intake, RecordWatch and packet review, not browser storage. A private historical court extract is not authority to overwrite that canonical user data.
7. Keep Stripe purchase, packet release and live Lob dispatch locked until separate authenticated review, genuine signed payment evidence, court acceptance and explicit filing authority are established.

### Legal references

- https://codes.ohio.gov/ohio-revised-code/section-2953.32
- https://codes.ohio.gov/ohio-revised-code/section-2953.33
- https://codes.ohio.gov/ohio-revised-code/section-2953.61

No real records, customer identities or clerk emails are stored in this repository.
