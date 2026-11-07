# RecordPathAI Form Mapper V7 — scraper-to-autofill contract

**Status:** Browser-only synthetic/draft support, no real data, no live court filing, no court-fee or Lob activity.

The objective is to let authorized, court-source-aware scrapers discover new jurisdictional forms, retain a private immutable source version, suggest its fields, and later populate the **correct verified form** from normalized eligibility/record-details data without asking the user to retype what has already been verified.

## Versioned workflow

1. **DISCOVER:** Existing `tools/form-crawler.js` adds candidate metadata to `admin/review-queue.json`. Search results are *leads*, not legal authority: the crawler's scoring cannot prove a website is the correct court or that the PDF is currently accepted.
2. **COPY / HASH:** Download an authorized original blank PDF to `assets/forms/.../*.pdf` only after source and download policies are satisfied. The V7 batch tool *never* performs a network request.
3. **PREPARE:** `node tools/prepare-form-candidates.mjs --state=OH --county=wood --wood` runs a **read-only preview** on the existing official Wood County PDF. Add `--write` to save a versioned **pending-review** manifest in `admin/form-candidates`, not to production templates. Other already-downloaded items from the review queue can be scanned without `--wood`.
4. **MAP:** Open `pdf-mapper-v7.html`. Import the generated JSON and select its downloaded PDF (the page will load a safe `assets/forms/` path if the public preview contains it). Recalculate the original PDF's SHA-256 in the browser, scan its text and form widgets, review the suggested boxes, and correct placement.
5. **TEST:** Load the **synthetic** case fixture. The browser previews the specific `court.case_number`, `petitioner.*` and `charges.0.*` canonical keys that each field would receive. Download a watermarked synthetic PDF draft. Signature boxes are never written automatically.
6. **REVIEW:** Download the V7 **review bundle** with the original PDF hash, source link, exact jurisdiction and proposed mapping. Its status is always `pending_review`; this cannot activate production form filling. Approvals need to be recorded and authenticated in a *private* reviewed form registry.
7. **FUTURE RELEASE:** A separate authenticated service must verify the approved immutable PDF digest, its court/jurisdiction/form-type, eligibility logic, source currency, applicant consent, required signatures/notarization and fee route before any real PDF generation, payment or filing.

## Manifest schema

`recordpathai.form-candidate.v1` contains:

- `id`: deterministic identity anchored in court, form type and PDF fingerprint
- `jurisdiction`: state, county, court type and court name
- `form`: form type and title
- `source`: original HTTPS source URL, source page and discovery timestamp
- `pdf`: local asset path, SHA-256, byte count and page count
- `mapping`: suggestion list, profile, diagnostic messages and draft fields
- `review`: *false by default* source verification, mapping approval, and legal routing approval
- `active`: *false by default*, regardless of form crawler confidence

A changed PDF generates a new SHA-256 and candidate version. Mapping a PDF with a different hash is blocked; a source can change while retaining an identical file name or URL. A review bundle may be imported as **data only**, not as authorization.

## Normalized record-data keys

Mappings target existing `RecordPathDataBridge` canonical keys. Examples: `petitioner.full_name`, `petitioner.address.line1`, `court.case_number`, `court.judge_name`, `charges.0.charge_name`, `charges.0.charge_code`, `charges.0.level`, `charges.0.disposition_date` and `charges.0.discharge_date`.

- Never derive completion/termination of probation or parole from the disposition date.
- Never mark a preliminary offense charge as the final conviction.
- Never assume a charge classification establishes sealing eligibility.
- Never auto-populate a signature or notarization with a fabricated value.
- If the court form has different slots/case grouping, add a jurisdiction-specific adapter for the relevant case and offense table. Don't copy a Wood County map to another court solely because the field names look similar.
- A single form can hold a limited number of charges; excess charges must route to an approved continuation page or human review.
- Court fees and RecordPathAI fees are entirely separate from form detection. A nonconviction § 2953.33 petition must not trigger a $100 conviction check.

## Security and privacy

- No scraping of court websites from the mapper; it imports downloaded **blank** forms.
- No remote browser PDFs, arbitrary remote JSON fetches, CAPTCHA bypass or private database publication.
- Never commit case-level extracts, SSNs or client PDFs into the public repository or static preview.
- Use only locally verified same-origin `assets/forms/*.pdf` paths; other source URLs are provenance, not download targets.
- A browser-produced JSON can claim `approved`, so the V7/shared helper refuses **all production mode**. An authenticated registry with approvals enforced server-side is required before live use.
- The synthetic PDF preview contains an explicit `SYNTHETIC DRAFT - NOT FOR COURT FILING` watermark on every page.
- Future approved, private data import must require subject authorization, secure access controls, verified current case status and an audit trail. Always honor suppression/record-sealing changes.

## Use

### Current public prototype (after deployment)

`https://recordpathai-global-public.onrender.com/pdf-mapper-v7.html?form=wood-nonconviction`

1. Select **Apply strong matches** (these remain editable).
2. Select **Bind PDF and create draft manifest**.
3. Select **Load synthetic record**.
4. Select **Preview field values**.
5. Select **Download synthetic PDF**; inspect the generated watermarked preview.
6. Select **Download review bundle** to produce a complete, hash-bound mapping proposal for authenticated review later.

### Local review queue

```bash
npm ci --ignore-scripts
npm run forms:candidates:wood
npm run forms:candidates:dry
node tools/prepare-form-candidates.mjs --state=OH --county=wood --wood --write
npm run test:security
```

No command above sends actual court filings or payments. `--write` only creates pending review manifests within the private working copy; an operator should review these before any repository commit.

## Limitations

- Generic PDF label detection is heuristic and can miss labels or choose incorrect blanks; scanned/image-only PDFs need manual mapping or an approved OCR pipeline.
- The synthetic-preview renderer supports basic single-line text boxes and dates; it does not yet handle document-specific wrapped paragraphs, actual e-signatures, checkmarks dependent on legal judgments, PDF/A verification, or submission.
- Real customer data auto-population, production form approval, legal rules integration, and LOB filing are still separate milestones. This feature only establishes the scraper-to-mapper contract and a working synthetic proof.
