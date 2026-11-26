#!/usr/bin/env bash
# Run from an authenticated RecordPathAI operator Cloud Shell.
set -euo pipefail
set +x
project=recordpathai-production
url="$(gcloud run services describe recordpathai --region=us-west1 --project="$project" --format='value(status.url)')"
[[ "$url" =~ ^https://[a-zA-Z0-9.-]+\.run\.app$ ]] || { echo "No RecordPathAI Cloud Run URL found."; exit 1; }
ops="$(gcloud secrets versions access latest --secret=recordpath-operations-key --project="$project")"
[[ ${#ops} -ge 32 ]] || { echo "RecordPathAI operator access is required."; exit 1; }
printf 'x-recordpath-operations-key: %s\n' "$ops" | curl --silent --show-error --max-time 40 \
  --header @- -X POST "$url/api/operator/stripe-test-checkout" | python3 -c '
import json,sys,urllib.parse
data=json.load(sys.stdin)
url=data.get("checkoutUrl","")
if data.get("livemode") is not False or urllib.parse.urlsplit(url).hostname!="checkout.stripe.com":
    raise SystemExit(data.get("error","Could not create the RecordPathAI sandbox checkout."))
print("Open your RecordPathAI Stripe test checkout:")
print(url)
'
