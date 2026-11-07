#!/usr/bin/env python3
"""Reproducible, public-only Wave 1 county roster from the 2026 U.S. Census Gazetteer.
No court records, web-scraped people, credentials, or guessed courthouse addresses.
"""
import argparse, csv, hashlib, io, json, re, urllib.request, zipfile
from collections import Counter
from pathlib import Path

SOURCE = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip"
STATE_NAMES = {"NV":"Nevada","TX":"Texas","FL":"Florida","AZ":"Arizona","GA":"Georgia"}
COUNTS = {"NV":17,"TX":254,"FL":67,"AZ":15,"GA":159}
ROUTES = {
    "NV":"court_record_sealing", "TX":"expunction_or_nondisclosure",
    "FL":"fdle_certificate_then_court_petition",
    "AZ":"arizona_record_sealing", "GA":"agency_prosecutor_record_restriction"
}
ROOT = Path(__file__).resolve().parents[1]
def slugify(v):
    return re.sub(r"^-|-$","",re.sub(r"[^a-z0-9]+","-",v.lower()))
def load_census_bytes(source=SOURCE):
    if not source.startswith("https://www2.census.gov/"):
        raise ValueError("Only the official Census source is accepted")
    request=urllib.request.Request(source,headers={"User-Agent":"RecordPathAI-Census-Catalog/1.0"})
    with urllib.request.urlopen(request,timeout=45) as response:
        body=response.read(5_000_001)
    if len(body)>5_000_000 or not body.startswith(b"PK"):
        raise ValueError("Invalid or oversized Census county archive")
    return body
def normalize_name(name):
    name=name.strip()
    return re.sub(r" County$","",name)
def build_catalog(archive, seeds):
    archive_sha=hashlib.sha256(archive).hexdigest()
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        files=[n for n in z.namelist() if n.endswith(".txt") and "/" not in n]
        if len(files)!=1: raise ValueError("Unexpected Census Gazetteer files")
        text=z.read(files[0]).decode("utf-8-sig")
    first_line=text.splitlines()[0]
    separator="|" if "|" in first_line else "\t"
    reader=csv.DictReader(io.StringIO(text),delimiter=separator)
    reader.fieldnames=[n.strip().lstrip("\ufeff") for n in (reader.fieldnames or [])]
    if not {"USPS","GEOID","NAME"}.issubset(set(reader.fieldnames or [])):
        raise ValueError("Census county layout unexpectedly changed; header="+repr(reader.fieldnames[:15]))
    seed_index={(s["state"],s["countySlug"]):s for s in seeds}
    if len(seed_index)!=len(seeds):
        raise ValueError("Duplicate curated seed")
    result=[]
    seen=set()
    for row in reader:
        state=row["USPS"].strip()
        if state not in STATE_NAMES:continue
        geoid=row["GEOID"].strip()
        name=normalize_name(row["NAME"])
        if not re.fullmatch(r"\d{5}",geoid):
            raise ValueError("Invalid Census FIPS")
        key=(state,slugify(name))
        if key in seen:raise ValueError("Duplicate state/county "+str(key))
        seen.add(key)
        curated=seed_index.get(key,{})
        item={
            "state":state,"stateName":STATE_NAMES[state],"county":name,
            "countySlug":slugify(name),"countyFips":geoid,
            "countyEquivalentType":"independent_city" if name=="Carson City" and state=="NV" else "county",
            "courtName":curated.get("courtName",""),
            "courtType":curated.get("courtType","unverified"),
            "formsPage":curated.get("formsPage",""),
            "routeHint":curated.get("routeHint",ROUTES[state]),
            "status":curated.get("status","county_unresearched"),
            "priority":"seeded" if curated else "unassigned",
            "officialCourtVerified":False,
            "notes":curated.get("notes","")
        }
        result.append(item)
    c=Counter(x["state"] for x in result)
    if dict(c)!=COUNTS:raise ValueError(f"County count mismatch {dict(c)} != {COUNTS}")
    if len(result)!=512:raise ValueError("Wrong Wave 1 total")
    if any(s not in seen for s in seed_index):raise ValueError("Curated county not found in Census "+str(set(seed_index)-seen))
    result.sort(key=lambda x:(list(STATE_NAMES).index(x["state"]),0 if x["priority"]=="seeded" else 1,x["countyFips"]))
    metadata={
        "dataset":"2026 Census Gazetteer National Counties",
        "source":SOURCE,"sourceSha256":archive_sha,
        "stateCounts":dict(c),"totalCountyEquivalents":len(result),
        "note":"Coverage catalog only. Does not establish official courts, form rules, eligibility or filing readiness."
    }
    return result,metadata
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--seeds",default=str(ROOT/"data/wave1-court-seeds.json"))
    p.add_argument("--output",default=str(ROOT/"data/wave1-court-catalog.json"))
    p.add_argument("--provenance",default=str(ROOT/"data/wave1-county-provenance.json"))
    args=p.parse_args()
    seeds=json.loads(Path(args.seeds).read_text())
    rows,meta=build_catalog(load_census_bytes(),seeds)
    Path(args.output).write_text(json.dumps(rows,ensure_ascii=False,indent=2)+"\n")
    Path(args.provenance).write_text(json.dumps(meta,indent=2)+"\n")
    print(f"Generated {len(rows)} public Wave 1 county equivalents: {meta['stateCounts']}")
if __name__=="__main__":main()
