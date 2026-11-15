import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const start=html.indexOf("async function prepareSignedReviewPdf()");
const end=html.indexOf("async function generateSealingPdf()",start);
assert.ok(start>0 && end>start,"Actual production private review handler is required");
const realHandler=html.slice(start,end);

const id="11111111-1111-4111-8111-111111111111";
const saved={
  id,case_id:id,caseNumber:"SAVED-123",courtType:"court-of-common-pleas",
  charges:[{charge_name:"REAL saved charge"}]
};
const mapped={
  court:{state:"OH",county:"Wood",name:"Wood County Court of Common Pleas",
    court_type:"court-of-common-pleas",case_number:"SAVED-123"},
  charges:[{charge_name:"REAL saved charge",final_disposition:"Convicted"}]
};
function scenario({requestedId=id,consent=true,loaded=saved,mappedResult=mapped}={}){
  const events={uploads:[],errors:[],status:[],rendered:[],caseLookups:[],selected:[],saveCalls:0};
  const account={
    getCaseById:async value=>{events.caseLookups.push(value);return loaded;},
    caseToPacketData:()=>mappedResult,
    saveCase:()=>{events.saveCalls++;throw Error("Unexpected saved-case mutation");}
  };
  const window={
    PDFLib:{},
    RecordPathAuth:{requireAuth:()=>true},
    RecordPathUserStore:account,
    RecordPathSupabase:{getClient:async()=>({auth:{getSession:async()=>({
      data:{session:{access_token:"synthetic_token"}}})}})},
    location:{search:"?caseId="+requestedId}
  };
  const context={
    window,document:{getElementById:key=>key==="prepareSignedReviewBtn"?
      {disabled:false}:key==="authorizeSignedReview"?{checked:consent}:null},
    URLSearchParams,
    setCheckoutError:message=>events.errors.push(message),
    setStatus:(message)=>events.status.push(message),
    requireSavedDrawnSignature:()=>true,
    resolveCheckoutCase:async()=>({checkoutCase:{saved_case_id:id,caseNumber:"SAVED-123"}}),
    validateCheckoutCase:()=>({ok:true}),
    isInternalUuid:value=>value===id,
    readPacketData:()=>({
      petitioner:{full_name:"REAL APPLICANT",email:"real@example.com"},
      court:{state:"NV",county:"SAMPLE",case_number:"TEST-ONLY"},
      charges:[{charge_name:"SAMPLE CHARGE",final_disposition:"Dismissed"}]
    }),
    buildNormalizedPacketData:raw=>raw,
    loadActiveTemplateForPacket:async data=>{events.selected.push(data);return {id:"wood_form"};},
    loadFormSchema:async()=>({}),
    getMissingRequiredFields:()=>[],
    renderMissingInfoPanel:()=>{},
    renderSignedCourtPdfBytes:async data=>{
      events.rendered.push(data);
      return new Uint8Array([37,80,68,70,45,49,46,55]);},
    getCheckoutEndpoint:()=>"/api/create-checkout-session",
    fetch:async (url,options)=>{
      events.uploads.push({url,method:options.method,headers:options.headers,body:options.body});
      return {ok:true,json:async()=>({ok:true})};},
    saveCheckoutCaseIfNeeded:()=>{events.saveCalls++;throw Error("Mutating account in review");}
  };
  const job=vm.runInNewContext(realHandler+"\nprepareSignedReviewPdf()",context);
  return {job,events};
}

test("Private review uses canonical account record, not stale sample, and uploads only with signed consent",async()=>{
  const {job,events}=scenario();
  await job;
  assert.deepEqual(events.caseLookups,[id]);
  assert.equal(events.selected.length,1);
  assert.equal(events.selected[0].court.state,"OH");
  assert.equal(events.selected[0].court.case_number,"SAVED-123");
  assert.equal(events.selected[0].charges[0].charge_name,"REAL saved charge");
  assert.equal(events.selected[0].petitioner.full_name,"REAL APPLICANT");
  assert.equal(events.rendered.length,1);
  assert.equal(events.uploads.length,1);
  assert.equal(events.uploads[0].url,"/api/packet/private-upload");
  assert.equal(events.uploads[0].method,"POST");
  assert.equal(events.uploads[0].headers["x-recordpath-case-id"],id);
  assert.equal(events.uploads[0].headers["x-recordpath-private-review-consent"],"yes");
  assert.equal(events.saveCalls,0,"Review cannot modify source case or request any charge");
  assert.ok(events.status.at(-1).includes("saved privately for court review"));
  assert.ok(!events.errors.at(-1));
});

test("Private review fails closed when consent is missing",async()=>{
  const {job,events}=scenario({consent:false});
  await job;
  assert.equal(events.uploads.length,0);
  assert.ok(events.errors.at(-1).includes("authorize private preparation"));
});

test("Private review never changes to another active case when a URL case ID is missing",async()=>{
  const {job,events}=scenario({requestedId:"22222222-2222-4222-8222-222222222222"});
  await job;
  assert.equal(events.uploads.length,0);
  assert.ok(events.errors.at(-1).includes("requested saved case"));
});

test("Private review cannot proceed with missing canonical court division",async()=>{
  const {job,events}=scenario({mappedResult:{...mapped,court:{...mapped.court,court_type:""}}});
  await job;
  assert.equal(events.uploads.length,0);
  assert.ok(events.errors.at(-1).includes("missing a court"));
});

test("Private review cannot upload an absent account case",async()=>{
  const {job,events}=scenario({loaded:null});
  await job;
  assert.equal(events.uploads.length,0);
  assert.ok(events.errors.at(-1).includes("not found in this account"));
});
