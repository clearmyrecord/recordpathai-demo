import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
await import("../js/wave1-form-requirements.js");
const core=globalThis.RecordPathFormRequirements;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function fixture(outcomes=["Convicted"]){
  return {
    meta:{source_state:"OH"},
    petitioner:{full_name:"Synthetic Applicant",address:{line1:"123 Main St",city:"Bowling Green",state:"OH",zip:"43402"}},
    court:{state:"OH",county:"Wood",court_type:"court-of-common-pleas",
      name:"Wood County Court of Common Pleas",case_number:"SYNTH-2020-001"},
    case:{all_charges_confirmed:"yes",proceedings_status:"none"},
    charges:outcomes.map((final_disposition,i)=>({
      original_charge_name:"Initial allegation "+i,original_charge_code:"SYNTH-ORIGINAL",
      charge_name:"Synthetic final charge "+i,charge_code:"2925.11",level:"F5",
      final_disposition,disposition_date:"2021-06-01",discharge_date:"2022-07-01"
    }))
  };
}
const registry=[{state:"OH",county:"Wood",courtType:"court-of-common-pleas",
  formType:"sealing-conviction",status:"active",mappingPath:"templates/ohio/wood-county/sealing-conviction.json"}];
const mapping=JSON.parse(fs.readFileSync(path.join(root,"templates/ohio/wood-county/sealing-conviction.json"),"utf8")).mappings;
test("date screening rejects impossible or future dates without using disposition as discharge",()=>{
  assert.equal(core.dateStatus("2020-02-30"),"invalid");
  assert.equal(core.dateStatus("2999-01-01"),"invalid");
  assert.equal(core.dateStatus("2021-06-01"),"valid");
  assert.equal(core.dateStatus(""),"missing");
  const input=fixture();
  input.charges[0].discharge_date="";
  const result=core.assess(input,{registry,mapping});
  assert.ok(result.missing.some(x=>x.key==="charges.0.discharge_date"));
  assert.equal(result.screeningComplete,false);
  assert.equal(result.courtReady,false);
  assert.equal(result.eligible,false);
  assert.equal(input.charges[0].discharge_date,"");
});
test("contradictory completion date and invalid disposition cannot be used",()=>{
  const input=fixture();
  input.charges[0].discharge_date="2020-04-01";
  assert.ok(core.assess(input,{registry,mapping}).missing.some(x=>x.key==="charges.0.discharge_date"));
  input.charges[0].disposition_date="2021-02-30";
  assert.equal(core.classify(input).candidateFormType,null);
  assert.ok(core.assess(input,{registry,mapping}).missing.some(x=>x.key==="charges.0.disposition_date"));
});
test("wrong court type never receives an official PDF by county alone",()=>{
  const input=fixture();
  assert.ok(core.relevantEntry(input,registry));
  delete input.court.court_type;
  assert.equal(core.relevantEntry(input,registry),null);
  assert.ok(core.assess(input,{registry,mapping}).missing.some(x=>x.key==="court.court_type"));
  assert.equal(core.assess(input,{registry,mapping}).needsSpecificFormReview,true);
  input.court.court_type="municipal";
  assert.equal(core.relevantEntry(input,registry),null);
});
test("multi-charge and applicant supplied records remain review only",()=>{
  const multi=fixture(["Convicted","Convicted"]);
  const r=core.assess(multi,{registry,mapping});
  assert.equal(r.screeningComplete,false);
  assert.ok(r.review.some(x=>x.includes("Multiple counts")));
  multi.charges[0].reported_termination_date_unverified="2024-02-01";
  multi.charges[0].discharge_date="";
  assert.ok(core.assess(multi,{registry,mapping}).review.some(x=>x.includes("reported")));
  const single=fixture();
  single.meta.verification_status="unverified_user_supplied";
  assert.equal(core.assess(single,{registry,mapping}).screeningComplete,false);
});
test("private review worksheet separates alleged/final charges, disposition and discharge",()=>{
  const input=fixture();
  input.petitioner.ssn_full="123-45-6789";
  const text=core.buildPreparationWorksheet(input,{registry,mapping});
  assert.match(text,/Original allegation: Initial allegation 0/);
  assert.match(text,/Final charge: Synthetic final charge 0/);
  assert.match(text,/Disposition date: 2021-06-01/);
  assert.match(text,/final-discharge date: 2022-07-01/);
  assert.match(text,/Legal eligibility: NOT DETERMINED/);
  assert.ok(!text.includes("123-45-6789"));
  assert.match(text,/NOT A COURT FORM/);
});
test("both intake screens have the worksheet and court-type routing; packet remains gated",()=>{
  const details=fs.readFileSync(path.join(root,"record-details.html"),"utf8");
  const eligibility=fs.readFileSync(path.join(root,"eligibility.html"),"utf8");
  const packet=fs.readFileSync(path.join(root,"packet.html"),"utf8");
  const intake=fs.readFileSync(path.join(root,"js/wave1-intake-ui.js"),"utf8");
  assert.match(details,/id="courtType"/);
  assert.match(details,/data\.court\.court_type = value\("courtType"\)/);
  assert.match(intake,/id="downloadPreparationWorksheet"/);
  assert.match(intake,/buildPreparationWorksheet/);
  assert.match(packet,/const courtType = safe\(data\?\.court\?\.court_type\)/);
  assert.match(packet,/if\(!helper\)return showPrerequisiteErrors/);
  assert.ok(!packet.includes("if (Array.isArray(local) && local.length) return local;"));
  for(const html of [details,eligibility,packet]){
    for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
      if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
    }
  }
  assert.doesNotThrow(()=>new vm.Script(intake));
});
