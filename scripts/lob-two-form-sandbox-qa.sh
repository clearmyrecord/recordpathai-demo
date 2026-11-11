#!/usr/bin/env bash
# RecordPathAI: blank two-form-page Lob TEST check. No live checks, no Stripe.
# Never echo or upload your keys; generated check proofs can include bank artwork.
set -euo pipefail
set +x

PROJECT="recordpathai-production"
REGION="us-west1"
SERVICE="recordpathai"
CHECK_URL="https://api.lob.com/v1/checks"
FORM_URL="https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF"
BANK_ID="bank_0cd66461f9b98a8"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
umask 077

for cmd in curl gcloud python3; do
  command -v "$cmd" >/dev/null || { echo "Missing requirement: $cmd"; exit 2; }
done
echo "Downloading official blank Wood County PDF..."
curl --fail --location --silent --show-error --max-time 30 \
  "$FORM_URL" -o "$TMP/original.pdf"

if ! python3 -c "import pypdf" >/dev/null 2>&1; then
  echo "Installing PDF splitter in isolated temporary environment..."
  python3 -m venv "$TMP/venv"
  "$TMP/venv/bin/pip" install --quiet "pypdf>=5,<8"
  PYTHON="$TMP/venv/bin/python"
else
  PYTHON="python3"
fi

"$PYTHON" - "$TMP/original.pdf" "$TMP/two-forms.pdf" <<'PY'
import sys
from pypdf import PdfReader, PdfWriter
source=PdfReader(sys.argv[1])
if len(source.pages)!=4:
    raise SystemExit("Unexpected clerk form version: expected 4 pages. No Lob test created.")
writer=PdfWriter()
for i in (2,3): writer.add_page(source.pages[i])
with open(sys.argv[2],"wb") as f: writer.write(f)
check=PdfReader(sys.argv[2])
if len(check.pages)!=2: raise SystemExit("Form-only PDF is not two pages.")
print("Validated: exactly two official blank form pages extracted.")
PY

OPS="$(gcloud secrets versions access 1 \
  --secret=recordpath-operations-key --project="$PROJECT")"
if [[ "${#OPS}" -lt 32 ]]; then echo "Operator secret missing or invalid"; exit 2; fi

URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --format='value(status.url)')"
if [[ "$URL" != https://*.run.app ]]; then
  echo "Official Cloud Run production service URL unavailable."; exit 2
fi

echo "Submitting blank two-form PDF to the protected Lob TEST route..."
HTTP="$(curl --silent --show-error --max-time 45 \
  --output "$TMP/created.json" --write-out '%{http_code}' \
  -H "x-recordpath-operations-key: $OPS" \
  -H "Content-Type: application/pdf" \
  --data-binary @"$TMP/two-forms.pdf" \
  "$URL/api/operator/lob-test-check-pdf")"
if [[ "$HTTP" != 200 ]]; then
  python3 - "$TMP/created.json" "$HTTP" <<'PY'
import sys,json
try: d=json.load(open(sys.argv[1]))
except Exception: d={}
print("Lob sandbox test NOT successful. HTTP",sys.argv[2])
print("Error:",d.get("error","Unrecognized response"))
print("Lob code:",d.get("code","Unavailable"))
PY
  exit 1
fi

CHECK_ID="$(python3 - "$TMP/created.json" <<'PY'
import json,sys,re
d=json.load(open(sys.argv[1]))
s=d.get("testCheckId","")
if d.get("ok") is not True or not re.fullmatch(r"chk_[a-zA-Z0-9]+",s):
    raise SystemExit("Lob did not return a valid TEST check id.")
print(s)
PY
)"
echo "Lob sandbox check created: $CHECK_ID"

for i in $(seq 1 20); do
  HTTP="$(curl --silent --show-error --max-time 30 \
    --output "$TMP/status.json" --write-out '%{http_code}' \
    -H "x-recordpath-operations-key: $OPS" \
    "$URL/api/operator/lob-test-check-status?check_id=$CHECK_ID")"
  if [[ "$HTTP" != 200 ]]; then
    echo "Sandbox proof status HTTP $HTTP; check Lob dashboard."; exit 1
  fi
  STATE="$(python3 - "$TMP/status.json" <<'PY'
import sys,json
r=json.load(open(sys.argv[1]))
print(r.get("renderStatus","unknown"))
PY
)"
  if [[ "$STATE" == rendered ]]; then break; fi
  if [[ "$STATE" == failed ]]; then echo "Lob sandbox rendering failed."; exit 1; fi
  sleep 3
done
if [[ "$STATE" != rendered ]]; then
  echo "Sandbox check was created but proof is not rendered yet."
  echo "Check ID: $CHECK_ID"
  exit 1
fi
unset OPS

OUT="$HOME/recordpathai-two-form-test-proof.pdf"
"$PYTHON" - "$TMP/status.json" "$OUT" <<'PY'
import sys,json,urllib.request,urllib.parse,os
from pypdf import PdfReader
data=json.load(open(sys.argv[1]))
url=data.get("proofPdfUrl","")
host=urllib.parse.urlsplit(url)
if host.scheme!="https" or host.hostname!="lob-assets.com":
    raise SystemExit("Untrusted Lob proof URL; download not attempted.")
with urllib.request.urlopen(url,timeout=30) as response:
    file=response.read(15000001)
if len(file)>15000000 or not file.startswith(b"%PDF-"):
    raise SystemExit("Invalid proof PDF.")
with open(sys.argv[2],"wb") as out:out.write(file)
os.chmod(sys.argv[2],0o600)
proof=PdfReader(sys.argv[2])
def norm(text):
    value="".join(chr(ord(ch)-0xF000) if 0xF000<=ord(ch)<=0xF0FF else ch for ch in (text or ""))
    return "".join(ch for ch in value.upper() if ch.isalpha())
ok=(len(proof.pages)==4 and
    "ADDRESSVERIFICATION" in norm(proof.pages[2].extract_text()) and
    "APPLICATIONTOSEALRECORD" in norm(proof.pages[3].extract_text()))
print("Lob rendering:", data.get("renderStatus"))
print("Proof pages:",len(proof.pages))
print("Exactly two form attachment pages:",ok)
print("Proof saved privately:",sys.argv[2])
if not ok:raise SystemExit("WARNING: Proof contents differ from the expected 2 forms.")
PY
echo "SUCCESS: Lob TEST check + the two blank Wood County form pages."
echo "No live check, charge, or real mailing was triggered."
