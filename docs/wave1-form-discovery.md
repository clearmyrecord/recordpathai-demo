# Wave 1 court-form discovery and early data collection

**Targets:** Nevada (Clark, Washoe), Texas (Harris, Dallas), Florida (Miami-Dade, Orange), Arizona (Maricopa, Pima), Georgia (Fulton, DeKalb). Ten seeded **discovery leads**, not ten verified court forms. Ohio is the operational pilot and is handled by the existing catalog. Illinois and Utah remain preparatory pilot opportunities, not active packet libraries.

## State-sensitive workflow prompts

The eligibility page already collects the common fields (court/county/case, statute, degree, charge-specific final outcome and judgment date, separate probation/parole termination date, address, charge completeness). This branch adds **optional, state-sensitive preparatory fields**, before court-specific mapping has been approved:

- **Nevada:** arresting agency and other agencies holding criminal history (records to be covered by a sealing order).
- **Texas:** arrest date, arresting agency, and agencies requiring notice/service. Harris County says it does not publish a blank expunction petition and directs petitioners to the District Attorney; never fabricate a template or assume a universal court filing fee.
- **Florida:** FDLE certificate eligibility status and reference, plus arrest agency. Certification and actual court petition routing must be separately confirmed.
- **Arizona:** other names used, arresting agency/date, and prior sealing petition denial date (if any). The Arizona judicial branch publishes statewide sealing forms and guidance.
- **Georgia:** arrest date, arresting agency and prosecutor, since record restrictions may require an agency/prosecutor rather than a judicial petition and pre-/post-2013 arrests differ.
- **Ohio pilot:** a prosecuting agency field when available.

These are **provisional data-gathering prompts**. They do not certify legal eligibility, a form's required fields or the appropriate recipient. Mapped court PDFs override/augment these prompts once approved. The new fields retain their values through the eligibility and record-details workflow.

## Crawler

`data/wave1-court-catalog.json`: 10 named jurisdictions (two per state) with real official portal leads **only where verified**. Missing source pages remain blank, never invented.

`tools/form-query-builder.mjs`: state-aware and court-aware search queries. Removes the old hard-coded `County Ohio` search terms for every state.

`tools/form-crawler.js`: with `--wave1`, reads these discovery seeds. In Wave 1 mode **NO PDF IS DOWNLOADED**, even with `--apply`; any source result is marked `source_verification_required` in the review queue. A search result's ranking and URL do not prove the form is official, current or legally applicable.

```bash
npm run crawl:forms:wave1
# After configuring SerpAPI and reviewing scope; writes review-queue leads only:
npm run crawl:forms:wave1:review-queue
npm run test:security
```

Without a configured SERPAPI_KEY, no web discovery results are available. The ten catalog entries remain discovery targets, **not completed scrapes**.

After an operator verifies the official court/agency source and lawfully obtains the blank PDF, the V7 form pipeline can fingerprint that PDF, create a review manifest, suggest fields, run a synthetic fill and flag form mismatches. Final source/mapping/legal routing activation is authenticated server-side work; the public mapper cannot approve itself. No customer payments, Lob mail, court e-file, or private criminal-history records are involved.

## Official starting references

- Nevada Clark County Eighth Judicial District Court: https://www.clarkcountycourts.us/departments/clerk/filing/
- Texas Harris County District Clerk expunction FAQ: https://www.hcdistrictclerk.com/common/FAQ/faq.aspx?Level1=divmainCustomerService
- Florida Miami-Dade Clerk criminal records: https://www.miamidadeclerk.gov/clerk/criminal-records.page
- Arizona Judicial Branch sealing: https://www.azcourts.gov/selfservicecenter/Criminal-Law/Sealing-records
- Georgia Bureau of Investigation record restriction: https://gbi.georgia.gov/services/georgia-criminal-history-record-restrictions

These sources are examples of differing state workflows and are not proof that a particular court's PDF is ready to file.
