import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { caseReviewFingerprint, evaluatePacketRelease } from "../src/packet-release.js";
import { buildCourtCheckRequest, requireLobLiveDispatch } from "../src/lob-checks.js";

const userId="11111111-1111-4111-8111-111111111111";
const caseId="22222222-2222-4222-8222-222222222222";
const savedCase={
  id:caseId,user_id:userId,case_state:"OH",county:"Wood",
  court_name:"Wood County Court of Common Pleas",
  court_type:"court-of-common-pleas",case_number:"TEST-001",
  primary_charge:"SAMPLE",outcome:"conviction",
  disposition_date:"2020-01-01",final_discharge_date:"2021-01-01",
  metadata:{source:"synthetic"}
};
const charges=[{id:"a",charge_name:"SAMPLE",offense_code:"TEST",offense_level:"F5",flags:{}}];
const proof="a".repeat(64);
const booleans=[
  "identity_verified","official_docket_verified","all_charges_verified",
  "final_discharge_verified","statutory_exclusions_reviewed",
  "filing_instructions_verified","exact_court_form_verified",
  "applicant_signature_verified","filing_authorization_verified"
];
const review={
  case_id:caseId,user_id:userId,status:"approved",form_type:"sealing-conviction",
  case_snapshot_sha256:caseReviewFingerprint(savedCase,charges),
  signed_pdf_sha256:proof,
  signed_pdf_private_path:"private/packets/"+caseId+"/prepared.pdf",
  reviewer_id:"synthetic-operator",reviewed_at:new Date().toISOString(),
  approved_court_fee_cents:10000,fee_payment_method:"lob_check",
  verified_check_payee:"Wood County Clerk of Courts",
  verified_filing_address:"One Courthouse Square, Bowling Green, OH 43402",
  ...Object.fromEntries(booleans.map(k=>[k,true]))
};
const runtime={stripeLiveEnabled:true,lobLiveEnabled:true,lobVerifiedBank:true,
  onlineCourtPaymentVerified:false};
test("court with unconfirmed combined mailed packet and check cannot collect $150",()=>{
  const result=evaluatePacketRelease({userId,caseId,savedCase,charges,review,runtime});
  assert.equal(result.ready,false);
  assert.equal(result.quote.totalCents,15000);
  assert.equal(result.fulfillmentMode,"lob_check");
  assert.match(result.missing.join(" "),/clerk has not confirmed acceptance/i);
});
test("unverified cases and any change to charge/date are blocked",()=>{
  for(const [reason,opts] of [
    ["no review",{review:null}],
    ["mismatched owner",{review:{...review,user_id:"33333333-3333-4333-8333-333333333333"}}],
    ["changed date",{savedCase:{...savedCase,final_discharge_date:"2021-02-01"}}],
    ["changed charge",{charges:[{...charges[0],charge_name:"CHANGED"}]}],
    ["no reviewer",{review:{...review,reviewer_id:""}}],
    ["missing signature",{review:{...review,applicant_signature_verified:false}}],
    ["missing check payee",{review:{...review,verified_check_payee:""}}],
    ["incorrect court fee",{review:{...review,approved_court_fee_cents:9999}}],
    ["no court funding",{runtime:{...runtime,lobVerifiedBank:false}}],
    ["no Stripe release",{runtime:{...runtime,stripeLiveEnabled:false}}],
    ["stale approval",{review:{...review,reviewed_at:"2020-01-01T00:00:00.000Z"}}]
  ]) {
    const result=evaluatePacketRelease({userId,caseId,savedCase,charges,review,runtime,...opts});
    assert.equal(result.ready,false,reason);
    assert.ok(result.missing.length,reason);
  }
});
test("unmapped dismissal cannot charge despite nonconviction $0 fee",()=>{
  const result=evaluatePacketRelease({userId,caseId,savedCase,charges,
    review:{...review,form_type:"sealing-dismissal",approved_court_fee_cents:0,fee_payment_method:"no_fee"},runtime});
  assert.equal(result.ready,false);
});
test("Lob check builder blocks Wood County until clerk accepts combined mailing",()=>{
  const from={name:"RecordPathAI",address_line1:"123 Sender Lane",
    address_city:"Test City",address_state:"OH",address_zip:"43000"};
  const payload={
    profileInput:{state:"OH",county:"Wood",courtType:"court-of-common-pleas"},
    review,from,bankAccount:"bank_TEST123",
    attachmentUrl:"https://example.supabase.co/storage/v1/object/sign/sample?token=synthetic",
    attachmentPages:2,caseReference:"TEST-001",approvedCourtFeeCents:10000
  };
  assert.throws(()=>buildCourtCheckRequest(payload),/not authorized/i);
  assert.throws(()=>buildCourtCheckRequest({...payload,attachmentPages:4}),/not authorized/i);
  assert.throws(()=>buildCourtCheckRequest({...payload,approvedCourtFeeCents:0}),/not authorized/i);
});
test("live Lob dispatch is explicitly disabled by default",()=>{
  assert.equal(requireLobLiveDispatch({}),false);
  assert.equal(requireLobLiveDispatch({LOB_LIVE_API_KEY:"test_x",LOB_VERIFIED_BANK_ID:"bank_a",
    LOB_LIVE_CHECKS_ENABLED:"true",RECORDPATH_ENABLE_LIVE_DISPATCH:"true"}),false);
});
test("Stripe webhook never automatically mails and must verify signed paid session",()=>{
  const s=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const at=s.indexOf('app.post("/api/stripe/webhook"');
  const end=s.indexOf('app.post("/api/packet/private-upload"',at);
  assert.ok(at>0 && end>at);
  const webhook=s.slice(at,end);
  assert.match(webhook,/stripe\.webhooks\.constructEvent/);
  const shared=s.slice(s.indexOf('async function reconcilePaidPacketCheckout'),at);
  assert.match(webhook,/reconcilePaidPacketCheckout\(session,res\)/);
  assert.match(shared,/verifiedPacketSession\(current,owner,caseId\)/);
  assert.match(shared,/status:"paid_hold"/);
  assert.match(shared,/stripe\.checkout\.sessions\.retrieve\(session\.id\)/);
  assert.doesNotMatch(webhook+shared,/api\.lob\.com|dispatch-lob/);
  assert.match(s,/app\.post\("\/api\/operator\/stripe-test-checkout"/);
  assert.match(s,/packet-sandbox-simulation/);
  assert.match(s,/requireOperationsKey\(req,res\)/);
});
