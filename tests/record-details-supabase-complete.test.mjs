import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const page=source("record-details.html");
const store=source("js/user-store.js");
const watch=source("recordwatch-dashboard.html");
const packet=source("packet.html");
const fieldSource=source("js/record-details-fields.js");

test("all static and charge-card Step 2 controls can be captured",()=>{
  const context=vm.createContext({window:{}});
  vm.runInContext(fieldSource,context);
  const mapper=context.window.RecordPathRecordDetailsFields;
  const staticInputs=[
    {id:"caseNumber",value:"2026-TEST",type:"text",closest:()=>null},
    {id:"courtType",value:"court-of-common-pleas",type:"select",closest:()=>null},
    {id:"arrestDate",value:"2026-01-01",type:"date",closest:()=>null},
    {id:"allChargesConfirmed",value:"yes",type:"select",closest:()=>null},
    {id:"finesPaid",value:"No",type:"select",closest:()=>null}
  ];
  const charges=[
    {querySelectorAll:()=>[
      {dataset:{field:"original_charge_name"},type:"text",value:"Allegation"},
      {dataset:{field:"charge_name"},type:"text",value:"Final Charge"},
      {dataset:{field:"disposition_date"},type:"date",value:"2026-01-02"},
      {dataset:{field:"discharge_date"},type:"date",value:"2026-04-03"},
      {dataset:{field:"isTraffic"},type:"checkbox",checked:false},
      {dataset:{field:"notes"},type:"textarea",value:"Test note"}
    ]}
  ];
  const form={querySelectorAll:selector=>selector===".record-card"?charges:staticInputs};
  const result=mapper.capture(form);
  assert.equal(result.schemaVersion,1);
  assert.equal(result.fields.caseNumber,"2026-TEST");
  assert.equal(result.fields.arrestDate,"2026-01-01");
  assert.equal(result.charges[0].charge_name,"Final Charge");
  assert.equal(result.charges[0].isTraffic,false);
  assert.notEqual(result.charges[0].disposition_date,result.charges[0].discharge_date);
  const html=mapper.render(result);
  assert.match(html,/Original Alleged Charge/);
  assert.match(html,/Final supervision completion/);
  assert.match(html,/Test note/);
});

test("Step 2 saves only authenticated Supabase records with full metadata readback",()=>{
  assert.match(store,/saveRecordDetailsToSupabase: function/);
  assert.match(store,/strictRemote \? input/);
  assert.match(store,/await syncCharges\(data\.id, nextCase\)/);
  assert.match(store,/rereadCase\.data\?\.metadata\?\.recordPathStep2/);
  assert.match(store,/rereadCharges\.data\|\|\[\]/);
  assert.match(store,/if\(strictRemote && !currentUser\)/);
  assert.match(page,/recordPathStep2: RecordPathRecordDetailsFields\.capture/);
  const p=page.slice(page.indexOf("function persistCurrentCaseDraft("),page.indexOf("function hasRecordDetailsCompletion("));
  assert.match(p,/store\.saveRecordDetailsToSupabase\(payload\)/);
  assert.doesNotMatch(p,/localStorage|\.savePacketData\(|saveLegacyKeys\(/);
  assert.doesNotMatch(page,/window\.addEventListener\("pagehide"/);
});

test("Step 2 loads only selected owner's Supabase case and continues with UUID",()=>{
  const init=page.slice(page.indexOf("async function init()"),page.indexOf("init();",page.indexOf("async function init()")));
  assert.match(init,/await client\.auth\.getUser\(\)/);
  assert.match(init,/await store\.getSupabaseCaseById\(candidate\)/);
  assert.match(init,/recordPathStep2,addOffense/);
  assert.match(init,/packet\.html\?caseId=/);
  assert.match(init,/Premium is optional/);
  assert.doesNotMatch(init,/RecordPathDataBridge\.loadPacketData\(/);
});

test("RecordWatch displays full owner-scoped Step 2 data without Premium",()=>{
  assert.match(watch,/store\.getSupabaseCases\(\),store\.getSupabaseProfile\(\)/);
  assert.match(watch,/RecordPathRecordDetailsFields\.render\(sourceCase\.metadata\?\.recordPathStep2\)/);
  assert.match(watch,/Saved Supabase case/);
  assert.match(watch,/Premium only/);
});

test("Step 3 does not mark user click as reviewer approval or force Lob",()=>{
  assert.match(packet,/inspectPacketReadiness\(reviewCase\?\.checkoutCase\?\.saved_case_id\)/);
  assert.match(packet,/if\(review\.ready!==true\)/);
  const backend=source("src/packet-release.js");
  assert.match(backend,/review\.status!=="approved"/);
  assert.match(backend,/review\?\.case_snapshot_sha256!==fingerprint/);
  assert.match(backend,/runtime\.lobLiveEnabled/);
});
