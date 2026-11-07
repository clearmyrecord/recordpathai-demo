import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createSummary,countyStatus,visibleCounties,validate} from "../js/wave1-ops-core.mjs";
await import("../js/court-record-import-core.js");
const importer=globalThis.RecordPathCaseImport;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const sample=json("data/example-user-case-import.json");
const catalog=json("data/wave1-court-catalog.json");
const progress=json("data/wave1-agent-progress.json");
const active=json("templates/index.json");
function readCase(){return JSON.parse(JSON.stringify(sample));}
test("all 512 Wave 1 counties are available for research; no personal records shown",()=>{
 assert.equal(validate(catalog),true);
 const s=createSummary(catalog,progress,active);
 assert.equal(s.counties,512);assert.equal(s.rows.length,5);
 assert.deepEqual(s.rows.map(r=>r.total),[17,254,67,15,159]);
 assert.equal(s.activeMappings,0); // The existing active Ohio pilot isn't Wave 1.
 assert.equal(s.attempted,0);
 assert.equal(visibleCounties(catalog,{state:"TX"}).length,254);
 assert.equal(visibleCounties(catalog,{query:"Carson City"}).length,1);
 assert.equal(visibleCounties(catalog,{query:"nonsense-fips"}).length,0);
});
test("a courthouse source lead does not become a mapped PDF or legally active form",()=>{
 const county=catalog.find(x=>x.state==="NV"&&x.county==="Clark");
 const fake={counties:{[county.countyFips]:{status:"source_candidate_found"}},
  sources:[{id:"example",title:"Unverified URL",counties:[county.countyFips]}]};
 const res=countyStatus(county,fake,active);
 assert.equal(res.status,"source_candidate_found");
 assert.equal(res.candidates.length,1);
 assert.equal(res.active.length,0);
});
test("applicant authorization is required before an import can be previewed",()=>{
 assert.throws(()=>importer.normalize(readCase()),/confirm/);
 const review=importer.normalize(readCase(),{confirmOwnRecord:true});
 assert.equal(review.schemaVersion,"recordpathai.case-import.v1");
 assert.equal(review.summary.charges,2);
 assert.equal(review.safeToFile,false);
 assert.equal(review.eligible,false);
 assert.equal(review.mappedFormSelected,false);
 assert.equal(review.draft.meta.verification_status,"unverified_user_supplied");
 assert.equal(review.draft.case.all_charges_confirmed,"");
 assert.equal(review.draft.case.proceedings_status,"");
});
test("original and final charges are distinct; disposition never becomes termination",()=>{
 const c=readCase();
 c.charges[0].termination_date="2022-09-15";
 c.charges[0].termination_evidence="Unverified source claim";
 const review=importer.normalize(c,{confirmOwnRecord:true});
 const charge=review.draft.charges[0];
 assert.equal(charge.original_charge_name,"Example original charge");
 assert.equal(charge.original_charge_code,"SAMPLE-001");
 assert.equal(charge.charge_name,"Example final charge");
 assert.equal(charge.charge_code,"SAMPLE-002");
 assert.equal(charge.final_disposition,"Dismissed");
 assert.equal(charge.disposition_date,"2020-05-10");
 assert.equal(charge.reported_termination_date_unverified,"2022-09-15");
 assert.equal(charge.discharge_date,"");
 assert.equal(charge.probation_end_date,"");
 assert.equal(review.summary.reportedTerminationDates,1);
 assert.ok(review.warnings.some(w=>w.includes("termination")));
});
test("mixed outcomes and missing dates always require independent case review",()=>{
 const c=readCase();c.charges[0].final_disposition="convicted";
 c.charges[1].disposition_date="";
 const r=importer.normalize(c,{confirmOwnRecord:true});
 assert.equal(r.summary.mixedOutcomes,true);
 assert.equal(r.summary.missingOutcomes,1);
 assert.equal(r.draft.eligibility.is_eligible,false);
 assert.ok(r.warnings.some(w=>/Mixed/.test(w)));
});
test("ambiguous or untrusted bulk import formats are rejected",()=>{
 const cases=[
  {...readCase(),defendants:[{name:"A"},{name:"B"}]},
  {...readCase(),schemaVersion:"arbitrary-json"},
  {...readCase(),case:{...readCase().case,state:"CA"}},
  {...readCase(),source:{...readCase().source,url:"http://example.com/file"}},
  {...readCase(),charges:Array.from({length:41},()=>readCase().charges[0])},
  {...readCase(),charges:[{description:""}]},
 ];
 for(const c of cases)assert.throws(()=>importer.normalize(c,{confirmOwnRecord:true}));
});
test("invalid and impossible dates stay missing; unverified dispositions cannot be inferred",()=>{
 const c=readCase();c.charges[0].disposition_date="2020-02-30";
 c.charges[0].final_disposition="deferred";
 const r=importer.normalize(c,{confirmOwnRecord:true});
 assert.equal(r.draft.charges[0].disposition_date,"");
 assert.equal(r.draft.charges[0].final_disposition,"");
 assert.equal(r.summary.missingOutcomes,1);
});
test("existing applicant/case data cannot be overwritten accidentally",()=>{
 const draft=importer.normalize(readCase(),{confirmOwnRecord:true});
 let current={petitioner:{full_name:"Another Applicant",email:"private@example.test"},
  court:{case_number:"DIFFERENT"},charges:[{charge_name:"Other"}]};
 const bridge={loadPacketData:()=>current,createEmptyPacketData:()=>({meta:{},petitioner:{},court:{},case:{},eligibility:{},charges:[]}),
  savePacketData:x=>{current=x;}};
 assert.throws(()=>importer.merge(bridge,draft),/confirmation/);
 importer.merge(bridge,draft,{confirmReplace:true});
 assert.equal(current.petitioner.email,undefined);
 assert.equal(current.petitioner.full_name,"Example Applicant");
 assert.equal(current.court.case_number,"EXAMPLE-2020-001");
 assert.equal(current.charges.length,2);
 assert.equal(current.eligibility.is_eligible,false);
});
test("intake and mapper UI are linked, while source metadata stays review-only",()=>{
 for(const page of ["eligibility.html","record-details.html"]){
  const s=fs.readFileSync(path.join(root,page),"utf8");
  assert.match(s,/court-record-import-core\.js/);
  assert.match(s,/court-record-import-ui\.js/);
  assert.match(s,/id="formRequirementsPanel"/);
 }
 const dashboard=fs.readFileSync(path.join(root,"admin/wave1-operations.html"),"utf8");
 assert.match(dashboard,/pdf-mapper-v7\.html/);
 assert.match(dashboard,/wave1-ops-dashboard\.mjs/);
 assert.match(dashboard,/noindex,nofollow/);
 const ui=fs.readFileSync(path.join(root,"js/court-record-import-ui.js"),"utf8");
 assert.match(ui,/type="file"/);
 assert.match(ui,/type="checkbox"/);
 assert.match(ui,/.textContent=/);
 assert.ok(!ui.includes('innerHTML='));
});
