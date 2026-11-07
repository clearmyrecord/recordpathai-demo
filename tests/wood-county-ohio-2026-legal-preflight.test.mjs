import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import "../js/ohio-case-review.js";
const ohio=globalThis.RecordPathOhioReview;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fixture=(charges)=>({
  petitioner:{full_name:"Synthetic Applicant"},
  court:{state:"OH",county:"Wood",court_type:"court-of-common-pleas",case_number:"SYNTHETIC-CASE"},
  case:{all_charges_confirmed:"yes",proceedings_status:"none"},charges
});
const f5=(overrides={})=>({
  original_charge_name:"Original charge",original_charge_code:"SYNTH-001",
  charge_name:"Final possession",charge_code:"2925.11",level:"F5",
  final_disposition:"Convicted",disposition_date:"2018-05-01",
  ...overrides
});
test("Ohio statute is 2025-09-30; Wood County court deposit could be $100 not assumed $50",()=>{
 assert.equal(ohio.WOOD_FEE.stateApplicationFee,50);
 assert.equal(ohio.WOOD_FEE.maximumLocalFee,50);
 assert.equal(ohio.WOOD_FEE.woodCountyPublishedDeposit,100);
 assert.equal(ohio.WOOD_FEE.waiverMayApply,true);
 assert.ok(ohio.SOURCES.conviction.endsWith("2953.32"));
 assert.ok(ohio.SOURCES.nonconviction.endsWith("2953.33"));
 assert.ok(ohio.SOURCES.combinedCharges.endsWith("2953.61"));
});
test("invalid dates, leap-year calendar additions, valid official charge code",()=>{
 assert.equal(ohio.iso("2020-02-30"),null);
 assert.equal(ohio.iso("2020-02-29"),"2020-02-29");
 assert.equal(ohio.addMonths("2020-02-29",12),"2021-02-28");
 assert.equal(ohio.statute({charge_code:"ORC 2925.11(A)"}),"2925.11");
});
test("clerk termination, conviction and other dates cannot stand in for independently verified final discharge",()=>{
 const c=f5({reported_termination_date_unverified:"2019-01-02",discharge_date:"2019-01-02"});
 assert.equal(ohio.approximateTiming(c,"sealing","2026-11-07").status,"unverified_final_discharge");
 const r=ohio.review(fixture([c]),{today:"2026-11-07"});
 assert.equal(r.eligible,false);assert.equal(r.allowPayment,false);
 assert.equal(r.allowMail,false);assert.equal(r.safeToFile,false);
 assert.ok(r.issues.some(x=>x.includes("Independent proof of final sentence discharge")));
});
test("verified felony final discharge sets ONLY an estimated window; judicial review still required",()=>{
 const c=f5({final_discharge_date:"2019-06-15",final_discharge_evidence_status:"verified",
   final_discharge_evidence_source:"SYNTHETIC-CERTIFICATE"});
 const r=ohio.review(fixture([c]),{today:"2026-11-07"});
 assert.equal(r.chargeReviews[0].sealing.date,"2020-06-15");
 assert.equal(r.chargeReviews[0].expungement.date,"2030-06-15");
 assert.equal(r.chargeReviews[0].expungement.status,"time_not_elapsed");
 assert.equal(r.eligible,false);assert.equal(r.safeToFile,false);
});
test("minor misdemeanor and F3 and special 2921.43 have correct waiting windows",()=>{
 const proof={final_discharge_date:"2019-06-15",final_discharge_evidence_status:"verified",
 final_discharge_evidence_source:"SYNTHETIC"};
 assert.equal(ohio.approximateTiming(f5({level:"MM",...proof}),"sealing","2026-11-07").date,"2019-12-15");
 assert.equal(ohio.approximateTiming(f5({level:"F3",...proof}),"sealing","2026-11-07").date,"2022-06-15");
 assert.equal(ohio.approximateTiming(f5({level:"F3",...proof}),"expungement","2026-11-07").date,"2032-06-15");
 assert.equal(ohio.approximateTiming(f5({level:"F5",charge_code:"2921.43",...proof}),"sealing","2026-11-07").date,"2026-06-15");
 assert.equal(ohio.approximateTiming(f5({level:"F5",charge_code:"2921.43",...proof}),"expungement","2026-11-07").date,"2036-06-15");
});
test("domestic-violence M3/M4 and protection-order conviction are sealing-only; F1 and excluded traffic have no window",()=>{
 const proof={final_discharge_date:"2019-06-15",final_discharge_evidence_status:"verified",
 final_discharge_evidence_source:"SYNTHETIC"};
 for (const c of [f5({level:"M3",charge_code:"2919.25",...proof}),f5({level:"M4",charge_code:"2919.27",...proof})]){
   assert.equal(ohio.approximateTiming(c,"expungement","2026-11-07").status,"sealing_only_no_expungement");
   assert.ok(ohio.approximateTiming(c,"sealing","2026-11-07").date);
 }
 for (const c of [f5({level:"F1",...proof}),f5({charge_code:"4511.19",...proof}),f5({charge_code:"2921.41",...proof})])
   assert.equal(ohio.approximateTiming(c,"sealing","2026-11-07").status,"statutorily_excluded");
});
test("no bill uses grand jury reporting date; mixed charges and five counts never filing-ready",()=>{
 const noBill={charge_name:"Synthetic charge",charge_code:"2925.11",level:"F5",
   final_disposition:"No Bill",disposition_date:"2020-01-01"};
 assert.equal(ohio.approximateTiming(noBill,"sealing","2026-11-07").status,"missing_grand_jury_report_date");
 noBill.no_bill_report_to_court_date="2020-04-01";
 assert.equal(ohio.approximateTiming(noBill,"sealing","2026-11-07").date,"2022-04-01");
 const mixed=ohio.review(fixture([f5(),noBill]),{today:"2026-11-07"});
 assert.equal(mixed.caseOutcome,"mixed");
 assert.ok(mixed.issues.some(x=>x.includes("2953.61")));
 const five=ohio.review(fixture(Array.from({length:5},()=>f5())),{today:"2026-11-07"});
 assert.equal(five.formRowCapacity,4);
 assert.ok(five.issues.some(x=>x.includes("four charge rows")));
 assert.equal(five.allowPayment,false);
});
test("source form mapping is four-page / 33 fields with four rows and separate dates",()=>{
 const j=JSON.parse(fs.readFileSync(path.join(root,"templates/ohio/wood-county/sealing-conviction.json"),"utf8"));
 assert.equal(j.pageCount,4);
 assert.ok(j.mappings.length>=33);
 for(let i=0;i<4;i++){
   for(const suffix of ["charge_name","charge_code","level"])
     assert.ok(j.mappings.some(x=>x.name==="charges."+i+"."+suffix));
 }
 assert.ok(j.mappings.some(x=>x.name==="charges.0.disposition_date"));
 assert.ok(j.mappings.some(x=>x.name==="charges.0.discharge_date"));
 assert.ok(j.mappings.some(x=>x.name==="petitioner.address.line2"));
});
test("review-only code is wired into both intake pages and payment is stopped on Ohio pilot",()=>{
 const eligibility=fs.readFileSync(path.join(root,"eligibility.html"),"utf8");
 const details=fs.readFileSync(path.join(root,"record-details.html"),"utf8");
 const packet=fs.readFileSync(path.join(root,"packet.html"),"utf8");
 const ui=fs.readFileSync(path.join(root,"js/wave1-intake-ui.js"),"utf8");
 for(const html of [eligibility,details,packet])assert.match(html,/js\/ohio-case-review\.js/);
 assert.match(details,/data-field="original_charge_name"/);
 assert.match(details,/data-field="original_charge_code"/);
 assert.match(packet,/if\(base\.state==="OH"\)/);
 assert.match(packet,/No payment will be collected/i);
 assert.match(ui,/renderOhioPilotReview\(lastData\)/);
 for(const html of [eligibility,details,packet])for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
   if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
 assert.doesNotThrow(()=>new vm.Script(ui));
});
