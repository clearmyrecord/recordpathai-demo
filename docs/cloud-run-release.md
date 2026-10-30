# RecordPathAI.com production release

This repository contains the Cloud Run application backing the existing public domain. Code merged into GitHub is **not automatically deployed** by this repository's currently known configuration.

## Existing functionality and privacy requirements
- The new `self-search.html` finds official courts and only asks the separate Render backend for matches after `/ready` explicitly confirms an approved index.
- For non-Wood County courts, the user is taken to an official docket portal; the site does not ingest those courts' records.
- The private backend must stay `PUBLIC_SEARCH_ENABLED=false` until source permitted use, individual current-status checks, and a removal/refresh program are independently verified.
- Do not commit real court extracts, birth dates, case identities, or database connection strings to this public repository.

## Deploying current GitHub code to the existing Cloud Run service
A manual GitHub Actions workflow is available at **Actions > Deploy RecordPathAI to Google Cloud Run (manual)**. It requires one-time configuration by an authorized Google Cloud administrator:

Repository **Variables**:
- `GCP_PROJECT_ID`: the *existing* Cloud Run project ID.
- `CLOUD_RUN_REGION`: the existing service's region.
- `CLOUD_RUN_SERVICE`: the existing service name.

Repository **Secrets**:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: Google Cloud Workload Identity Federation resource for this repo.
- `GCP_DEPLOY_SERVICE_ACCOUNT`: service account with only the permissions required for source-based Cloud Run deployment and image builds.

Run the workflow with the protected **production** environment. It uses GitHub OIDC and short-lived Google credentials, not a stored long-lived service account key. Do not guess project/service names: verify them in the Cloud Run console before dispatch. The workflow does not run on pushes or on pull requests, so it cannot accidentally overwrite production.

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
