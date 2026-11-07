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
