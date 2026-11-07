// Research-only Ohio docket discovery. Public county metadata; never court records,
// individual names, payment, eligibility decisions, or authorized source promotion.
export const COUNTY_TOTAL=88;
export const RESEARCH_TARGET_TOTAL=87;
export const OFFICIAL_COURT_DIRECTORY=
  "https://www.supremecourt.ohio.gov/courts/judicial-system/ohio-trial-courts/";
export function validateOhioRoster(roster){
  if(!Array.isArray(roster)||roster.length!==COUNTY_TOTAL)
    throw Error("Ohio roster must contain exactly 88 counties");
  const names=new Set(),slugs=new Set();
  for(const c of roster){
    if(c?.state!=="OH"||typeof c.county!=="string"||typeof c.slug!=="string"||
       !/^[a-z]+(?:-[a-z]+)*$/.test(c.slug)||
       names.has(c.county.toLowerCase())||slugs.has(c.slug))
      throw Error("Invalid or duplicate Ohio county");
    names.add(c.county.toLowerCase());slugs.add(c.slug);
  }
  if(!slugs.has("wood")||slugs.size!==COUNTY_TOTAL)
    throw Error("Wood County must be in the 88-county roster");
  return roster.filter(c=>c.slug!=="wood");
}
export function readOhioLedger(value){
  const input=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  return {
    schemaVersion:"recordpathai.ohio-court-discovery.v1",
    counties:input.counties&&typeof input.counties==="object"&&!Array.isArray(input.counties)
      ?{...input.counties}:{},
    candidates:Array.isArray(input.candidates)?[...input.candidates]:[],
    updatedAt:input.updatedAt||null
  };
}
export function selectOhioCounties(roster,ledgerRaw,{limit=10,asOf=new Date().toISOString().slice(0,10),cooldownDays=45}={}){
  if(!Number.isInteger(limit)||limit<1||limit>15)throw Error("Ohio agent limit must be 1–15");
  const targets=validateOhioRoster(roster);
  const ledger=readOhioLedger(ledgerRaw);
  const now=Date.parse(asOf+"T00:00:00Z");
  if(!Number.isFinite(now))throw Error("Invalid planning date");
  const priority={tier1:0,tier2:1,tier3:2};
  return targets.filter(c=>{
    const latest=ledger.counties[c.slug]?.searchedAt;
    const at=latest?Date.parse(latest):NaN;
    return !Number.isFinite(at)||now-at>=cooldownDays*86400000;
  }).sort((a,b)=>{
    const seenA=Boolean(ledger.counties[a.slug]?.searchedAt);
    const seenB=Boolean(ledger.counties[b.slug]?.searchedAt);
    return Number(seenA)-Number(seenB)||
      (priority[a.tier]??9)-(priority[b.tier]??9)||
      a.county.localeCompare(b.county);
  }).slice(0,limit);
}
export function cleanHttps(input){
  const u=new URL(String(input||""));
  if(u.protocol!=="https:"||u.username||u.password||u.hostname.length>253||
    /\s/.test(u.hostname))throw Error("Only public HTTPS links allowed");
  u.hash="";
  for(const k of [...u.searchParams.keys()])
    if(/^(utm_|fbclid|gclid|ref$)/i.test(k))u.searchParams.delete(k);
  return u.toString();
}
export function mergeOhioResearch(ledgerRaw,output,{asOf=new Date().toISOString()}={}){
  if(output?.schemaVersion!=="recordpathai.ohio-county-agent-output.v1"||
     !Array.isArray(output.attempts)||!Array.isArray(output.candidates))
    throw Error("Invalid Ohio research output");
  const ledger=readOhioLedger(ledgerRaw);
  const seen=new Set();
  for(const a of output.attempts){
    if(!a||typeof a.slug!=="string"||a.slug==="wood"||seen.has(a.slug)||
      !["searched_no_candidate","candidate_found"].includes(a.status))
      throw Error("Invalid Ohio county attempt");
    seen.add(a.slug);
    const old=ledger.counties[a.slug]||{};
    ledger.counties[a.slug]={
      county:a.county,status:a.status,searchedAt:a.searchedAt,
      searches:(old.searches||0)+Math.min(2,Math.max(0,a.searches||0)),
      attempts:(old.attempts||0)+1,
      approved:false
    };
  }
  const candidates=new Map(ledger.candidates.filter(c=>c?.id).map(c=>[c.id,c]));
  for(const c of output.candidates){
    if(!seen.has(c.slug)||!c.url)throw Error("Candidate missing searched county");
    const url=cleanHttps(c.url);
    const id=c.slug+"|"+url;
    candidates.set(id,{
      id,slug:c.slug,county:c.county,url,title:String(c.title||"").slice(0,180),
      discoveredAt:c.discoveredAt,source:"public_web_search",
      status:"unverified_candidate",verified:false,approved:false,
      note:"Confirm official court identity, correct division and actual public docket before publishing."
    });
  }
  ledger.candidates=[...candidates.values()].sort((a,b)=>a.id.localeCompare(b.id));
  ledger.updatedAt=asOf;
  return ledger;
}
export function coverage(roster,ledgerRaw){
  const targets=validateOhioRoster(roster);
  const ledger=readOhioLedger(ledgerRaw);
  return {totalCounties:88,woodPilot:1,assignedResearch:targets.length,
    attempted:targets.filter(c=>Boolean(ledger.counties[c.slug]?.searchedAt)).length,
    pending:targets.filter(c=>!ledger.counties[c.slug]?.searchedAt).length,
    unverifiedLeads:ledger.candidates.filter(c=>c.status==="unverified_candidate").length,
    approvedDirectLinks:0};
}
