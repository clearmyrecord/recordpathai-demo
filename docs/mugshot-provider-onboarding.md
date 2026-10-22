# Mugshot removal automation — integration readiness

## Current production behavior
- Public web discovery: user-initiated Google search in a new tab; no automated results imported.
- Official NV/FL/OH court directory: court-portal links, not individual case search.
- Removal requests: in-browser letter and Florida registered-mail packet generation.
- Tracking: opt-in browser localStorage, not cross-device/server tracking.

## External prerequisites (not yet approved)
1. **Web discovery API**: Obtain licensed search provider credentials, terms allowing retrieval/display of snippets, privacy review, billing limit. Do not use Google Custom Search JSON API for new onboarding; Google closed it to new customers in January 2026. Evaluate approved alternatives and obtain contract.
2. **Court/booking data**: Obtain a written grant of access and permitted reuse for each county/provider. Must distinguish arrest, case, conviction, sealing and expungement status. Do not scrape CAPTCHA, protected rosters or commercially restricted data. Never index mugshot/person profile pages in public search engines.
3. **Outbound delivery**: Verify each publisher's official removal channel and registered agent. Email delivery is not sufficient for Florida Statutes §901.43, which specifies registered mail and identifying evidence. Select a fulfillment partner only if it explicitly supports registered mail and delivery confirmation; get customer consent, price quote, and agreement.
4. **Inbound response tracking**: Connect an authorized mailbox or webhook provider; verify signatures, associate responses to user-owned requests, prevent cross-user access, define retention/deletion and audit log. Browser-only status remains available until secure backend is deployed.
5. **Security/compliance**: User identity verification, access controls and RLS, encryption, minimal retention, no public mugshot republication, correction and deletion rights, anti-abuse/rate limits, privacy and legal review.

## Provider outreach — ready to send after owner approval
Subject: Authorized court and booking data access inquiry — RecordPathAI

Hello,

RecordPathAI is developing a private, user-directed tool that helps individuals locate their own court/booking records, verify dispositions, and request lawful correction or removal. We are seeking authorized machine-readable access to records for Nevada, Florida, and Ohio.

Could you provide details about API or bulk-data availability, geographic coverage, update cadence, permitted commercial and consumer-facing uses, treatment of sealed/expunged records, mugshot licensing, data quality, privacy requirements, pricing, and onboarding steps?

We will not republish indexed arrest-profile pages or resell booking photos. Please send your data-use agreement and technical documentation.

Thank you,
RecordPathAI

## Acceptance criteria before marking an integration LIVE
- Written permission and credentials for each provider.
- Backend secret management; no API keys in GitHub Pages.
- Real test queries using authorized non-sensitive fixtures; error and quota handling.
- Identity-match confirmation and source provenance; no claims of conviction from booking photos.
- User consent and deletion flow; secure ownership enforcement.
- Verified mail/response lifecycle and delivery proof for applicable jurisdictions.
- End-to-end smoke test on recordpathai.com with deployment verified.

## Current blockers
Provider identity, approved contracts, credentials, billing authorization, sender/registered-mail account, and privacy/security sign-off are not available in the repository. Do not enable automated submission or ingestion until these are supplied.
