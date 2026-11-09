#!/usr/bin/env bash
# Exercise tagged Cloud Run candidate, traffic promotion, and rollback with
# offline fake gcloud/curl. A green run MUST mean the new revision serves 100%.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"

cat > "$TMP/bin/gcloud" <<'MOCK_GCLOUD'
#!/usr/bin/env bash
set -Eeuo pipefail
state="$(cat "$MOCK_STATE")"
case "$1 $2 $3" in
  "run services describe")
    [[ " $* " == *" --format=json "* ]] || { echo "Unexpected describe format" >&2;exit 80; }
    if [[ "$state" == initial ]]; then
      printf '%s\n' '{"status":{"url":"https://recordpathai-abc-uw.a.run.app","traffic":[{"revisionName":"recordpathai-old","percent":100}]}}'
    elif [[ "$state" == deployed ]]; then
      printf '%s\n' '{"status":{"url":"https://recordpathai-abc-uw.a.run.app","latestCreatedRevisionName":"recordpathai-new","latestReadyRevisionName":"recordpathai-new","traffic":[{"revisionName":"recordpathai-old","percent":100},{"revisionName":"recordpathai-new","percent":0,"tag":"recordpathai-preview","url":"https://recordpathai-preview---recordpathai-abc-uw.a.run.app"}]}}'
    elif [[ "$state" == promoted ]]; then
      printf '%s\n' '{"status":{"url":"https://recordpathai-abc-uw.a.run.app","latestCreatedRevisionName":"recordpathai-new","latestReadyRevisionName":"recordpathai-new","traffic":[{"revisionName":"recordpathai-new","percent":100},{"revisionName":"recordpathai-new","percent":0,"tag":"recordpathai-preview","url":"https://recordpathai-preview---recordpathai-abc-uw.a.run.app"}]}}'
    else
      echo "Unexpected describe after rollback" >&2
      exit 81
    fi
    ;;
  "run deploy "*)
    [[ " $* " == *" --no-traffic "* && " $* " == *" --tag recordpathai-preview "* ]] || {
      echo "New revision must deploy tagged at 0% traffic" >&2;exit 82;
    }
    echo deployed > "$MOCK_STATE"
    ;;
  "run services update-traffic")
    printf '%s\n' "$*" >> "$MOCK_ACTIONS"
    if [[ " $* " == *"recordpathai-new=100"* ]]; then
      echo promoted > "$MOCK_STATE"
    elif [[ " $* " == *"recordpathai-old=100"* ]]; then
      echo rolledback > "$MOCK_STATE"
    else
      echo "Unexpected traffic allocation" >&2; exit 83
    fi
    ;;
  *)
    echo "Unexpected gcloud: $*" >&2;exit 84;;
esac
MOCK_GCLOUD

cat > "$TMP/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
output="" url=""
while (( $# )); do
  case "$1" in
    --output|-o) output="$2";shift 2;;
    https://*)url="$1";shift;;
    *)shift;;
  esac
done
[[ -n "$output" ]] || { echo "Expected full response to file" >&2;exit 80; }
case "$url" in
  */api/recordwatch/billing-readiness)
    case "$url" in
      https://recordpathai-preview---recordpathai-abc-uw.a.run.app/*)
        failed="${MOCK_FAIL_STAGE:-}" ;;
      https://recordpathai-abc-uw.a.run.app/*)
        failed="${MOCK_FAIL_PRODUCTION:-}" ;;
      *) echo "Unexpected billing URL" >&2; exit 82 ;;
    esac
    if [[ "$failed" == recordwatch-billing ]]; then
      printf '%s\n' '{"mode":"unconfigured","prices_configured":false,"webhook_configured":false,"secure_database_configured":false,"live_enabled":false,"ready":false}' > "$output"
    elif [[ "${MOCK_RECORDWATCH_MODE:-sandbox}" == live ]]; then
      printf '%s\n' '{"mode":"live","prices_configured":true,"webhook_configured":true,"secure_database_configured":true,"live_enabled":true,"ready":true}' > "$output"
    else
      printf '%s\n' '{"mode":"sandbox","prices_configured":true,"webhook_configured":true,"secure_database_configured":true,"live_enabled":false,"ready":true}' > "$output"
    fi
    exit 0 ;;
  */api/recordwatch/database-readiness)
    case "$url" in
      https://recordpathai-preview---recordpathai-abc-uw.a.run.app/*)
        failed="${MOCK_FAIL_STAGE:-}" ;;
      https://recordpathai-abc-uw.a.run.app/*)
        failed="${MOCK_FAIL_PRODUCTION:-}" ;;
      *) echo "Unexpected lifetime migration URL" >&2; exit 82 ;;
    esac
    if [[ "$failed" == recordwatch-database ]]; then
      printf '%s\n' '{"migration_verified":false,"ready":false}' > "$output"
    else
      printf '%s\n' '{"migration_verified":true,"ready":true}' > "$output"
    fi
    exit 0 ;;
  */self-search.html)marker="Find your own court records";page="self-search.html";;
  */pilot-demo.html)marker="Illustrative demo";page="pilot-demo.html";;
  */js/pilot-demo.js)marker="DEMO-2006-001";page="pilot-demo.js";;
  *)echo "Unknown requested path $url" >&2;exit 81;;
esac
case "$url" in
  https://recordpathai-preview---recordpathai-abc-uw.a.run.app/*)
    if [[ "${MOCK_FAIL_STAGE:-}" == "$page" ]];then marker="page missing verification marker";fi
    ;;
  https://recordpathai-abc-uw.a.run.app/*)
    if [[ "${MOCK_FAIL_PRODUCTION:-}" == "$page" ]];then marker="page missing verification marker";fi
    ;;
  *)echo "Not a permitted local mock host" >&2;exit 82;;
esac
{
 printf '%s\n' "$marker"
 head -c 524288 /dev/zero | tr '\000' 'A'
} > "$output"
MOCK_CURL
chmod +x "$TMP/bin/gcloud" "$TMP/bin/curl"
cd "$ROOT"
export PATH="$TMP/bin:$PATH"
export MOCK_STATE="$TMP/state"
export MOCK_ACTIONS="$TMP/traffic-actions"

setup_case() {
 echo initial > "$MOCK_STATE"
 : > "$MOCK_ACTIONS"
}

setup_case
bash scripts/deploy-existing-cloudrun.sh > "$TMP/healthy.log" 2>&1 || {
 cat "$TMP/healthy.log" >&2
 echo "Healthy revision incorrectly failed" >&2
 exit 1
}
grep -qF "recordpathai-new=100" "$MOCK_ACTIONS"
! grep -qF "recordpathai-old=100" "$MOCK_ACTIONS"
grep -qF "confirmed serving 100% of traffic" "$TMP/healthy.log"
[[ "$(cat "$MOCK_STATE")" == promoted ]]

setup_case
set +e
MOCK_FAIL_STAGE=pilot-demo.html bash scripts/deploy-existing-cloudrun.sh > "$TMP/stage-broken.log" 2>&1
rc=$?
set -e
[[ "$rc" == 5 ]] || { echo "Bad candidate must fail safely (got $rc)" >&2;cat "$TMP/stage-broken.log" >&2;exit 1; }
[[ ! -s "$MOCK_ACTIONS" ]] || { echo "Never change traffic on preflight failure" >&2;exit 1; }
[[ "$(cat "$MOCK_STATE")" == deployed ]]

setup_case
set +e
MOCK_FAIL_PRODUCTION=pilot-demo.html bash scripts/deploy-existing-cloudrun.sh > "$TMP/prod-broken.log" 2>&1
rc=$?
set -e
[[ "$rc" == 5 ]] || { echo "Broken public endpoint must roll back (got $rc)" >&2;cat "$TMP/prod-broken.log" >&2;exit 1; }
grep -qF 'recordpathai-new=100' "$MOCK_ACTIONS"
grep -qF 'recordpathai-old=100' "$MOCK_ACTIONS"
[[ "$(cat "$MOCK_STATE")" == rolledback ]]

setup_case
set +e
MOCK_FAIL_STAGE=recordwatch-billing bash scripts/deploy-existing-cloudrun.sh > "$TMP/billing-candidate-broken.log" 2>&1
rc=$?
set -e
[[ "$rc" == 5 ]] || { echo "Unconfigured RecordWatch candidate must fail safely (got $rc)" >&2;cat "$TMP/billing-candidate-broken.log" >&2;exit 1; }
[[ ! -s "$MOCK_ACTIONS" ]] || { echo "Never route traffic to unconfigured RecordWatch" >&2;exit 1; }
[[ "$(cat "$MOCK_STATE")" == deployed ]]

setup_case
set +e
MOCK_FAIL_PRODUCTION=recordwatch-billing bash scripts/deploy-existing-cloudrun.sh > "$TMP/billing-production-broken.log" 2>&1
rc=$?
set -e
[[ "$rc" == 5 ]] || { echo "Unconfigured public RecordWatch endpoint must roll back (got $rc)" >&2;cat "$TMP/billing-production-broken.log" >&2;exit 1; }
grep -qF 'recordpathai-new=100' "$MOCK_ACTIONS"
grep -qF 'recordpathai-old=100' "$MOCK_ACTIONS"
[[ "$(cat "$MOCK_STATE")" == rolledback ]]

setup_case
MOCK_RECORDWATCH_MODE=live bash scripts/deploy-existing-cloudrun.sh > "$TMP/live-healthy.log" 2>&1 || {
  cat "$TMP/live-healthy.log" >&2
  echo "Valid live Stripe setup should deploy successfully" >&2
  exit 1
}
grep -qF "recordpathai-new=100" "$MOCK_ACTIONS"
grep -qF "RecordWatch live billing and lifetime entitlement storage verified" "$TMP/live-healthy.log"

setup_case
set +e
MOCK_FAIL_STAGE=recordwatch-database bash scripts/deploy-existing-cloudrun.sh > "$TMP/database-candidate-broken.log" 2>&1
rc=$?
set -e
[[ "$rc" == 5 ]] || { echo "Unmigrated case-entitlement candidate must fail safely (got $rc)" >&2;cat "$TMP/database-candidate-broken.log" >&2;exit 1; }
[[ ! -s "$MOCK_ACTIONS" ]] || { echo "Never send traffic to an unmigrated RecordWatch database" >&2;exit 1; }

setup_case
set +e
MOCK_FAIL_PRODUCTION=recordwatch-database bash scripts/deploy-existing-cloudrun.sh > "$TMP/database-production-broken.log" 2>&1
rc=$?
set -e
[[ "$rc" == 5 ]] || { echo "Unmigrated production case entitlement must trigger rollback (got $rc)" >&2;cat "$TMP/database-production-broken.log" >&2;exit 1; }
grep -qF 'recordpathai-old=100' "$MOCK_ACTIONS"
[[ "$(cat "$MOCK_STATE")" == rolledback ]]

echo "PASS: tagged candidate tested with zero traffic, healthy revision promoted, and errors roll back."
