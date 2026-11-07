import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
 validateCatalog,chooseCounties,readLedger,canonicalSource,idForSource,
 mergeAgentOutput,coverageReport
} from "../tools/wave1-agent-core.mjs";
import {discoveryQueries} from "../tools/form-query-builder.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const catalog=JSON.parse(fs.readFileSync(path.join(root,"data/wave1-court-catalog.json"),"utf8"));
test("2026 Census roster covers all 512 real county equivalents with FIPS and no invented courts",()=>{
 assert.deepEqual(validateCatalog(catalog),{NV:17,TX:254,FL:67,AZ:15,GA:159});
 assert.equal(catalog.filter(c=>c.officialCourtVerified).length,0);
 assert.equal(catalog.filter(c=>c.priority==="seeded").length,10);
 assert.ok(catalog.some(c=>c.state==="NV"&&c.county==="Carson City"&&c.countyFips==="32510"));
 assert.ok(catalog.filter(c=>c.priority!=="seeded").every(c=>!c.courtName&&c.courtType==="unverified"));
});
test("Five workers begin with priority seeds then move across every county without repeats",()=>{
 const ledger=readLedger(null);
 const rows=chooseCounties(catalog,ledger,{state:"TX",limit:5});
 assert.equal(rows.length,5);
 assert.equal(rows.slice(0,2).every(c=>c.priority==="seeded"),true);
 assert.equal(new Set(rows.map(x=>x.countyFips)).size,5);
 for(const c of rows)ledger.counties[c.countyFips]={lastSearchedAt:"2026-11-06T10:00:00Z",status:"searched_no_candidate"};
 const next=chooseCounties(catalog,ledger,{state:"TX",limit:5,asOf:"2026-11-07"});
 assert.equal(next.every(c=>!rows.includes(c)),true);
 assert.throws(()=>chooseCounties(catalog,ledger,{state:"TX",limit:100}),/limit/);
});
test("Unverified counties produce state-specific research queries, never fictional court names",()=>{
 const unverified=catalog.find(c=>c.state==="GA"&&!c.courtName);
 const q=discoveryQueries(unverified);
 assert.ok(q.length>=3);
 assert.ok(q.every(v=>v.includes(unverified.county)));
 assert.ok(q.every(v=>!v.includes("unverified")));
 const carson=catalog.find(c=>c.county==="Carson City");
 assert.ok(discoveryQueries(carson).every(v=>!v.includes("Carson City County")));
});
test("Canonical URL normalizes source tracking and a form is deduplicated across counties",()=>{
 const url1="https://courts.example.gov/forms/record-seal.pdf?utm_source=google";
 const url2="https://courts.example.gov/forms/record-seal.pdf";
 assert.equal(canonicalSource(url1),canonicalSource(url2));
 const id=idForSource(url1,"sealing-dismissal");
 const at="2026-11-07T13:00:00Z";
 const outputs=[
  {state:"NV",attempts:[{state:"NV",county:"Clark",countyFips:"32003",status:"source_candidate_found",searchedAt:at,searchQueries:1,candidateIds:[id]}],
   candidates:[{id,url:url1,formType:"sealing-dismissal",title:"Official statewide PDF",counties:["32003"],discoveredAt:at}]},
  {state:"NV",attempts:[{state:"NV",county:"Washoe",countyFips:"32031",status:"source_candidate_found",searchedAt:at,searchQueries:1,candidateIds:[id]}],
   candidates:[{id,url:url2,formType:"sealing-dismissal",title:"Statewide PDF duplicate",counties:["32031"],discoveredAt:at}]}
 ];
 const ledger=mergeAgentOutput({},outputs);
 assert.equal(ledger.sources.length,1);
 assert.deepEqual(ledger.sources[0].counties,["32003","32031"]);
 assert.equal(ledger.sources[0].status,"source_verification_required");
 assert.equal(ledger.sources[0].active,false);
 assert.equal(ledger.counties["32003"].status,"source_candidate_found");
 assert.equal(coverageReport(catalog,ledger).states.NV.attempted,2);
});
test("Discovery agents cannot mark court forms verified, mapped or filing ready",()=>{
 const attempt={state:"GA",county:"Fulton",countyFips:"13121",status:"filing_ready",searchedAt:"2026-11-07",searchQueries:1};
 assert.throws(()=>mergeAgentOutput({},[{state:"GA",attempts:[attempt],candidates:[]}]),/cannot approve/);
 const protectedLedger=readLedger({counties:{"13121":{status:"legal_route_verified",attempts:5}},sources:[]});
 const after=mergeAgentOutput(protectedLedger,[{state:"GA",attempts:[{...attempt,status:"source_candidate_found"}],candidates:[]}]);
 assert.equal(after.counties["13121"].status,"legal_route_verified");
});
test("CLI preview performs zero paid searches and never changes form approvals",()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"recordpath-wave1-test-"));
 const output=path.join(folder,"TX.json");
 try{
  const result=execFileSync(process.execPath,[path.join(root,"tools/run-wave1-state-agent.mjs"),
   "--state=TX","--limit=5","--queries=1","--mode=search","--output="+output],
   {env:{...process.env,WAVE1_SEARCH_ENABLED:"false",SERPAPI_KEY:""},timeout:15000,encoding:"utf8"});
  const data=JSON.parse(fs.readFileSync(output,"utf8"));
  assert.equal(data.searchEnabled,false);
  assert.equal(data.searchRequests,0);
  assert.equal(data.scheduledCounties.length,5);
  assert.equal(data.attempts.length,0);
  assert.match(result,/Missing SERPAPI_KEY/);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test("Workflow is five-state, bounded, opt-in and commits only to review branch",()=>{
 const s=fs.readFileSync(path.join(root,".github/workflows/wave1-county-discovery.yml"),"utf8");
 assert.match(s,/matrix:\s*\n\s*state: \[NV, TX, FL, AZ, GA\]/);
 assert.match(s,/WAVE1_SEARCH_ENABLED/);
 assert.match(s,/SERPAPI_KEY/);
 assert.match(s,/automation\/wave1-discovery/);
 assert.match(s,/source_verification_required|human review/i);
 assert.ok(!/deploy-cloud-run|stripe\/checkout|lob\.com\/v1/.test(s));
});
