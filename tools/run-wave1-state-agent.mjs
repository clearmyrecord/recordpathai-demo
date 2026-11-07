#!/usr/bin/env node
// Bounded Wave 1 research worker. Only public government-form leads, never case records.
// No requests without explicit environment opt-in plus the search API key.
import fs from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoveryQueries } from "./form-query-builder.mjs";
import { scoreFormCandidate } from "./form-source-scorer.js";
import { chooseCounties,readLedger,canonicalSource,idForSource,MAX_PER_STATE } from "./wave1-agent-core.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const options=Object.fromEntries(process.argv.slice(2).filter(x=>/^--[^=]+=/.test(x)).map(x=>{
  const i=x.indexOf("=");return [x.slice(2,i),x.slice(i+1)];
}));
const state=options.state||"NV";
const limit=Number(options.limit||5);
const queriesPerCounty=Number(options.queries||1);
if(!Number.isInteger(limit)||limit<1||limit>MAX_PER_STATE||
   !Number.isInteger(queriesPerCounty)||queriesPerCounty<1||queriesPerCounty>2)
  throw Error("Limits exceeded: at most 15 counties and two requests each per state");
const out=options.output||path.join(root,".wave1-agent-output",state+".json");
const ledgerFile=options.ledger||path.join(root,"data/wave1-agent-progress.json");
async function optionalJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,"utf8"));}catch(error){
    if(error.code==="ENOENT")return fallback;
    throw error;
  }
}
async function searchSerp(query,apiKey){
  const url=new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine","google");
  url.searchParams.set("q",query);
  url.searchParams.set("num","10");
  url.searchParams.set("api_key",apiKey);
  const response=await fetch(url,{signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error("Search provider HTTP "+response.status);
  const payload=await response.json();
  if(payload.error)throw Error("Search provider returned an error; county status will remain unsearched");
  return Array.isArray(payload.organic_results)?payload.organic_results.slice(0,10):[];
}
const catalog=await optionalJson(path.join(root,"data/wave1-court-catalog.json"),null);
const ledger=readLedger(await optionalJson(ledgerFile,null));
const selected=chooseCounties(catalog,ledger,{state,limit,asOf:new Date().toISOString().slice(0,10)});
const enabled=process.env.WAVE1_SEARCH_ENABLED==="true" && Boolean(process.env.SERPAPI_KEY) &&
  options.mode==="search";
const output={
  schemaVersion:"recordpathai.wave1-agent-output.v1",state,
  scheduledCounties:selected.map(c=>({fips:c.countyFips,name:c.county})),
  searchEnabled:enabled,
  skippedReason:enabled?null:(!process.env.SERPAPI_KEY?"Missing SERPAPI_KEY":process.env.WAVE1_SEARCH_ENABLED!=="true"?"WAVE1_SEARCH_ENABLED is not true":"Preview-only mode"),
  attempts:[],candidates:[],searchRequests:0,
  evidenceNote:"Public forms research leads only; no PDF download, court record access, or filing authorization."
};
for(const county of enabled?selected:[]){
  const allQueries=discoveryQueries(county);
  const nextIndex=(ledger.counties[county.countyFips]?.attempts||0)%allQueries.length;
  const queries=Array.from({length:queriesPerCounty},(_,i)=>allQueries[(nextIndex+i)%allQueries.length]);
  const candidates=new Map();
  let searches=0,failed=false;
  for(const query of queries){
    try{
      const results=await searchSerp(query,process.env.SERPAPI_KEY);
      searches++;output.searchRequests++;
      for(const result of results){
        const score=scoreFormCandidate({title:result.title||"",link:result.link||"",snippet:result.snippet||""},county);
        if(score.score<10)continue;
        let url;
        try{url=canonicalSource(result.link);}catch{continue;}
        const formType=score.formType||"unknown",id=idForSource(url,formType);
        const prior=candidates.get(id);
        if(!prior||score.score>prior.score)
          candidates.set(id,{id,url,formType,title:String(result.title||"").slice(0,180),
            score:score.score,counties:[county.countyFips],discoveredAt:new Date().toISOString()});
      }
    }catch(error){
      failed=true;
      output.warning=(output.warning||[]).concat(county.countyFips+": "+String(error?.message||error).slice(0,95));
      // Do not label a county 'searched' when every request failed.
      break;
    }
  }
  if(failed&&searches===0)continue;
  const selectedCandidates=[...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,3);
  output.candidates.push(...selectedCandidates);
  output.attempts.push({
    state,county:county.county,countyFips:county.countyFips,
    status:selectedCandidates.length?"source_candidate_found":"searched_no_candidate",
    searchedAt:new Date().toISOString(),searchQueries:searches,
    candidateIds:selectedCandidates.map(c=>c.id)
  });
}
await mkdir(path.dirname(out),{recursive:true});
await fs.writeFile(out,JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify({state,planned:selected.length,attempted:output.attempts.length,
  leads:output.candidates.length,searchRequests:output.searchRequests,
  skippedReason:output.skippedReason},null,2));
