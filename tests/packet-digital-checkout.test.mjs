import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { caseReviewFingerprint, evaluatePacketRelease } from "../src/packet-release.js";
import { verifiedPacketSession } from "../src/payment-security.js";

const userId="11111111-1111-4111-8111-111111111111";
const caseId="22222222-2222-4222-8222-222222222222";
const savedCase={
  id:caseId,user_id:userId,case_state:"OH",county:"Wood",
  court_name:"Wood County Court of Common Pleas",court_type:"court-of-common-pleas",
  case_number:"TEST-DIGITAL-001",outcome:"conviction",
  disposition_date:"2020-01-01",final_discharge_date:"2021-01-01",
  primary_charge:"SAMPLE",metadata:{source:"synthetic"}
};
const charges=[{id:"test-charge",charge_name:"SAMPLE",offense_code:"TEST",offense_level:"F5",flags:{}}];
const review={
  user_id:userId,case_id:caseId,status:"approved",form_type:"sealing-conviction",
  case_snapshot_sha256:caseReviewFingerprint(savedCase,charges),
  signed_pdf_sha256:"a".repeat(64),
  signed_pdf_private_path:"private/packets/"+caseId+"/signed.pdf",
  reviewer_id:"synthetic-reviewer",reviewed_at:new Date().toISOString(),
  identity_verified:true,official_docket_verified:true,all_charges_verified:true,
  final_discharge_verified:true,statutory_exclusions_reviewed:true,
  filing_instructions_verified:true,exact_court_form_verified:true,
  applicant_signature_verified:true,filing_authorization_verified:true,
  approved_court_fee_cents:10000,fee_payment_method:"lob_check"
};
const inputs={userId,caseId,savedCase,charges,review,
  runtime:{stripeLiveEnabled:true,lobLiveEnabled:false,lobVerifiedBank:false,
    onlineCourtPaymentVerified:false}};

test("approved digital-only case is $50 and cannot charge or dispatch court fee",()=>{
  const digital=evaluatePacketRelease({...inputs,deliveryMode:"digital"});
  assert.equal(digital.ready,true,JSON.stringify(digital.missing));
  assert.equal(digital.fulfillmentMode,"digital_only");
  assert.equal(digital.quote.totalCents,5000);
  assert.equal(digital.quote.courtFeeCents,10000);
  assert.equal(digital.quote.courtFeeCollectedCents,0);
  assert.equal(digital.quote.directCourtPaymentRequired,true);
  const mailed=evaluatePacketRelease(inputs);
  assert.equal(mailed.ready,false);
  assert.match(mailed.missing.join(" "),/clerk has not confirmed/i);
});

test("digital-only checkout still refuses missing review, changed charges and unsigned packets",()=>{
  for(const altered of [
    {review:null},
    {review:{...review,applicant_signature_verified:false}},
    {review:{...review,filing_authorization_verified:false}},
    {review:{...review,case_snapshot_sha256:"b".repeat(64)}},
    {charges:[{...charges[0],offense_code:"DIFFERENT"}]},
    {runtime:{...inputs.runtime,stripeLiveEnabled:false}}
  ]){
    const result=evaluatePacketRelease({...inputs,...altered,deliveryMode:"digital"});
    assert.equal(result.ready,false);
  }
});

test("server separates live digital checkout from Lob and charges exactly one $50 line item",()=>{
  const server=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const checkout=server.slice(server.indexOf('app.post("/api/create-checkout-session"'),server.indexOf('app.get("/api/find-packet"'));
  const webhook=server.slice(server.indexOf('async function reconcilePaidPacketCheckout'),server.indexOf('app.post("/api/recordwatch/stripe-webhook"'));
  assert.match(server,/RECORDPATH_DIGITAL_PACKET_CHECKOUT_ENABLED==="true"/);
  assert.match(checkout,/fulfillment_mode==="digital_only"/);
  assert.match(checkout,/release\.fulfillmentMode!=="digital_only"/);
  assert.match(checkout,/release\.fulfillmentMode==="digital_only" \? 0/);
  assert.doesNotMatch(checkout,/payment_method_types\s*:/);
  assert.doesNotMatch(checkout,/ui_mode\s*:/);
  assert.match(webhook,/\["lob_check","court_online","no_fee","digital_only"\]/);
  assert.match(webhook,/method==="digital_only" && \(fee!==0 \|\| current\.amount_total!==PACKET_PRICE_CENTS\)/);
  const dispatch=server.slice(server.indexOf('app.post("/api/operator/packet/dispatch-lob"'));
  assert.match(dispatch,/job\.payment_method!=="lob_check"/);
});

test("signed Stripe digital receipt binds one owner, case and exactly $50",()=>{
  const receipt={
    id:"cs_live_SYNTHETIC",status:"complete",payment_status:"paid",
    currency:"usd",amount_total:5000,
    metadata:{
      productType:"record-sealing-packet",fulfillmentMode:"digital_only",
      userId,case_id:caseId,saved_case_id:caseId,
      serviceFeeCents:"5000",courtFeeCents:"0"
    }
  };
  assert.equal(verifiedPacketSession(receipt,userId,caseId),true);
  assert.equal(verifiedPacketSession(receipt,"33333333-3333-4333-8333-333333333333",caseId),false);
  assert.equal(verifiedPacketSession(receipt,userId,"33333333-3333-4333-8333-333333333333"),false);
  assert.equal(verifiedPacketSession({...receipt,metadata:{...receipt.metadata,courtFeeCents:"100"}},userId,caseId),false);
  assert.equal(verifiedPacketSession({...receipt,amount_total:15000},userId,caseId),false);
});

test("customer digital checkout and self-file court fee disclosure are explicit",()=>{
  const html=fs.readFileSync(new URL("../packet.html",import.meta.url),"utf8");
  assert.match(html,/fulfillment_mode: "digital_only"/);
  assert.match(html,/delivery=digital/);
  assert.match(html,/Digital packet checkout: \$50/);
  assert.match(html,/this checkout does not pay it or file the application/);
});
