import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
await import("../js/wave1-form-requirements.js");
const core=globalThis.RecordPathFormRequirements;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function caseData(state="OH",outcomes=["Dismissed"]){
 return {meta:{source_state:state},petitioner:{full_name:"Alex Test",address:{line1:"123 Test St",city:"Test City",state:"OH",zip:"44000"}},
   court:{state,county:"Wood",name:"Wood County Court of Common Pleas",court_type:"court-of-common-pleas",case_number:"2025CR0001"},
   case:{all_charges_confirmed:"yes",proceedings_status:"none"},
   charges:outcomes.map((final_disposition,i)=>({charge_name:"Synthetic charge "+i,charge_code:"2925.11",
     level:"F5",final_disposition,disposition_date:"2023-01-01",
     discharge_date:"2024-01-01"}))}
}
test("Wave 1 expansion and Ohio pilot states are included; other preparatory states do not imply active forms",()=>{
 assert.deepEqual(core.WAVE1,["NV","TX","FL","AZ","GA"]);
 for(const s of core.WAVE1){const r=core.requirements(caseData(s));assert.equal(r.scope,"wave1");assert.equal(r.needsSpecificFormReview,true);}
 assert.equal(core.requirements(caseData("OH")).scope,"pilot");
 assert.equal(core.requirements(caseData("IL")).scope,"preparatory");
 assert.equal(core.requirements(caseData("UT")).scope,"preparatory");
});
test("only verified case-level final outcomes permit candidate form routing",()=>{
 assert.equal(core.classify(caseData("OH",["Dismissed"])).candidateFormType,"sealing-dismissal");
 assert.equal(core.classify(caseData("OH",["Not Guilty","Dismissed"])).outcome,"nonconviction");
 assert.equal(core.classify(caseData("OH",["Convicted"])).candidateFormType,"sealing-conviction");
 for(const x of [
   caseData("OH",["Convicted","Dismissed"]),
   caseData("OH",["Dismissed","Convicted"]),
   caseData("OH",["Pending"]),
   {...caseData(),case:{all_charges_confirmed:"unsure",proceedings_status:"none"}},
   {...caseData(),case:{all_charges_confirmed:"yes",proceedings_status:"open"}}
 ]){
   assert.equal(core.classify(x).candidateFormType,null);
   assert.ok(core.classify(x).reviewReasons.length);
 }
});
test("disposition date is required and supervision termination cannot substitute",()=>{
 const data=caseData("OH",["Convicted"]);
 data.charges[0].disposition_date="";
 assert.equal(core.classify(data).candidateFormType,null);
 assert.ok(core.assess(data).missing.some(x=>x.key==="charges.0.disposition_date"));
 data.charges[0].disposition_date="2020-12-01";
 data.charges[0].discharge_date="";
 assert.equal(core.classify(data).candidateFormType,"sealing-conviction");
 assert.ok(core.requirements(data).requirements.some(x=>x.key==="charges.0.discharge_date"&&!x.required));
});
test("matches exact official court form registry and collects mapped PDF-specific keys",()=>{
 const data=caseData("OH",["Convicted"]);
 const registry=[{state:"OH",county:"Wood",courtType:"court-of-common-pleas",
   formType:"sealing-conviction",status:"active",mappingPath:"templates/ohio/wood-county/sealing-conviction.json"}];
 const fields=JSON.parse(fs.readFileSync(path.join(root,"templates/ohio/wood-county/sealing-conviction.json"),"utf8")).mappings;
 const base=core.assess(data,{registry,mapping:fields});
 assert.equal(base.sourceForm.type,"sealing-conviction");
 assert.equal(base.needsSpecificFormReview,false);
 assert.ok(base.requirements.some(r=>r.source==="court-pdf-mapping"&&r.key==="court.case_number"));
 assert.ok(base.requirements.some(r=>r.source==="court-pdf-mapping"&&r.key==="petitioner.email"));
 assert.ok(base.missing.some(x=>x.key==="petitioner.email"));
 assert.equal(base.requirements.some(x=>x.key==="charges.3.charge_name"),false);
 const wrongCounty={...data,court:{...data.court,county:"Cuyahoga"}};
 assert.equal(core.assess(wrongCounty,{registry,mapping:fields}).sourceForm,null);
});
test("all charge-specific outcomes must have their own dates and titles",()=>{
 const data=caseData("TX",["Dismissed","Not Guilty"]);
 data.charges[1].charge_code="";
 data.charges[1].disposition_date="";
 const result=core.assess(data);
 assert.ok(result.missing.some(x=>x.key==="charges.1.charge_code"));
 assert.ok(result.missing.some(x=>x.key==="charges.1.disposition_date"));
 assert.equal(result.eligible,false);
 assert.equal(result.courtReady,false);
});
test("Wave 1 personal fields are collected in Step 1, and all court-form and charge fields in Step 2",()=>{
 const eligibility=fs.readFileSync(path.join(root,"eligibility.html"),"utf8");
 const details=fs.readFileSync(path.join(root,"record-details.html"),"utf8");
 const packet=fs.readFileSync(path.join(root,"packet.html"),"utf8");
 assert.match(eligibility,/id="fullName"/);
 assert.match(eligibility,/id="dateOfBirth"/);
 assert.match(eligibility,/id="residenceState"/);
 assert.doesNotMatch(eligibility,/id="screenCounty"|id="screenChargeName"|id="caseState"|id="formRequirementsPanel"/);
 assert.match(details,/id="county"/);
 assert.match(details,/id="courtName"/);
 assert.match(details,/id="caseNumber"/);
 assert.match(details,/id="formRequirementsPanel"/);
 assert.doesNotMatch(details,/id="fullName"|id="dateOfBirth"/);
 for(const marker of ['data-field="final_disposition"','data-field="disposition_date"',
   'data-field="discharge_date"','id="allChargesConfirmed"','id="proceedingsStatus"']){
   assert.ok(details.includes(marker));
 }
 assert.match(packet,/async function ensureWave1FormReady/);
 assert.match(packet,/Multiple-charge cases require a validated case-level legal screen/);
 assert.match(packet,/if\(!await ensureWave1FormReady\(raw\)\)return/);
 assert.match(packet,/if \(!await ensureWave1FormReady\(raw\)\) return/);
 for(const [name,html] of [["eligibility.html",eligibility],["record-details.html",details],["packet.html",packet]]){
   for(const inline of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
     if(inline[1].trim())assert.doesNotThrow(()=>new vm.Script(inline[1]),name);
   }
 }
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,"js/wave1-intake-ui.js"),"utf8")));
});
