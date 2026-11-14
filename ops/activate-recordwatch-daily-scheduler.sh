#!/usr/bin/env bash
# Protected one-time activation of paid RecordWatch daily alerts. No raw keys in logs/job metadata.
set -Eeuo pipefail
PROJECT="$GCP_PROJECT_ID"; REGION="$CLOUD_RUN_REGION"; SERVICE="$CLOUD_RUN_SERVICE"
[[ "$PROJECT" == recordpathai-production && "$REGION" == us-west1 && "$SERVICE" == recordpathai ]] || exit 2
SECRET=recordwatch-alerts-scheduler-key
JOB=recordwatch-daily-alerts
RUNNER="recordwatch-alert-runner@$PROJECT.iam.gserviceaccount.com"
SCHEDULER="recordwatch-scheduler@$PROJECT.iam.gserviceaccount.com"
READINESS=https://recordpathai.com/api/recordwatch/alerts/readiness
URI="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$JOB:run"
TMP="$(mktemp -d)"; OLD="";PROMOTED=false
trap 'rm -rf "$TMP"' EXIT
rollback(){
  echo 'Activation failed. Pausing schedule and restoring previous traffic if changed.' >&2
  gcloud scheduler jobs pause "$JOB" --project="$PROJECT" --location="$REGION" --quiet >/dev/null 2>&1 || true
  if [[ "$PROMOTED" == true && -n "$OLD" ]]; then
    gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --to-revisions="$OLD=100" --quiet >/dev/null 2>&1 || true
  fi
}
trap rollback ERR
for cmd in gcloud curl python3 openssl; do command -v "$cmd" >/dev/null || exit 2; done
curl -fsS --max-time 30 "$READINESS" >"$TMP/before-ready"
python3 - "$TMP/before-ready" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert all(r.get(k) is True for k in ('enabled','email_ready','sms_ready','migration_verified','ready'))
print('Email, Twilio and paid consent migration ready')
PY
# Idempotent subsequent releases: do not redeploy a working schedule.
if python3 - "$TMP/before-ready" <<'PY'
import json,sys
assert json.load(open(sys.argv[1])).get('daily_scheduler_configured') is True
PY
then
  if gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
    if gcloud scheduler jobs describe "$JOB" --project="$PROJECT" --location="$REGION" --format='value(state)' 2>/dev/null | grep -qx ENABLED; then
      echo 'RecordWatch daily scheduler is already active. No changes needed.'
      trap - ERR
      exit 0
    fi
  fi
fi

gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/service"
python3 - "$TMP/service" >"$TMP/serving" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]));a=[t for t in s['status']['traffic'] if t.get('percent',0)>0]
assert len(a)==1 and a[0].get('percent')==100
print(a[0]['revisionName'])
print(s.get('spec',{}).get('template',{}).get('spec',{}).get('serviceAccountName',''))
PY
OLD="$(sed -n 1p "$TMP/serving")"
APP_SA="$(sed -n 2p "$TMP/serving")"
if [[ -z "$APP_SA" ]]; then
  NUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
  APP_SA="$NUM-compute@developer.gserviceaccount.com"
fi
[[ "$APP_SA" == *@* && -n "$OLD" ]] || exit 3
gcloud run revisions describe "$OLD" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/revision"
IMAGE="$(python3 - "$TMP/revision" <<'PY'
import json,sys
c=json.load(open(sys.argv[1]))['spec']['containers'];assert len(c)==1 and c[0].get('image')
print(c[0]['image'])
PY
)"

# Generate a random 256-bit key directly into Secret Manager; never print/read it.
if ! gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
  openssl rand -hex 32 | gcloud secrets create "$SECRET" --project="$PROJECT" --replication-policy=automatic --data-file=- --quiet >/dev/null
fi
[[ -n "$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --filter='state:ENABLED' --format='value(name)' --limit=1)" ]] || exit 3
for NAME in recordwatch-alert-runner recordwatch-scheduler; do
  if ! gcloud iam service-accounts describe "$NAME@$PROJECT.iam.gserviceaccount.com" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$NAME" --project="$PROJECT" --quiet >/dev/null
  fi
done
for SA in "$APP_SA" "$RUNNER"; do
  gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
done

TAG="rw-alerts-$(date +%s)"
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
  --update-secrets="RECORDWATCH_ALERTS_SCHEDULER_KEY=$SECRET:latest" \
  --no-traffic --tag="$TAG" --quiet >/dev/null
for i in $(seq 1 12); do
  gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/candidate"
  if python3 - "$TMP/candidate" "$TAG" "$OLD" >"$TMP/target" <<'PY'
import json,sys
t=json.load(open(sys.argv[1]))['status']['traffic'];a=[x for x in t if x.get('percent',0)>0];c=[x for x in t if x.get('tag')==sys.argv[2]]
assert len(a)==1 and a[0].get('revisionName')==sys.argv[3] and a[0].get('percent')==100
assert len(c)==1 and c[0].get('percent',0)==0 and c[0].get('revisionName')!=sys.argv[3]
assert c[0].get('url','').startswith('https://')
print(c[0]['revisionName']);print(c[0]['url'])
PY
  then break;fi
  sleep 3
done
[[ -s "$TMP/target" ]] || exit 4
NEW="$(sed -n 1p "$TMP/target")"; PREVIEW="$(sed -n 2p "$TMP/target")"
curl -fsS --max-time 30 "$PREVIEW/api/recordwatch/alerts/readiness" >"$TMP/preview-ready"
python3 - "$TMP/preview-ready" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
assert all(s.get(k) is True for k in ('enabled','email_ready','sms_ready','migration_verified','ready','daily_scheduler_configured'))
print('Preview scheduler secret, email and SMS readiness verified')
PY
curl -fsS --max-time 30 "$PREVIEW/self-search.html" >"$TMP/search"
grep -qiF 'Find your own court records' "$TMP/search"

# Cloud Run Job obtains key only from Secret Manager, and is non-retrying.
gcloud run jobs deploy "$JOB" --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$RUNNER" \
  --command=node --args=tools/recordwatch-daily-runner.mjs \
  --set-secrets="RECORDWATCH_ALERTS_SCHEDULER_KEY=$SECRET:latest" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=300s --quiet >/dev/null
gcloud run jobs add-iam-policy-binding "$JOB" --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:$SCHEDULER" --role=roles/run.invoker --quiet >/dev/null

if gcloud scheduler jobs describe "$JOB" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then ACTION=update; else ACTION=create;fi
gcloud scheduler jobs "$ACTION" http "$JOB" --project="$PROJECT" --location="$REGION" \
  --schedule='0 15 * * *' --time-zone='Etc/UTC' --http-method=POST \
  --uri="$URI" --oauth-service-account-email="$SCHEDULER" \
  --max-retry-attempts=0 --attempt-deadline=30s --quiet >/dev/null
gcloud scheduler jobs pause "$JOB" --project="$PROJECT" --location="$REGION" --quiet >/dev/null

# Never overwrite production if another release moved traffic during setup.
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/prepromote"
python3 - "$TMP/prepromote" "$OLD" "$NEW" "$TAG" <<'PY'
import json,sys
t=json.load(open(sys.argv[1]))['status']['traffic'];a=[x for x in t if x.get('percent',0)>0];c=[x for x in t if x.get('tag')==sys.argv[4]]
assert len(a)==1 and a[0].get('revisionName')==sys.argv[2] and a[0].get('percent')==100
assert len(c)==1 and c[0].get('revisionName')==sys.argv[3] and c[0].get('percent',0)==0
PY
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --to-revisions="$NEW=100" --quiet >/dev/null
PROMOTED=true
curl -fsS --max-time 30 "$READINESS" >"$TMP/production"
python3 - "$TMP/production" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
assert all(s.get(k) is True for k in ('enabled','email_ready','sms_ready','migration_verified','ready','daily_scheduler_configured'))
print('Production scheduler key and both messaging channels verified')
PY
# One signed job execution, no manually selected recipients; paid safeguards run in API.
gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait --quiet >/dev/null
gcloud scheduler jobs resume "$JOB" --project="$PROJECT" --location="$REGION" --quiet >/dev/null
trap - ERR
echo "SUCCESS: RecordWatch daily Cloud Scheduler enabled at 15:00 UTC on $NEW"
echo 'One authenticated test execution passed; neither fake entitlements nor purchases were created.'
