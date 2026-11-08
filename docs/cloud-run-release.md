# RecordPathAI.com production release

This repository contains the Cloud Run application backing the existing public domain. The deployment workflow automatically releases new commits pushed or merged to **main**, but only after its own full validation and real container startup tests succeed. A manual dispatch remains available as a fallback.

## Existing functionality and privacy requirements
- The new `self-search.html` finds official courts and only asks the separate Render backend for matches after `/ready` explicitly confirms an approved index.
- For non-Wood County courts, the user is taken to an official docket portal; the site does not ingest those courts' records.
- The private backend must stay `PUBLIC_SEARCH_ENABLED=false` until source permitted use, individual current-status checks, and a removal/refresh program are independently verified.
- Do not commit real court extracts, birth dates, case identities, or database connection strings to this public repository.

## Automatic production deployment

The GitHub Actions workflow **Deploy RecordPathAI to Google Cloud Run** runs automatically for every new commit on the `main` branch, and can also be started manually as a fallback.

**Release gates (run before any Google Cloud authentication or traffic change):**
1. Install the locked Node.js 22 production dependencies, verify expected application assets and syntax.
2. Run the full security/intake regression suite, the offline zero-traffic/safe-rollback tests, and the production dependency audit.
3. Build and start the real production Docker image and verify the application, guided record search, **Step 1 Personal Information**, **Step 2 Case Information**, and the Supabase public configuration endpoint.
4. Check that the tested commit is still the tip of `main`; obsolete queued deployments are skipped.
5. Authenticate through short-lived Google Workload Identity Federation, deploy an isolated Cloud Run revision at **0% customer traffic**, validate the preview, promote it to **100%**, then confirm production health and revert traffic to the prior revision if verification fails.

Automatic deployment is serialized with the separate one-time release workflow; neither one should compete for live traffic. The `production` GitHub environment remains in place, so any configured required-reviewer or protection rules continue to apply. If a reviewer is required, that approval must be changed separately in GitHub environment settings for completely hands-off releases.

**One-time required configuration (production environment):**

Repository variables, with defaults that must be verified against the actual existing Google Cloud service:
- `GCP_PROJECT_ID` — currently defaults to `recordpathai-production`
- `CLOUD_RUN_REGION` — currently defaults to `us-west1`
- `CLOUD_RUN_SERVICE` — currently defaults to `recordpathai`

Environment secrets:
- `GCP_WORKLOAD_IDENTITY_PROVIDER` — Workload Identity Federation resource authorized for this repository
- `GCP_DEPLOY_SERVICE_ACCOUNT` — least-privilege Google service account for Cloud Run source build and deployment

Missing credentials fail the deployment loudly rather than silently claiming success. No Google keys, court records, or customer data belong in the repository.

**Repository security:** Automatic releases make the integrity of `main` especially important. Protect `main` with a pull request requirement and passing checks in GitHub repository rules/branch protection. As of November 7, 2026, `main` was reported as unprotected; that administrative setting is not changed by this workflow.

## Production acceptance checks
1. Confirm live root and `/self-search.html` serve the latest source and are HTTPS.
2. Verify the homepage's Search My Records link opens the guided finder.
3. For NV, FL and OH non-wood courts, confirm official portal links open without sending visitor names to RecordPathAI.
4. While court publication is disabled, Wood County displays the official docket referral and a clear unavailable message, never a false zero-results claim.
5. Once separately authorized in the future: verify redaction, distinct exact names, 24h status, source and per-case approval flags, suppression, rate limiting, audit trails and live status refreshes.
6. Test existing eligibility, packet, authentication and Stripe workflows before and after Cloud Run deployment.

## Separate Render staging prerequisites
- The Render **recordpathai-private-search-backend** service currently needs the **Internal Database URL** of **recordpathai-search-staging** set privately as `DATABASE_URL`. The Render connector does not expose that secret; use Render's own dashboard connection-injection flow.
- The database currently uses a free plan with an advertised November 28, 2026 expiry. Do not store production court data there.
- Never enable public case publication just to make a test pass. The free official-source search remains usable while the private index is disabled.
