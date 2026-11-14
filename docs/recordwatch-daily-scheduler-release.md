# RecordWatch Daily Premium Scheduler: deployment and checks

**Deployment model:** Google Cloud Run Job with a separate service identity. The only operator secret is securely stored in Secret Manager and mounted into the Cloud Run application and one-task Job. Cloud Scheduler calls the **Google Cloud Run Jobs API** via an OAuth service account token; it never stores a raw SMS/Stripe key or the RecordWatch scheduler key in its job configuration.

**Cadence:** daily at 15:00 UTC. Both Cloud Run Job task retries and Cloud Scheduler retries are disabled, to avoid double-send after ambiguous failures. The production delivery ledger additionally deduplicates messages.

**Safety:** The app's authenticated worker checks every case against a real Stripe-confirmed active $39 **one-time** paid case, explicit per-channel consent, STOP suppressions, and eligibility-date reminder thresholds, before calling Resend or Twilio. No personal case details are included in message bodies. No free Premium, test customer record, or real card purchase is created during activation.

**Procedure:** merging to `main` launches the existing secured build/test/Cloud Run zero-traffic promotion workflow. Once it completes, the `activate-recordwatch-daily-scheduler` GitHub workflow attempts to provision Cloud Scheduler with the existing protected workload identity. If the deploy identity lacks IAM/service-account or Scheduler administration, the workflow **fails safely**; an authorized operator can run `bash ops/activate-recordwatch-daily-scheduler.sh` in authenticated Google Cloud Shell from the current checked-out repo.

The provisioning script creates a new protected scheduler key if necessary; grants only two runtime identities access to that secret; verifies zero-traffic readiness; creates a job runner with zero retries; makes the Scheduler job with scoped job execution IAM; pauses it until production readiness and a single authenticated job execution have succeeded; then resumes the daily schedule. If setup fails, it attempts to pause the Scheduler and restore previously serving traffic.

Verification commands (no secret material):
```bash
curl -fsS https://recordpathai.com/api/recordwatch/alerts/readiness | python3 -m json.tool
gcloud scheduler jobs describe recordwatch-daily-alerts --location=us-west1 --project=recordpathai-production --format='json(state,schedule,timeZone,httpTarget.uri)'
gcloud run jobs describe recordwatch-daily-alerts --region=us-west1 --project=recordpathai-production --format='json(status)'
```
Expected: email_ready, sms_ready, migration_verified, ready, daily_scheduler_configured all true; Scheduler state ENABLED; Google Cloud job exists and completed its dry-run against the existing paid-case worker. Provider accepted != handset delivery.

**Important remaining validation:** The production database currently has zero paid active cases, so a no-customer execution cannot validate the Stripe sandbox Checkout → signed webhook → case entitlement → independently saved SMS consent → authenticated test-send lifecycle. Production integration tests cover prices, paid/refunded guard, consent, signature, STOP/START, and exactly-once ledger. Perform a legitimate isolated **Stripe test-mode** $39 checkout on a separate sandbox saved case to finish the purchaser acceptance test; never fabricate a paid row or use real funds to simulate a purchase. The scheduler can operate safely with zero paid cases while that acceptance test is pending.

**Scaling:** The current worker reads at most 1000 paid cases per invocation. A page cap flag deliberately surfaces an error in the run log so pagination must be implemented before high-volume expansion.
