// Wave 1 county coordinator: pure, public-metadata-only. Nothing here approves filings.
import { createHash } from "node:crypto";

export const EXPECTED_COUNTS=Object.freeze({NV:17,TX:254,FL:67,AZ:15,GA:159});
export const REVIEW_STAGES=Object.freeze([
  "county_unresearched", "searched_no_candidate", "source_candidate_found",
  "source_verified", "form_downloaded", "mapping_draft",
  "mapping_reviewed", "legal_route_verified", "filing_ready"
]);
export const AUTOMATED_STAGES=new Set(["searched_no_candidate","source_candidate_found"]);
export const MAX_PER_STATE=15, MAX_QUERIES_PER_COUNTY=2;
const SHA=/^[0-9]{5}$/;
export function validateCatalog(catalog){
  if(!Array.isArray(catalog)||catalog.length!==512)throw Error("Wave 1 requires 512 verified Census county equivalents");
  const seen=new Set(),counts=Object.fromEntries(Object.keys(EXPECTED_COUNTS).map(x=>[x,0]));
  for(const c of catalog){
    if(!c||!(c.state in counts)||!SHA.test(c.countyFips||"")||!c.county||!c.countySlug)
      throw Error("Invalid Census county record");
    if(seen.has(c.countyFips))throw Error("Duplicate county FIPS");
    seen.add(c.countyFips);counts[c.state]++;
  }
  for(const [state,count] of Object.entries(EXPECTED_COUNTS)){
    if(counts[state]!==count)throw Error("Incorrect "+state+" count "+counts[state]);
  }
  return counts;
}
export function readLedger(raw){
  const obj=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const counties=obj.counties&&typeof obj.counties==="object"&&!Array.isArray(obj.counties)
    ?obj.counties:{};
  const sources=Array.isArray(obj.sources)?obj.sources:[];
  return {schemaVersion:"recordpathai.wave1-discovery.v1",counties:{...counties},
    sources:[...sources],updatedAt:obj.updatedAt||null};
}
export function chooseCounties(catalog,ledger,{state,limit=5,asOf="2026-11-07",cooldownDays=45}={}){
  validateCatalog(catalog);
  if(!(state in EXPECTED_COUNTS)||!Number.isInteger(limit)||limit<1||limit>MAX_PER_STATE)
    throw Error("Invalid state or limit");
  const now=Date.parse(asOf+"T00:00:00Z");
  if(!Number.isFinite(now))throw Error("Invalid review date");
  const rows=catalog.filter(c=>c.state===state).filter(c=>{
    const last=ledger?.counties?.[c.countyFips]?.lastSearchedAt;
    const date=last?Date.parse(last):NaN;
    return !Number.isFinite(date)||(now-date)>=cooldownDays*86400000;
  });
  // Curated county leads first; otherwise attempt previously unsearched counties
  // before returning to stale searches. Order is stable by Census FIPS.
  rows.sort((a,b)=>{
    const x=ledger?.counties?.[a.countyFips],y=ledger?.counties?.[b.countyFips];
    return Number(Boolean(x))-Number(Boolean(y)) ||
      (a.priority==="seeded"?0:1)-(b.priority==="seeded"?0:1) ||
      a.countyFips.localeCompare(b.countyFips);
  });
  return rows.slice(0,limit);
}
export function canonicalSource(url){
  const u=new URL(String(url||""));
  if(!["https:"].includes(u.protocol)||u.username||u.password||u.hostname.length>253)
    throw Error("Source must use ordinary HTTPS");
  u.hash="";u.hostname=u.hostname.toLowerCase();
  u.searchParams.forEach((_,key)=>{if(/^utm_|^fbclid$|^gclid$|^ref$/i.test(key))u.searchParams.delete(key);});
  return u.toString();
}
export function idForSource(url,formType){
  return createHash("sha256").update(canonicalSource(url)+"|"+String(formType||"unknown")).digest("hex").slice(0,20);
}
export function mergeAgentOutput(ledgerRaw,outputs,{asOf=new Date().toISOString()}={}){
  const ledger=readLedger(ledgerRaw);
  const sourceById=new Map(ledger.sources.map(s=>[s.id,{...s,counties:[...new Set(s.counties||[])]}]));
  const attempted=new Set();
  for(const output of outputs){
    if(!output||!Array.isArray(output.attempts)||!["NV","TX","FL","AZ","GA"].includes(output.state))
      throw Error("Invalid state agent output");
    for(const attempt of output.attempts){
      if(!SHA.test(attempt.countyFips)||attempt.state!==output.state||attempted.has(attempt.countyFips))
        throw Error("Malformed or duplicated county attempt");
      attempted.add(attempt.countyFips);
      if(!AUTOMATED_STAGES.has(attempt.status))throw Error("Agent cannot approve sources, maps or legal filing");
      const old=ledger.counties[attempt.countyFips]||{};
      if(REVIEW_STAGES.indexOf(old.status)>REVIEW_STAGES.indexOf("source_candidate_found"))continue;
      ledger.counties[attempt.countyFips]={
        state:attempt.state,county:attempt.county,
        status:attempt.status,
        attempts:(old.attempts||0)+1,lastSearchedAt:attempt.searchedAt,
        candidateIds:[...new Set([...(old.candidateIds||[]),...(attempt.candidateIds||[])])].slice(0,20),
        searchQueries:Math.max(0,Math.min(2,attempt.searchQueries||0))
      };
    }
    for(const candidate of output.candidates||[]){
      const safeUrl=canonicalSource(candidate.url);
      const id=idForSource(safeUrl,candidate.formType);
      if(id!==candidate.id)throw Error("Candidate ID mismatch");
      const current=sourceById.get(id);
      if(current){
        current.counties=[...new Set([...current.counties,...candidate.counties])].sort();
      }else{
        sourceById.set(id,{
          id,sourceUrl:safeUrl,formType:String(candidate.formType||"unknown").slice(0,70),
          title:String(candidate.title||"").slice(0,180),
          counties:[...new Set(candidate.counties)].sort(),
          discoveredAt:candidate.discoveredAt,
          status:"source_verification_required",
          approved:false,mapped:false,active:false,
          notes:"Unverified search lead; verify court authority, current form, and legal route."
        });
      }
    }
  }
  ledger.sources=[...sourceById.values()].sort((a,b)=>a.id.localeCompare(b.id));
  ledger.updatedAt=asOf;
  return ledger;
}
export function coverageReport(catalog,ledgerRaw){
  const counts=validateCatalog(catalog),ledger=readLedger(ledgerRaw);
  return {
    total:512,states:Object.fromEntries(Object.keys(counts).map(state=>{
      const rows=catalog.filter(c=>c.state===state);
      const statuses={};
      for(const c of rows){
        const key=ledger.counties[c.countyFips]?.status||"county_unresearched";
        statuses[key]=(statuses[key]||0)+1;
      }
      return [state,{total:counts[state],statuses,
        attempted:rows.filter(c=>Boolean(ledger.counties[c.countyFips])).length}];
    })),
    distinctSourceLeads:ledger.sources.length,
    sourceVerificationRequired:ledger.sources.filter(c=>c.status==="source_verification_required").length,
    filingReady:0 // Automated discovery alone never certifies legal/file readiness.
  };
}
