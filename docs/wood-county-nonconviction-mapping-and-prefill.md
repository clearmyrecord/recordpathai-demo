# Wood County nonconviction form — map it in PDF Mapper V5

**Official PDF uploaded on `main`:** `assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf` (4 pages, including an Ohio record-clearing guide and Wood County address-verification page).

**Source:** https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/143/Application-for-Sealing-295333-Dismissal-PDF

**Mapper:** https://clearmyrecord.github.io/recordpathai-demo/pdf-mapper-v5.html

## How to map
1. Download the official PDF from the repository's `main` branch and upload it in PDF Mapper V5.
2. Map fields on page 3 (address-verification sheet) and page 4 (court petition). Pages 1–2 are explanatory.
3. Use **exact canonical field names** that the existing packet data bridge understands; examples:
   - `generated.current_date`
   - `petitioner.full_name`
   - `petitioner.address.line1`, `petitioner.address.line2`, `petitioner.address.city`, `petitioner.address.state`, `petitioner.address.zip`
   - `petitioner.phone`, `petitioner.email`
   - `court.case_number`, `court.judge_name`
   - `charges.0.disposition_date`
   - `charges.0.charge_name`, `charges.1.charge_name`, `charges.2.charge_name`, `charges.3.charge_name`
   - `charges.0.charge_code` through `charges.3.charge_code`
   - `charges.0.level` through `charges.3.level`
   - `signatures.petitioner_signature_name`
4. Use the mapper's **Export JSON** action and save the complete exported mapping as `templates/ohio/wood-county/sealing-dismissal.json`.
5. Review all mapped coordinates with a **synthetic** four-charge sample, confirm page numbering, signature location, truncation and margins; review against the original PDF.
6. Only after mapping QA: set the second `templates/index.json` entry to `status: "active"`, with `pdfPath` equal to the saved asset and `mappingPath` equal to the JSON path.
7. Do not treat no court check as proof of clerk acceptance. Confirm local fee practice before any live filing. Do not charge a customer for an unavailable auto-fill service.

The form's nonconviction route is **R.C. 2953.33** (not guilty/dismissed/no-bill) and routes separately from the existing **R.C. 2953.32 conviction** mapping. Dismissals without prejudice need a limitations review; a no-bill has a two-year waiting period; mixed conviction/nonconviction requires R.C. 2953.61 case-level review.

## Case-search prefill privacy and accuracy requirements

The proposed search-to-prefill branch is only for **individually verified, currently approved public results** returned by the private search service, with an explicit user selection and a short-lived session draft. It does **not** turn on unrestricted bulk public search.

The importer preserves: current case number, court, final documented charge descriptions/statutes/degrees, disposition and its actual date. It intentionally leaves `discharge_date` and `probation_end_date` blank unless the docket independently confirms actual probation/parole/sentence termination. It never guesses DOB, address, phone or SSN from court exports. Unknown dispositions block automatic form selection.

Before importing the complete historical database to production: obtain written permitted-use clarification, maintain private encrypted storage, verify current relief/suppression status, reconcile monthly updates with complete historical snapshots, and pass authentication/access-control and legal review. No raw court records are stored in this public repository.
