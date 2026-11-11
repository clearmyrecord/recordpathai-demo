import test from "node:test";
import assert from "node:assert/strict";
import { verifyLivePacketPaymentForLob } from "../src/lob-dispatch-payment-guard.js";

const user = "11111111-1111-4111-8111-111111111111";
const savedCase = "22222222-2222-4222-8222-222222222222";
const job = { user_id:user, case_id:savedCase,
  stripe_session_id:"cs_live_abc123", court_fee_cents:10000 };
function valid() {
  const session = {
    id:job.stripe_session_id, livemode:true, mode:"payment",
    status:"complete",payment_status:"paid",currency:"usd",
    amount_total:15000,
    metadata:{productType:"record-sealing-packet",userId:user,
      saved_case_id:savedCase,serviceFeeCents:"5000",
      courtFeeCents:"10000",fulfillmentMode:"lob_check"},
    payment_intent:{
      id:"pi_abc", livemode:true, status:"succeeded",currency:"usd",
      amount:15000, amount_received:15000,
      latest_charge:{id:"ch_abc",payment_intent:"pi_abc",livemode:true,
        paid:true,status:"succeeded",amount:15000,currency:"usd",
        amount_refunded:0,refunded:false,disputed:false}
    }
  };
  return session;
}
test("accepts a verified $50 preparation + $100 court deposit payment",()=>{
  assert.equal(verifyLivePacketPaymentForLob(valid(),job).ok,true);
});
test("blocks test-mode and unpaid sessions, missing expanded charge",()=>{
  for(const change of [
    s=>s.livemode=false, s=>s.id="cs_test_abc",s=>s.payment_status="unpaid",
    s=>s.payment_intent.latest_charge="ch_abc",
    s=>s.payment_intent.status="requires_action"
  ]){const s=valid();change(s);assert.equal(verifyLivePacketPaymentForLob(s,job).ok,false);}
});
test("blocks refunds, disputes, and partial refunds",()=>{
  for(const change of [
    s=>s.payment_intent.latest_charge.refunded=true,
    s=>s.payment_intent.latest_charge.disputed=true,
    s=>s.payment_intent.latest_charge.amount_refunded=100,
  ]){const s=valid();change(s);assert.equal(verifyLivePacketPaymentForLob(s,job).ok,false);}
});
test("blocks wrong case, payment amounts, court fee, and payment intent",()=>{
  for(const change of [
    s=>s.metadata.saved_case_id="33333333-3333-4333-8333-333333333333",
    s=>s.amount_total=5000,
    s=>s.metadata.courtFeeCents="0",
    s=>s.metadata.fulfillmentMode="court_online",
    s=>s.payment_intent.amount_received=14000,
    s=>s.payment_intent.latest_charge.payment_intent="pi_other",
  ]){const s=valid();change(s);assert.equal(verifyLivePacketPaymentForLob(s,job).ok,false);}
});
