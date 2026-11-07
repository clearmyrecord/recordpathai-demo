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

test -f package.json && test -f self-search.html && test -f pilot-demo.html && test -f js/pilot-demo.js || {
  echo "Run from the RecordPathAI website source directory" >&2; exit 2;
}
node --check server.js || exit 2
node -e 'if (require("./package.json").engines.node!=="22") process.exit(2)'

echo "Checking existing service $SERVICE in $PROJECT/$REGION..."
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json >/tmp/recordpathai-cloudrun-before-$$.json || {
  echo "Target service does not exist or this identity is not authorized. Nothing deployed." >&2; exit 3;
}
BEFORE="/tmp/recordpathai-cloudrun-before-$$.json"
SMOKE_DIR="$(mktemp -d)"
trap 'rm -f "$BEFORE"; rm -rf "$SMOKE_DIR"' EXIT

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

# Verify the complete HTTP response before searching its contents. With
# "set -o pipefail", piping curl into "grep -q" can make curl exit 23 (SIGPIPE)
# as soon as grep finds the phrase, even though the website is perfectly healthy.
# That previously caused an unnecessary production rollback of a healthy revision.
smoke_check() {
  local path="$1" expected="$2" label="$3"
  local body="$SMOKE_DIR/${path//\//_}"
  echo "Checking $label at $URL/$path..."
  if ! curl --fail --location --silent --show-error --max-time 60 \
    --output "$body" "$URL/$path"; then
    echo "$label did not return a complete successful HTTP response" >&2
    return 1
  fi
  if ! grep -qiF -- "$expected" "$body"; then
    echo "$label response is missing the expected marker" >&2
    return 1
  fi
}

rollback_after_smoke_failure() {
  local reason="$1"
  echo "$reason; reverting traffic to $OLD_REV" >&2
  gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --to-revisions "$OLD_REV=100" --quiet
  exit 5
}

if [ -z "$URL" ]; then
  rollback_after_smoke_failure "Deployed service URL missing"
fi

smoke_check "self-search.html" "Find your own court records" "Guided case search" || \
  rollback_after_smoke_failure "Guided case search failed smoke check"
smoke_check "pilot-demo.html" "Illustrative demo" "Fictional pilot page" || \
  rollback_after_smoke_failure "Fictional pilot page failed smoke check"
smoke_check "js/pilot-demo.js" "DEMO-2006-001" "Fictional pilot script" || \
  rollback_after_smoke_failure "Fictional pilot script failed smoke check"

echo "Cloud Run deployment verified: $URL/self-search.html and $URL/pilot-demo.html"
echo "Public court-record indexing remains OFF until court authorization and status review."
