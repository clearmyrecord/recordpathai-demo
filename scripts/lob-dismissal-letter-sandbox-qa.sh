#!/usr/bin/env bash
# TEST only: no live letter, court check, customer data or payment.
set -euo pipefail
set +x
umask 077
PROJECT="${GCP_PROJECT_ID:-recordpathai-production}"
REGION="${CLOUD_RUN_REGION:-us-west1}"
SERVICE="${CLOUD_RUN_SERVICE:-recordpathai}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
python3 -m venv "$TMP/venv"
"$TMP/venv/bin/pip" install --quiet 'pypdf>=5,<8'
"$TMP/venv/bin/python" - "$TMP/two.pdf" <<'PY'
import sys
from pypdf import PdfReader, PdfWriter
src=PdfReader("assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf")
if len(src.pages)!=4: raise SystemExit("Unexpected official source page count")
out=PdfWriter()
for i in (2,3): out.add_page(src.pages[i])
with open(sys.argv[1],"wb") as f: out.write(f)
PY
OPS="$(gcloud secrets versions access latest --secret=recordpath-operations-key --project="$PROJECT")"
if [[ "${#OPS}" -lt 32 ]]; then echo "Operator secret missing"; exit 2; fi
URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
[[ "$URL" == https://*.run.app ]] || { echo "Unexpected Cloud Run URL"; exit 2; }
HTTP="$(curl --silent --show-error --max-time 45 --output "$TMP/result.json" --write-out '%{http_code}' -H "x-recordpath-operations-key: $OPS" -H 'Content-Type: application/pdf' --data-binary @"$TMP/two.pdf" "$URL/api/operator/lob-test-dismissal-letter-pdf")"
unset OPS
"$TMP/venv/bin/python" - "$TMP/result.json" "$HTTP" <<'PY'
import sys,json,re,urllib.parse,urllib.request,time,io
from pypdf import PdfReader
try: d=json.load(open(sys.argv[1]))
except Exception: d={}
if sys.argv[2]!="200" or d.get("ok") is not True:
    print("TEST letter failed: HTTP",sys.argv[2],"Lob HTTP",d.get("lobStatus"),"code",d.get("code"),"request ID",d.get("requestId"))
    raise SystemExit(1)
id=d.get("testLetterId","")
url=d.get("proofPdfUrl") or ""
if d.get("environment")!="test" or d.get("courtFeeCents")!=0 or d.get("formPages")!=2 or not re.fullmatch(r"ltr_[A-Za-z0-9]+",id):
    raise SystemExit("Unexpected test letter response")
print("Sandbox letter accepted:",id)
u=urllib.parse.urlsplit(url)
if u.scheme!="https" or u.hostname!="lob-assets.com" or u.port or u.username or u.password or u.fragment or u.path!="/letters/"+id+".pdf":
    raise SystemExit("Proof URL missing or untrusted; inspect the TEST letter in Lob dashboard")
def norm(t):
    t="".join(chr(ord(c)-0xf000) if 0xf000<=ord(c)<=0xf0ff else c for c in (t or ""))
    return "".join(c for c in t.upper() if c.isalnum())
for i in range(12):
    try:
        with urllib.request.urlopen(url,timeout=15) as r:
            if r.geturl()!=url: raise ValueError("Redirected proof")
            b=r.read(12000001)
        if len(b)>12000000 or not b.startswith(b"%PDF-"): raise ValueError("Invalid proof")
        p=PdfReader(io.BytesIO(b))
        if len(p.pages)!=3: raise ValueError("Expected postal cover and two form pages")
        first,second=[norm(p.pages[i].extract_text()) for i in (1,2)]
        if "ADDRESSVERIFICATION" not in first or "APPLICATIONTOSEALRECORD" not in second or not any(k in second for k in ("DISMISS","NOTGUILTY","295333")):
            raise ValueError("Incorrect official form headings")
        print("TEST proof verified: postal cover plus two dismissal form pages, zero court fee.")
        break
    except Exception:
        if i==11: raise SystemExit("Letter accepted but actual rendered proof could not be verified")
        time.sleep(5)
PY
echo "Live mailing remains disabled; this test is not authorization to dispatch."
