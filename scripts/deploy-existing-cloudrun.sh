#!/usr/bin/env bash
# Deploy ONLY to the existing RecordPathAI Cloud Run service.
# Use from authenticated Google Cloud Shell or the protected GitHub workflow.
# No passwords, tokens or court records should be printed or committed.
set -Eeuo pipefail

PROJECT="${GCP_PROJECT_ID:-recordpathai-production}"
REGION="${CLOUD_RUN_REGION:-us-west1}"
SERVICE="${CLOUD_RUN_SERVICE:-recordpathai}"

for cmd in gcloud curl python3; do
  command -v "$cmd" >/dev/null || { echo "Missing required tool: $cmd" >&2; exit 2; }
done

test -f package.json && test -f self-search.html || {
  echo "Run from the RecordPathAI website source directory" >&2; exit 2;
}
node --check server.js || exit 2
node -e 'if (require("./package.json").engines.node!=="22") process.exit(2)'

echo "Checking existing service $SERVICE in $PROJECT/$REGION..."
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json >/tmp/recordpathai-cloudrun-before-$$.json || {
  echo "Target service does not exist or this identity is not authorized. Nothing deployed." >&2; exit 3;
}
BEFORE="/tmp/recordpathai-cloudrun-before-$$.json"
trap 'rm -f "$BEFORE"' EXIT

OLD_REV="$(python3 - "$BEFORE" <<'PY'
import json,sys
with open(sys.argv[1]) as f: record=json.load(f)
traffic=[t for t in record.get("status",{}).get("traffic",[]) if t.get("percent",0)>0]
if len(traffic)!=1 or traffic[0].get("percent")!=100 or not traffic[0].get("revisionName"):
  raise SystemExit("Multiple active revisions: refusing automatic deployment without traffic review")
print(traffic[0]["revisionName"])
PY
)"

echo "Deploying with existing service environment and identity settings preserved..."
gcloud run deploy "$SERVICE" --source . --project "$PROJECT" --region "$REGION" --quiet

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
if [ -z "$URL" ] || ! curl -fLsS --max-time 60 "$URL/self-search.html" | grep -qi 'Search My Court Records'; then
  echo "New guided search failed smoke check; reverting traffic to $OLD_REV" >&2
  gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --to-revisions "$OLD_REV=100" --quiet
  exit 5
fi

echo "Cloud Run deployment verified: $URL/self-search.html"
echo "Public court-record indexing remains OFF until court authorization and status review."
