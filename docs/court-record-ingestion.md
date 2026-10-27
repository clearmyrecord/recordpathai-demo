# Court record ingestion — security and release gates

Status: **NOT LIVE**. No court record has been imported or published by this change.

## Source adapters
- Wood County Ohio: clerk-generated fixed-width Criminal Extract Report (.dat); layout document supplied by the clerk. Parse only after field-level verification and test fixtures made from synthetic data.
- Other courts: separate source adapters; no statewide Ohio or Nevada bulk API assumed.
- Keep provenance: court, case identifier, export timestamp, import timestamp, report window, source version, permissions, and parser version.

## Mandatory controls before production
1. Obtain written permitted-use, redistribution, retention, and security terms from each source.
2. Keep original reports and parsed records in access-controlled server-side storage, never in public GitHub or static-site assets.
3. Validate record layout, case/charge linkage, dispositions, and dates; quarantine malformed/ambiguous rows.
4. Never import or expose sealed, expunged, juvenile, confidential, or otherwise restricted records.
5. For every monthly extract, recheck prior imported cases for sealing/expungement or changed status; where the source cannot provide deletions, schedule full-period refresh and a direct suppression channel. Fail closed when current status cannot be confirmed.
6. Public search is disabled by default. Require a documented legal/privacy review, publication authorization, and data minimization before enabling any public case display.
7. Do not treat elapsed time alone as proof of eligibility. Final discharge, statutory exceptions, pending cases, and jurisdiction-specific rules require verification.
8. Use role-based admin access, encryption, audit logs, retention limits, and deletion/takedown workflow. Never expose raw extracts to the browser.
9. Do not initiate automatic unsolicited outreach to individuals identified in criminal records.
10. Test with synthetic records only until the source terms and safeguards are approved.

## Implementation sequence
- Build a private, server-side ingestion service and staging database.
- Implement fixed-width parser against the clerk's field breakdown with synthetic fixtures.
- Add deduplication, provenance, versioning, suppression, and reconciliation.
- Create admin-only import preview with record counts, error summaries, and explicit approval.
- Connect authorized, verified records to the site's eligibility flow through a protected API.
- Expand one court at a time, with independent source permissions.

**Deployment gate:** production ingestion and public indexing remain off until the source's terms and ongoing suppression process are verified.
