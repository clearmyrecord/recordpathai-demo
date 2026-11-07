# Agent 1 — Ohio public court docket links (customer Record Collection)

**Assigned:** 87 Ohio counties outside the existing Wood County pilot. All 88 counties are inventoried in `data/ohio-counties.json`. Wood is explicitly excluded from automated county-source research and retains the manually verified official clerk docket link in `js/record-collection.js`.

**Status at assignment:** 87 queued / 0 newly searched / 0 approved new county links. The official Supreme Court of Ohio court directory is the fallback in Record Collection until a specific clerk docket is checked: https://www.supremecourt.ohio.gov/courts/judicial-system/ohio-trial-courts/

## Scope and limits

Agent 1 looks for official court public case/docket search **web pages** by county. It does **not** retrieve individual criminal histories, fill CAPTCHAs, scrape docket pages, download private court records, assign final eligibility, approve forms, collect fees, or mail packets. Court-of-Common-Pleas vs municipal records must be independently verified for each county and court before using a candidate URL for customers.

Research can run on weekdays, in batches of **up to 10 counties** and **1 query per county by default**, for at most 10 search provider requests a weekday; a manual dispatch allows a maximum of 15 counties / 2 queries. Search requires both the `SERPAPI_KEY` repository secret and the `OHIO_RESEARCH_ENABLED=true` repository variable. No API credential, no search: the workflow logs a preview rather than falsely marking counties completed.

Public search leads are saved to a separate GitHub branch `automation/ohio-docket-discovery` and opened for review. **Only a human-reviewed and confirmed clerk docket link may be added to the public `js/record-collection.js` link list.** Unverified links never become customer-facing URLs.

## Completion checklist

- [x] Ohio 88-county roster already exists; Wood excluded from new Agent 1 scope.
- [x] 87 counties assigned to a stable, retryable queue.
- [x] Research-only worker, logs, source safety checks and separate review workflow implemented.
- [ ] Enable `OHIO_RESEARCH_ENABLED` and `SERPAPI_KEY` in GitHub to make external search requests.
- [ ] Review each candidate against the official court domain, correct court division, current docket, and accessibility.
- [ ] Add reviewed URLs to Record Collection; no automatic publication.
- [ ] Continue until all 87 counties have been independently researched and approved as having an accurate lookup route (online docket or verified clerk contact fallback).

The customer-facing worksheet intentionally contains no agent internals, field paths, mapping status, or developer identifiers.

## Exact court and full-field mapping contract

Ohio's official trial-court directory lists **multiple courts and court divisions per county**: a county record is not a court record. Each source must be attributed to a court that actually heard the case, not just a county inferred from the applicant's address. For misdemeanors, municipal and county courts may be the correct venue even where a Common Pleas court exists.

**Required internal inventory for each applicable court:** state, county, unique court ID, exact official court name, approved aliases, official court type, division, published court/Clerk website, public docket URL, case search form inputs, result-table columns, detailed case fields, charge-level information, original vs reduced/final charges, disposition and sentence-completion dates **as separately available**, docket entries, optional public document links, access restrictions, date checked, and supporting page URLs. Also inspect any official sealing/expungement filing forms and PDF/online fields independently of the docket website.

**Never substitute a county or portal vendor name for court identity.** Multiple divisions may share a website; distinct court IDs must still route the applicant to the correct court. A case transferred or bound over from municipal court to Common Pleas may have separate case numbers and docket histories; preserve both with separate source links and do not merge them solely because names/dates match.

**Completion standard:** every field *observed in the actual court website*, including conditional fields, must be classified as mapped, deliberately excluded (with reason), unavailable, or requiring further review. Search results alone cannot reveal all page fields. Dynamic JavaScript CourtView applications may require a human browser inspection of the public blank form, results headings and page layout; do not circumvent CAPTCHA, sign into private pages, scrape personal court records or claim that an uninspected interface is mapped. Store observed labels and selectors only, **not personal values, access tokens or session cookies**.

### Technical artifacts

- `data/ohio-court-mapping-assignments.json` contains 87 assigned county research jobs, each awaiting an accurate per-court inventory.
- `data/ohio-court-portal-maps.json` stores only **reviewed court lookup references**, not raw findings. The Wood County Common Pleas link is reviewed; its CourtView input/result fields remain **uninspected**.
- `tools/run-ohio-docket-agent.mjs` rotates through four explicit research stages: Common Pleas, municipal, county courts and other criminal courts. It runs in small batches; source leads do not become approved links.
- `tools/ohio-public-portal-field-inventory.mjs` can inventory the **saved HTML of a blank official public court page** offline: `node tools/ohio-public-portal-field-inventory.mjs --input=blank-public-form.html --url=https://official-court.example --court-id=oh-confirmed-court-id --output=review.json`. It captures search controls, table headers and detail labels without values, and requires manual approval. Do not save/copy real defendant records into GitHub.
- `admin/ohio-court-mapping.html` reports each county's status and per-court field mapping readiness.
- `js/record-collection.js` routes a customer only after **state + county + court type + exact reviewed court name** match an approved entry. Otherwise the official Ohio trial-courts directory is shown. An approved link is not proof the applicant's case appears there.

**Search authorization:** `SERPAPI_KEY` and `OHIO_RESEARCH_ENABLED=true` must both be set in the GitHub repository; otherwise an automated preview is generated with zero searches. Neither this feature nor the customer worksheet unlocks court e-filing, private data collection, automated record extraction, legal eligibility, payment or Lob mailing.
