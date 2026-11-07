import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
await import("../js/wood-county-record-prefill.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const prefill=globalThis.RecordPathWoodCountyPrefill;
const name="Alex Example";
const now=Date.now();
const hit={
  caseNumber:"2025CR0012",verifiedAt:new Date(now-30000).toISOString(),
  terminationDate:"2025-04-10",terminationDescription:"Court extract last event",
  defendants:[{name,charges:[
    {description:"Possession",statute:"2925.11",offenseDegree:"F5",
     disposition:"Dismissed",dispositionDate:"2025-03-01"},
    {description:"Disorderly",statute:"2917.11",offenseDegree:"M4",
     disposition:"Dismissed without prejudice",dispositionDate:"2025-03-01"}
  ]}]
};
function storage(){
 const m=new Map();
 return {
  getItem(key){return m.get(key)||null;},
  setItem(key,val){m.set(key,String(val));},
  removeItem(key){m.delete(key);}
 };
}
function bridge(initial){
 let data=initial||{petitioner:{},court:{},charges:[],eligibility:{},case:{},meta:{}};
 return {
  createEmptyPacketData(){return {petitioner:{address:{}},court:{},charges:[],eligibility:{},case:{},meta:{}};},
  loadPacketData(){return data;},
  savePacketData(next){data=next;return next;},
  current(){return data;}
 };
}
test("verified results require applicant consent, one party and fresh approval",()=>{
 assert.throws(()=>prefill.buildDraft(hit),/Explicit applicant/);
 assert.throws(()=>prefill.buildDraft({...hit,verifiedAt:"2022-01-01"},{confirmOwnRecord:true}),/verification required/);
 assert.throws(()=>prefill.buildDraft({...hit,defendants:[...hit.defendants,...hit.defendants]},{confirmOwnRecord:true}),/Ambiguous/);
 assert.throws(()=>prefill.buildDraft({...hit,verifiedAt:"not-a-date"},{confirmOwnRecord:true}),/verification required/);
});
test("prefill preserves every charge and never infers supervision completion",()=>{
 const draft=prefill.buildDraft(hit,{confirmOwnRecord:true});
 assert.equal(draft.court.case_number,"2025CR0012");
 assert.equal(draft.charges.length,2);
 assert.equal(draft.charges[0].disposition_date,"2025-03-01");
 assert.equal(draft.charges[1].final_disposition,""); // No assumption about dismissal without prejudice
 assert.equal(draft.charges[0].discharge_date,"");
 assert.equal(draft.charges[0].probation_end_date,"");
 assert.equal(draft.meta.reported_termination_date_unverified,"2025-04-10");
 assert.equal(draft.eligibility.is_eligible,false);
 assert.equal(draft.petitioner.address,undefined);
 assert.equal(draft.petitioner.dob,undefined);
});
test("applying approved case is single-use and does not transfer another person's contact information",()=>{
 globalThis.sessionStorage=storage();
 prefill.stage(hit,{confirmOwnRecord:true});
 const current={petitioner:{full_name:"Other Person",email:"other@example.test",address:{line1:"Unrelated"}},
  court:{case_number:"2006CR0001"},charges:[],eligibility:{},case:{},meta:{}};
 const client=bridge(current);
 const conflict=prefill.applyStaged(client,{confirmReplace:()=>false});
 assert.equal(conflict.status,"conflict");
 assert.equal(client.current(),current);
 const imported=prefill.applyStaged(client,{confirmReplace:()=>true});
 assert.equal(imported.status,"imported");
 assert.equal(imported.caseNumber,hit.caseNumber);
 assert.equal(imported.charges,2);
 assert.equal(client.current().petitioner.email,undefined);
 assert.equal(client.current().petitioner.address.line1,undefined);
 assert.equal(client.current().case.all_charges_confirmed,"");
 assert.equal(client.current().case.proceedings_status,"");
 assert.equal(client.current().eligibility.has_pending_cases,true);
 assert.equal(prefill.peek(),null);
});
test("matching case and applicant can retain voluntarily entered contact details",()=>{
 globalThis.sessionStorage=storage();
 prefill.stage(hit,{confirmOwnRecord:true});
 const client=bridge({petitioner:{full_name:name,email:"alex@example.test"},
  court:{case_number:hit.caseNumber},charges:[],case:{},meta:{},eligibility:{}});
 const result=prefill.applyStaged(client,{confirmReplace:()=>false});
 assert.equal(result.status,"imported");
 assert.equal(client.current().petitioner.email,"alex@example.test");
});
test("original intake and search source files parse and use consent gate",()=>{
 const files=["self-search.html","eligibility.html"];
 for(const p of files){
  const html=fs.readFileSync(path.join(root,p),"utf8");
  const embedded=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for(const [,script] of embedded)if(script.trim())assert.doesNotThrow(()=>new vm.Script(script),p);
 }
 const search=fs.readFileSync(path.join(root,"self-search.html"),"utf8");
 const intake=fs.readFileSync(path.join(root,"eligibility.html"),"utf8");
 assert.match(search,/Use my verified case to prefill RecordPathAI/);
 assert.match(search,/confirmOwnRecord:true/);
 assert.match(intake,/applyStaged\(RecordPathDataBridge/);
 assert.match(intake,/recordpath:data-updated/);
});
