import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../js/wave1-form-requirements.js";

const details=readFileSync(new URL("../record-details.html",import.meta.url),"utf8");
const store=readFileSync(new URL("../js/user-store.js",import.meta.url),"utf8");
const packet=readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const registry=JSON.parse(readFileSync(new URL("../templates/index.json",import.meta.url),"utf8"));

test("case-level form review answers travel from Record Details into protected saved-case metadata",()=>{
  assert.match(details,/recordPathCaseReview:\s*\{\s*all_charges_confirmed:/);
  assert.match(details,/proceedings_status:\s*value\("proceedingsStatus"\)/);
  assert.match(store,/item\.metadata\.recordPathCaseReview/);
  const mapper=store.split("function caseToPacketData(caseData)")[1].split("function writeActiveCaseToStorage",1)[0];
  assert.match(mapper,/case:\s*\{\s*\/\/ Never promote unrelated browser draft/);
  assert.match(mapper,/all_charges_confirmed:\s*savedReview\.all_charges_confirmed/);
  assert.match(mapper,/proceedings_status:\s*savedReview\.proceedings_status/);
});

test("signed private review uses case review and charges from the authenticated saved case, not browser data",()=>{
  const prepare=packet.split("async function prepareSignedReviewPdf()")[1].split("async function generateSealingPdf()",1)[0];
  assert.ok(prepare);
  assert.match(prepare,/const savedCase=await store\.getCaseById\(caseId\)/);
  assert.match(prepare,/case:mapped\.case \|\| \{\},charges:mapped\.charges/);
  assert.match(prepare,/const data=buildNormalizedPacketData\(reviewData\)/);
  assert.match(packet,/all_charges_confirmed:\s*raw\.case\?\.all_charges_confirmed \|\| "unconfirmed"/);
  assert.match(packet,/proceedings_status:\s*raw\.case\?\.proceedings_status \|\| "unknown"/);
});

test("signed-in Save Progress and Continue require Supabase case persistence before navigating",()=>{
  const save=details.split("function persistCurrentCaseDraft(payload, syncAccount)")[1].split("function scheduleAutosave()",1)[0];
  assert.match(save,/localOnly:\s*!authenticated, network:\s*authenticated/);
  assert.match(save,/if \(authenticated && !saved\?\.savedCaseId\)/);
  assert.match(save,/if \(authenticated\) throw error/);
  const continueHandler=details.split('continueBtn.addEventListener("click"')[1].split("window.location.href = \"packet.html\";",1)[0];
  assert.match(continueHandler,/await persistCurrentCaseDraft/);
  assert.match(continueHandler,/catch \(error\) \{[\s\S]*?return;/);
});

test("form routing still fails closed on incomplete or unsupported case evidence",()=>{
  const core=globalThis.RecordPathFormRequirements;
  const valid={
    court:{state:"OH",county:"Wood",name:"Wood County Court of Common Pleas",court_type:"court-of-common-pleas"},
    case:{all_charges_confirmed:"yes",proceedings_status:"none"},
    charges:[{charge_name:"Synthetic charge",charge_code:"TEST",level:"F5",
      final_disposition:"convicted",disposition_date:"2022-04-06"}]
  };
  const match=core.classify(valid);
  assert.equal(match.candidateFormType,"sealing-conviction");
  assert.ok(registry.some(t=>t.status==="active"&&t.state==="OH"&&t.county==="Wood"&&t.courtType==="court-of-common-pleas"&&t.formType===match.candidateFormType));
  assert.equal(core.classify({...valid,case:{all_charges_confirmed:"unconfirmed",proceedings_status:"unknown"}}).candidateFormType,null);
  assert.equal(core.classify({...valid,charges:[{...valid.charges[0],final_disposition:"pending"}]}).candidateFormType,null);
});
