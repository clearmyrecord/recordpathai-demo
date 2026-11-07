#!/usr/bin/env node
// Agent 1 — Ohio county docket-source research. NEVER fetch individual dockets,
// bypass CAPTCHAs, collect person data, verify sources by guessing, or file cases.
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validateOhioRoster,selectOhioCounties,readOhioLedger,mergeOhioResearch,
  cleanHttps,coverage,OFFICIAL_COURT_DIRECTORY} from "./ohio-docket-agent-core.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=Object.fromEntries(process.argv.slice(2).filter(x=>/^--[^=]+=/.test(x)).map(x=>{
  const k=x.indexOf("=");return [x.slice(2,k),x.slice(k+1)];
}));
const limit=Number(args.limit||10),queries=Number(args.queries||1);
if(!Number.isInteger(limit)||limit<1||limit>15||!Number.isInteger(queries)||queries<1||queries>2)
  throw Error("Bounded Ohio research only: 1–15 counties, 1–2 search requests each");
const date=new Date().toISOString().slice(0,10);
const out=args.output||path.join(root,".ohio-agent-output","agent1.json");
const ledgerPath=args.ledger||path.join(root,"data","ohio-docket-agent-progress.json");
async function readJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,"utf8"));}
  catch(e){if(e.code==="ENOENT")return fallback;throw e;}
}
const roster=await readJson(path.join(root,"data/ohio-counties.json"),null);
const assigned=validateOhioRoster(roster);
const ledger=readOhioLedger(await readJson(ledgerPath,null));
const selected=selectOhioCounties(roster,ledger,{limit,asOf:date});
const enabled=(args.mode==="search"&&process.env.OHIO_RESEARCH_ENABLED==="true"&&
  Boolean(process.env.SERPAPI_KEY));
const output={
  schemaVersion:"recordpathai.ohio-county-agent-output.v1",
  agent:"agent-1-ohio",scope:"87 Ohio counties excluding Wood pilot",
  rosterCount:roster.length,assignedCount:assigned.length,
  queue:assigned.map(c=>({county:c.county,slug:c.slug,tier:c.tier})),
  officialDirectory:OFFICIAL_COURT_DIRECTORY,searchEnabled:enabled,
  skippedReason:enabled?null:
    args.mode!=="search"?"preview_only":
    process.env.OHIO_RESEARCH_ENABLED!=="true"?"OHIO_RESEARCH_ENABLED not true":
    "SERPAPI_KEY unavailable",
  attempts:[],candidates:[],searchRequests:0,
  notice:"Search result leads are NOT verified county dockets, approved forms, legal rules or filing permission."
};
async function search(query){
  const url=new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine","google");url.searchParams.set("q",query);
  url.searchParams.set("num","10");url.searchParams.set("api_key",process.env.SERPAPI_KEY);
  const response=await fetch(url,{signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error("Search HTTP "+response.status);
  const body=await response.json();
  if(body.error)throw Error("Search API error");
  return Array.isArray(body.organic_results)?body.organic_results.slice(0,10):[];
}
for(const county of enabled?selected:[]){
  const phrases=[
    county.county+" County Ohio clerk of courts criminal public case docket official online search",
    county.county+" County Ohio common pleas court public records case search clerk"
  ];
  const urls=new Map();let completed=0;
  for(const phrase of phrases.slice(0,queries)){
    try{
      const searchResults=await search(phrase);completed++;output.searchRequests++;
      for(const item of searchResults){
        const title=String(item.title||"").slice(0,180);
        let url;try{url=cleanHttps(item.link);}catch{continue;}
        const host=new URL(url).hostname.toLowerCase();
        // Search results are untrusted leads, even if they look official.
        // Exclude commercial people-finder, mugshot and record reseller sites.
        if(/(?:mugshot|peoplefind|backgroundcheck|beenverified|truthfinder|arrests\.org)/i.test(host))continue;
        if(!/court|clerk|case|docket|record/i.test(title+" "+url))continue;
        if(!urls.has(url))urls.set(url,{slug:county.slug,county:county.county,url,
          title,discoveredAt:new Date().toISOString()});
      }
    }catch(e){
      output.warnings=(output.warnings||[]).concat(county.slug+": "+String(e.message||e).slice(0,95));
    }
  }
  if(completed<1)continue; // Never mark a county researched if search requests failed.
  const candidates=[...urls.values()].slice(0,3);
  output.candidates.push(...candidates);
  output.attempts.push({county:county.county,slug:county.slug,
    status:candidates.length?"candidate_found":"searched_no_candidate",
    searchedAt:new Date().toISOString(),searches:completed});
}
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.writeFile(out,JSON.stringify(output,null,2)+"\n");
if(enabled&&output.attempts.length){
  const merged=mergeOhioResearch(ledger,output);
  await fs.mkdir(path.dirname(ledgerPath),{recursive:true});
  await fs.writeFile(ledgerPath,JSON.stringify(merged,null,2)+"\n");
}
console.log(JSON.stringify({agent:output.agent,assignedCount:87,planned:selected.length,
  completed:output.attempts.length,searchRequests:output.searchRequests,
  searchEnabled:enabled,skippedReason:output.skippedReason,
  ...coverage(roster,enabled?mergeOhioResearch(ledger,output):ledger)},null,2));
