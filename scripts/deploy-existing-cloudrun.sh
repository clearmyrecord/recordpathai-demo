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

BEFORE="$(mktemp)"
SMOKE_DIR="$(mktemp -d)"
AFTER="$SMOKE_DIR/after.json"
PROMOTED="$SMOKE_DIR/promoted.json"
# Unique per build: external Cloud Run deployments cannot overwrite this preview tag.
CANDIDATE_TAG="${RECORDPATH_CANDIDATE_TAG:-recordpathai-preview-${GITHUB_RUN_ID:-$(date +%s)}-${GITHUB_RUN_ATTEMPT:-$}}"
if [[ ! "$CANDIDATE_TAG" =~ ^[a-z][a-z0-9-]{4,62}$ ]]; then
  echo "Invalid candidate revision tag. Refusing deployment." >&2
  exit 2
fi
trap 'rm -f "$BEFORE"; rm -rf "$SMOKE_DIR"' EXIT
echo "Checking existing service $SERVICE in $PROJECT/$REGION..."
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$BEFORE" || {
  echo "Target service does not exist or this identity is not authorized. Nothing deployed." >&2; exit 3;
}
OLD_REV="$(python3 - "$BEFORE" <<'PY'
import json,sys
with open(sys.argv[1]) as f: record=json.load(f)
traffic=[t for t in record.get("status",{}).get("traffic",[]) if t.get("percent",0)>0]
if len(traffic)!=1 or traffic[0].get("percent")!=100 or not traffic[0].get("revisionName"):
  raise SystemExit("Multiple active revisions: refusing automatic deployment without traffic review")
print(traffic[0]["revisionName"])
PY
)"

# The service can retain historical secret environment bindings that are
# unused in this runtime. Cloud Run still checks their IAM access during EVERY
# revision deployment. Do not grant application identities admin/migration keys
# merely to make a no-traffic code release work.
#
# SUPABASE_ACCESS_TOKEN is not consumed by the running application; migrations
# occur only through an authorized administrative channel.
# LOB_LIVE_API_KEY is not needed while both live Lob switches are explicitly
# false. Preserve it otherwise, including when configuration is unknown.
# This never deletes a Secret Manager secret; it only omits an env reference
# from the candidate revision. Re-adding live Lob access requires a deliberate
# gated production change and least-privilege IAM.
mapfile -t UNUSED_RUNTIME_SECRET_BINDINGS < <(python3 - "$BEFORE" <<'PY'
import json,sys
with open(sys.argv[1]) as f: record=json.load(f)
containers=(record.get("spec",{}).get("template",{}).get("spec",{}).get("containers") or
            record.get("template",{}).get("containers") or [])
env={}
for container in containers:
  for item in container.get("env",[]):
    if item.get("name"): env[item["name"]]=item
def has_secret(name):
  row=env.get(name,{})
  return bool(row.get("valueFrom",{}).get("secretKeyRef") or
              row.get("valueSource",{}).get("secretKeyRef"))
if has_secret("SUPABASE_ACCESS_TOKEN"):
  print("SUPABASE_ACCESS_TOKEN")
flags=(env.get("LOB_LIVE_CHECKS_ENABLED",{}).get("value"),
       env.get("RECORDPATH_ENABLE_LIVE_DISPATCH",{}).get("value"))
if flags==("false","false") and has_secret("LOB_LIVE_API_KEY"):
  print("LOB_LIVE_API_KEY")
PY
)
DEPLOY_SECRET_ARGS=()
if (("${#UNUSED_RUNTIME_SECRET_BINDINGS[@]}" > 0)); then
  joined="$(IFS=,; echo "${UNUSED_RUNTIME_SECRET_BINDINGS[*]}")"
  DEPLOY_SECRET_ARGS+=("--remove-secrets=$joined")
  echo "Excluding unused runtime secret references from the candidate: $joined"
fi

echo "Deploying a tagged new revision at 0% traffic for independent verification..."
gcloud run deploy "$SERVICE" --source . --project "$PROJECT" --region "$REGION" \
  "${DEPLOY_SECRET_ARGS[@]}" --no-traffic --tag "$CANDIDATE_TAG" --quiet
# Cloud Run status can lag the successful deploy response. Retry the
# control-plane read, but NEVER promote unless a single tagged ready revision
# is proven to be distinct from the currently serving one and at 0% traffic.
CANDIDATE_FILE="$SMOKE_DIR/candidate-target"
CANDIDATE=()
for attempt in $(seq 1 12); do
  gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --format=json > "$AFTER"
  if python3 - "$AFTER" "$CANDIDATE_TAG" "$OLD_REV" > "$CANDIDATE_FILE" <<'PY'
import json,sys
with open(sys.argv[1]) as f: record=json.load(f)
status=record.get("status",{})
tag=sys.argv[2];old=sys.argv[3]
traffic=status.get("traffic",[])
active=[t for t in traffic if t.get("percent",0)>0]
matches=[t for t in traffic if t.get("tag")==tag]
if len(active)!=1 or active[0].get("revisionName")!=old or active[0].get("percent")!=100:
  raise SystemExit("Serving revision changed during candidate deploy; refusing promotion")
if len(matches)!=1:
  raise SystemExit("Unique candidate tag unavailable or ambiguous; refusing promotion")
new=matches[0].get("revisionName") or ""
if not new or new==old:
  raise SystemExit("Unique candidate is missing or equals current serving revision")
# Other deployers may change global latestCreated/latestReady pointers. Since
# this tag is unique to the current release, only its bound revision qualifies.
if matches[0].get("percent",0)!=0:
  raise SystemExit("Refusing a candidate already receiving customer traffic")
url=matches[0].get("url","")
if not isinstance(url,str) or not url.startswith("https://") or ".run.app" not in url:
  raise SystemExit("Missing official HTTPS preview URL")
print(new)
print(url)
PY
  then
    mapfile -t CANDIDATE < "$CANDIDATE_FILE"
    break
  fi
  if [ "$attempt" -lt 12 ]; then
    echo "Cloud Run preflight metadata is still propagating ($attempt/12); checking again..."
    sleep 3
  fi
done
if [ "${#CANDIDATE[@]}" -ne 2 ]; then
  echo "Cannot validate preflight revision. Old serving traffic remains unchanged." >&2
  exit 4
fi
NEW_REV="${CANDIDATE[0]}"
URL="${CANDIDATE[1]}"
echo "Verified preflight target revision $NEW_REV at $URL"

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

# Authentication can be unavailable even when static pages return HTTP 200.
# Surface it explicitly without ever logging public keys, tokens or credentials.
report_auth_readiness() {
  local status
  status="$(curl --silent --show-error --max-time 20 --output "$SMOKE_DIR/auth-status.json" \
    --write-out '%{http_code}' "$URL/api/auth/health" || true)"
  if [ "$status" = "200" ]; then
    echo "RecordWatch authentication configuration is present. Google provider must still be verified."
  else
    echo "::warning::RecordWatch email/Google sign-in is not configured in Cloud Run (auth readiness HTTP $status). Verify public Supabase URL + anon key; Google provider and allowed redirects in Supabase."
  fi
}

# Fail closed before exposing paid RecordWatch purchase endpoints.
# A green response requires BOTH the billing key/webhook and the independent
# server-side Supabase migration receipt. Accept live mode only when the
# application reports live_enabled=true; sandbox remains safe for test deploys.
check_recordwatch_readiness() {
  local label="$1"
  local billing_body="$SMOKE_DIR/recordwatch-billing-readiness.json"
  local database_body="$SMOKE_DIR/recordwatch-database-readiness.json"
  echo "Verifying RecordWatch Stripe and entitlement database readiness on $label..."
  if ! curl --fail --location --silent --show-error --max-time 20 \
    --output "$billing_body" "$URL/api/recordwatch/billing-readiness"; then
    echo "::error::RecordWatch Stripe readiness failed on $label. Keeping existing traffic." >&2
    return 1
  fi
  if ! curl --fail --location --silent --show-error --max-time 20 \
    --output "$database_body" "$URL/api/recordwatch/database-readiness"; then
    echo "::error::RecordWatch lifetime migration readiness failed on $label. Keeping existing traffic." >&2
    return 1
  fi
  python3 - "$billing_body" "$database_body" "$label" <<'PY'
import json,sys
try:
  with open(sys.argv[1]) as f: status=json.load(f)
  with open(sys.argv[2]) as f: db=json.load(f)
except (OSError,ValueError):
  print("RecordWatch readiness response is invalid.",file=sys.stderr)
  raise SystemExit(1)
mode=status.get("mode")
if mode not in ("sandbox","live"):
  print("RecordWatch has no valid Stripe mode on",sys.argv[3],file=sys.stderr)
  raise SystemExit(1)
expected={
  "prices_configured":True,
  "webhook_configured":True,
  "secure_database_configured":True,
  "live_enabled": mode=="live",
  "ready":True
}
failed=[k for k,v in expected.items() if status.get(k)!=v]
if db.get("migration_verified") is not True or db.get("ready") is not True:
  failed.append("lifetime_database_migration")
if failed:
  print("RecordWatch not ready on",sys.argv[3],"; mismatched flags:",", ".join(failed),file=sys.stderr)
  raise SystemExit(1)
print("RecordWatch",mode,"billing and lifetime entitlement storage verified on",sys.argv[3])
PY
}

rollback_after_smoke_failure() {
  local reason="$1"
  echo "$reason; reverting traffic to $OLD_REV" >&2
  gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --to-revisions "$OLD_REV=100" --quiet
  exit 5
}

# Test the new tagged revision directly, without routing real visitors to it.
smoke_check "self-search.html" "Find your own court records" "Guided case search" || \
  { echo "Candidate failed smoke check. Production traffic is unchanged." >&2; exit 5; }
smoke_check "pilot-demo.html" "Illustrative demo" "Fictional pilot page" || \
  { echo "Candidate failed smoke check. Production traffic is unchanged." >&2; exit 5; }
smoke_check "js/pilot-demo.js" "DEMO-2006-001" "Fictional pilot script" || \
  { echo "Candidate failed smoke check. Production traffic is unchanged." >&2; exit 5; }

report_auth_readiness
check_recordwatch_readiness "zero-traffic candidate" || { echo "Candidate lacks RecordWatch configuration. Existing traffic is unchanged." >&2; exit 5; }

# Recheck the original serving revision immediately before promotion. If a
# separate deploy changed traffic, abort instead of overriding its release.
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$SMOKE_DIR/promotion-preflight.json"
python3 - "$SMOKE_DIR/promotion-preflight.json" "$OLD_REV" "$NEW_REV" "$CANDIDATE_TAG" <<'PY'
import json,sys
with open(sys.argv[1]) as f: status=json.load(f).get("status",{})
active=[t for t in status.get("traffic",[]) if t.get("percent",0)>0]
candidate=[t for t in status.get("traffic",[]) if t.get("tag")==sys.argv[4]]
if len(active)!=1 or active[0].get("revisionName")!=sys.argv[2] or active[0].get("percent")!=100:
  raise SystemExit("Production traffic changed during validation. Refusing promotion.")
if len(candidate)!=1 or candidate[0].get("revisionName")!=sys.argv[3] or candidate[0].get("percent",0)!=0:
  raise SystemExit("Candidate tag no longer targets the validated zero-traffic revision.")
PY
echo "Promoting validated revision $NEW_REV to 100% customer traffic..."
gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --to-revisions "$NEW_REV=100" --quiet
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --format=json > "$PROMOTED"
python3 - "$PROMOTED" "$NEW_REV" <<'PY' || rollback_after_smoke_failure "Traffic promotion could not be confirmed"
import json,sys
with open(sys.argv[1]) as f: record=json.load(f)
traffic=[t for t in record.get("status",{}).get("traffic",[]) if t.get("percent",0)>0]
if len(traffic)!=1 or traffic[0].get("percent")!=100 or traffic[0].get("revisionName")!=sys.argv[2]:
  raise SystemExit("Customer traffic is not fully assigned to the tested revision")
print("Verified 100% production traffic:",sys.argv[2])
PY

URL="$(python3 - "$PROMOTED" <<'PY'
import json,sys
with open(sys.argv[1]) as f: record=json.load(f)
url=record.get("status",{}).get("url","")
if not url.startswith("https://"):raise SystemExit("Production service URL missing")
print(url)
PY
)" || rollback_after_smoke_failure "Production URL missing"
# Verify the customer-facing URL, not just the bypass-tag URL.
smoke_check "self-search.html" "Find your own court records" "Production guided search" || \
  rollback_after_smoke_failure "Production guided search failed smoke check"
smoke_check "pilot-demo.html" "Illustrative demo" "Production fictional pilot" || \
  rollback_after_smoke_failure "Production pilot failed smoke check"
smoke_check "js/pilot-demo.js" "DEMO-2006-001" "Production pilot script" || \
  rollback_after_smoke_failure "Production pilot script failed smoke check"

report_auth_readiness
check_recordwatch_readiness "promoted production revision" || \
  rollback_after_smoke_failure "Promoted revision failed RecordWatch readiness"

echo "Cloud Run deployed revision $NEW_REV confirmed serving 100% of traffic and passing production smoke checks: $URL"
echo "Public court-record indexing remains OFF until court authorization and status review."
