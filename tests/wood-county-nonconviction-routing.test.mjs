import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
await import("../js/wood-county-record-prefill.js");
await import("../js/wood-county-packet-route.js");
const prefill=globalThis.RecordPathWoodCountyPrefill;
const route=globalThis.RecordPathWoodCountyPacketRoute;
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const nowMs=Date.parse("2026-11-07T15:45:00Z");
const hit={
  caseNumber:"2006CR1234",verifiedAt:"2026-11-07T15:40:00Z",
  terminationDate:"2010-05-10",terminationDescription:"case complete",
  defendants:[{name:"Alex Example",charges:[
    {description:"Possession",statute:"2925.11",offenseDegree:"F5",
     disposition:"Dismissed",dispositionDate:"2022-05-03"}
  ]}]
};
test("unverified or third-party search hits cannot prefill",()=>{
  assert.throws(()=>prefill.buildDraft(hit,{nowMs}),/confirmation/);
  assert.throws(()=>prefill.buildDraft({...hit,verifiedAt:"2025-01-01"}, {confirmOwnRecord:true,nowMs}),/verification/);
  assert.throws(()=>prefill.buildDraft({...hit,defendants:[...hit.defendants,...hit.defendants]}, {confirmOwnRecord:true,nowMs}),/Ambiguous/);
});
test("prefill populates known court fields without inventing supervision or personal identifiers",()=>{
  const d=prefill.buildDraft(hit,{confirmOwnRecord:true,nowMs});
  assert.equal(d.court.case_number,"2006CR1234");
  assert.equal(d.petitioner.first_name,"Alex");
  assert.equal(d.petitioner.last_name,"Example");
  assert.equal(d.charges[0].final_disposition,"Dismissed");
  assert.equal(d.charges[0].disposition_date,"2022-05-03");
  assert.equal(d.charges[0].discharge_date,"");
  assert.equal(d.meta.reported_termination_date_unverified,"2010-05-10");
  assert.equal(d.petitioner.dob,undefined);
  assert.equal(d.petitioner.ssn_full,undefined);
});
test("prefill preserves unresolved dispositions for verification, not auto conviction",()=>{
  const bad=structuredClone(hit);bad.defendants[0].charges[0].disposition="Closed or transferred";
  const d=prefill.buildDraft(bad,{confirmOwnRecord:true,nowMs});
  assert.equal(d.charges[0].final_disposition,"");
  assert.match(d.charges[0].notes,/requires/);
});
function caseData(dispositions){
  return {court:{state:"OH",county:"Wood County",name:"Wood County Court of Common Pleas",case_number:"2025CR0012"},
    charges:dispositions.map(d=>({case_number:"2025CR0012",final_disposition:d,disposition_date:"2024-01-01"}))};
}
test("all nonconvictions select dismissal form without a $100 check",()=>{
  for(const d of ["Dismissed","Not Guilty","Acquitted"]){
    const r=route.analyze(caseData([d]));
    assert.equal(r.formType,"sealing-dismissal");
    assert.equal(r.courtFeeAmountCents,0);
    assert.equal(r.courtFeeCheckRequired,false);
  }
});
test("convictions and mixed or unresolved outcomes never silently use dismissal template",()=>{
  assert.equal(route.analyze(caseData(["Convicted"])).formType,"sealing-conviction");
  assert.equal(route.analyze(caseData(["Dismissed","Convicted"])).ready,false);
  assert.equal(route.analyze(caseData(["Pending"])).ready,false);
  assert.equal(route.analyze(caseData(["Not Guilty","No Bill"])).formType,"sealing-dismissal"); // Two-year no-bill period elapsed.
});
test("official imported PDF is present; mapper is present; template stays manual until field map reviewed",()=>{
  const assets="assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf";
  assert.equal(existsSync(join(root,assets)),true);
  assert.equal(existsSync(join(root,"pdf-mapper-v5.html")),true);
  const registry=JSON.parse(readFileSync(join(root,"templates/index.json"),"utf8"));
  const r=registry.find(t=>t.formType==="sealing-dismissal"&&t.county==="Wood");
  assert.ok(r);
  assert.equal(r.courtFeeCheckRequired,false);
  assert.match(r.status,/manual|pending/);
});
