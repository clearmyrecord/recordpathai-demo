#!/usr/bin/env bash
# Offline regression: real website content must not trigger rollback just
# because grep finds its marker early in a large curl response.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat > "$TMP/bin/gcloud" <<'MOCK_GCLOUD'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2 $3" in
  "run services describe")
    if [[ " $* " == *" --format=json "* ]]; then
      printf '%s\n' '{"status":{"traffic":[{"percent":100,"revisionName":"recordpathai-known-good"}]}}'
    else
      printf '%s\n' 'https://recordpathai.invalid'
    fi
    ;;
  "run deploy "*)
    echo "Mock deployed new revision."
    ;;
  "run services update-traffic")
    printf '%s\n' "$*" >> "${MOCK_ACTIONS}"
    ;;
  *)
    echo "Unexpected gcloud invocation: $*" >&2
    exit 80
    ;;
esac
MOCK_GCLOUD

cat > "$TMP/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail
output="" url=""
while (( $# )); do
  case "$1" in
    --output|-o) output="$2";shift 2;;
    http*) url="$1";shift;;
    *) shift;;
  esac
done
[[ -n "$output" && "$url" == https://recordpathai.invalid/* ]] || {
  echo "Smoke check must download the entire body to a file" >&2; exit 81;
}
case "$url" in
  */self-search.html) marker="Find your own court records"; page="self-search.html";;
  */pilot-demo.html) marker="Illustrative demo"; page="pilot-demo.html";;
  */js/pilot-demo.js) marker="DEMO-2006-001"; page="pilot-demo.js";;
  *) echo "Unknown mock URL $url" >&2;exit 82;;
esac
if [[ "${MOCK_FAIL_PAGE:-}" == "$page" ]]; then
  marker="no marker in this response"
fi
{
  printf '%s\n' "$marker"
  # Large response makes curl | grep -q unreliable with pipefail/SIGPIPE.
  head -c 524288 /dev/zero | tr '\000' 'A'
} > "$output"
MOCK_CURL
chmod +x "$TMP/bin/gcloud" "$TMP/bin/curl"
cd "$ROOT"
export PATH="$TMP/bin:$PATH"
export MOCK_ACTIONS="$TMP/cloud-run-traffic-actions.log"
: > "$MOCK_ACTIONS"

bash scripts/deploy-existing-cloudrun.sh > "$TMP/healthy.log" 2>&1
if [[ -s "$MOCK_ACTIONS" ]]; then
  echo "Healthy website incorrectly triggered rollback" >&2
  cat "$MOCK_ACTIONS" >&2
  exit 1
fi
grep -q "Cloud Run deployment verified" "$TMP/healthy.log"

set +e
MOCK_FAIL_PAGE=pilot-demo.html bash scripts/deploy-existing-cloudrun.sh > "$TMP/broken.log" 2>&1
rc=$?
set -e
if [[ "$rc" != 5 ]]; then
  echo "A genuinely broken smoke check must exit 5; got $rc" >&2
  cat "$TMP/broken.log" >&2
  exit 1
fi
grep -q 'update-traffic' "$MOCK_ACTIONS"
grep -q 'recordpathai-known-good=100' "$MOCK_ACTIONS"
grep -q 'Fictional pilot page failed smoke check' "$TMP/broken.log"
echo "PASS: large healthy responses succeed; genuine missing markers roll back safely."
