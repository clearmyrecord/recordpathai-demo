import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RECORDWATCH_LIFETIME_CENTS, assertRecordwatchLifetimePrice,
  paidRecordwatchLifetimeCheckout, lifetimeCaseEntitled
} from "../src/recordwatch-lifetime.js";
import {
  isPremiumAlertAllowed, neutralAlertContent, reminderForDate,
  validSmsPhone
} from "../src/recordwatch-alerts.js";
import { sendPremiumEmail, sendPremiumSms } from "../src/recordwatch-alert-dispatch.js";

const source = readFileSync(new URL("../server.js",import.meta.url),"utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const caseId = "33333333-3333-4333-8333-333333333333";
const otherCaseId = "44444444-4444-4444-8444-444444444444";
const priceId = "price_test_lifetime_39";
const intentId = "pi_test_sandbox_1234";
const checkoutId = "cs_test_sandbox_1234";
const makeCheckout = () => ({
  id:checkoutId,mode:"payment",status:"complete",payment_status:"paid",
  amount_total:3900,currency:"usd",payment_intent:intentId,
  client_reference_id:owner,
  metadata:{product:"premium_recordwatch_lifetime",plan:"lifetime_case",
    user_id:owner,saved_case_id:caseId,price_id:priceId}
});
const paidRow = () => ({
  user_id:owner,saved_case_id:caseId,plan:"lifetime_case",status:"active",
  revoked_at:null,amount_cents:3900,currency:"usd",
  stripe_checkout_session_id:checkoutId,stripe_payment_intent_id:intentId
});
const prefs = () => ({
  user_id:owner,saved_case_id:caseId,email_enabled:false,email_opted_in_at:null,
  sms_enabled:false,sms_consent_at:null,phone_number:null,sms_opted_out_at:null
});
function maySend({lifetime=paidRow(),preferences=prefs(),channel="email",
  stripePaymentVerified=false,suppressed=false}={}) {
  // Same fail-closed conditions the live sendCasePremiumAlert handler enforces.
  return isPremiumAlertAllowed({lifetime,caseId,channel,prefs:preferences,
    phoneSuppressed:suppressed}) && stripePaymentVerified===true;
}

test("only valid one-time $39 paid Stripe Checkout qualifies for the saved-case entitlement",()=>{
  const price={id:priceId,active:true,type:"one_time",recurring:null,
    billing_scheme:"per_unit",currency:"usd",unit_amount:3900};
  assert.equal(RECORDWATCH_LIFETIME_CENTS,3900);
  assert.equal(assertRecordwatchLifetimePrice(price),priceId);
  assert.equal(paidRecordwatchLifetimeCheckout(makeCheckout(),owner,caseId,priceId),true);
  for (const override of [
    {status:"open"},{payment_status:"unpaid"},{mode:"subscription"},
    {currency:"eur"},{amount_total:100},{payment_intent:null},
    {client_reference_id:otherOwner},
    {metadata:{...makeCheckout().metadata,saved_case_id:otherCaseId}},
    {metadata:{...makeCheckout().metadata,price_id:"price_wrong"}}
  ]) {
    assert.equal(paidRecordwatchLifetimeCheckout({...makeCheckout(),...override},
      owner,caseId,priceId),false);
  }
});

test("a valid purchase unlocks only its case and carries no recurring expiry",()=>{
  const entitlement=paidRow();
  assert.equal(lifetimeCaseEntitled(entitlement,caseId),true);
  assert.equal(lifetimeCaseEntitled(entitlement,otherCaseId),false);
  assert.equal(entitlement.plan,"lifetime_case");
  assert.equal("current_period_end" in entitlement,false);
});

test("neither an entitlement row nor a signed payment alone authorizes notification consent",()=>{
  for(const channel of ["email","sms"]){
    assert.equal(maySend({stripePaymentVerified:true,channel}),false);
    assert.equal(maySend({stripePaymentVerified:false,channel}),false);
  }
});

test("verified Stripe payment is checked again immediately before a consented email send",()=>{
  const p={...prefs(),email_enabled:true,email_opted_in_at:"2026-11-14T12:00:00Z"};
  assert.equal(maySend({preferences:p,channel:"email",stripePaymentVerified:false}),false);
  assert.equal(maySend({preferences:p,channel:"email",stripePaymentVerified:true}),true);
  assert.equal(maySend({preferences:{...p,saved_case_id:otherCaseId},
    channel:"email",stripePaymentVerified:true}),false);
  assert.equal(maySend({preferences:{...p,user_id:otherOwner},
    channel:"email",stripePaymentVerified:true}),false);
});

test("a separate SMS consent timestamp, verified US phone, and no STOP are mandatory",()=>{
  const p={...prefs(),sms_enabled:true,phone_number:"+17025551234"};
  assert.equal(maySend({preferences:p,channel:"sms",stripePaymentVerified:true}),false);
  p.sms_consent_at="2026-11-14T12:01:00Z";
  assert.equal(maySend({preferences:p,channel:"sms",stripePaymentVerified:true}),true);
  assert.equal(maySend({preferences:p,channel:"sms",stripePaymentVerified:true,suppressed:true}),false);
  assert.equal(maySend({preferences:{...p,sms_opted_out_at:"2026-11-14T12:02:00Z"},
    channel:"sms",stripePaymentVerified:true}),false);
  assert.equal(maySend({preferences:{...p,phone_number:"+1111111"},
    channel:"sms",stripePaymentVerified:true}),false);
  assert.equal(validSmsPhone(p.phone_number),true);
});

test("refund and charge dispute revoke both channels, even if consent remains",()=>{
  const email={...prefs(),email_enabled:true,email_opted_in_at:"2026-11-14T12:00:00Z"};
  const sms={...prefs(),sms_enabled:true,phone_number:"+17025551234",
    sms_consent_at:"2026-11-14T12:01:00Z"};
  for (const status of ["refunded","disputed"]) {
    const revoked={...paidRow(),status,revoked_at:"2026-11-14T12:03:00Z"};
    assert.equal(lifetimeCaseEntitled(revoked,caseId),false);
    assert.equal(maySend({lifetime:revoked,preferences:email,channel:"email",stripePaymentVerified:true}),false);
    assert.equal(maySend({lifetime:revoked,preferences:sms,channel:"sms",stripePaymentVerified:true}),false);
  }
  // A delayed refund webhook still cannot send if Stripe already reports refund.
  assert.equal(maySend({lifetime:paidRow(),preferences:email,
    channel:"email",stripePaymentVerified:false}),false);
});

test("real handler still performs live Stripe verification after consent and before provider call",()=>{
  const start=source.indexOf("async function sendCasePremiumAlert(");
  const end=source.indexOf("\nasync function runPaidRecordwatchAlerts(",start);
  assert.ok(start>=0 && end>start);
  const body=source.slice(start,end);
  const policy=body.indexOf("isPremiumAlertAllowed(");
  const verification=body.indexOf("verifyPremiumAlertPayment(lifetime)");
  const provider=body.indexOf("sendPremiumEmail(");
  assert.ok(policy>=0 && verification>policy && provider>verification);
  assert.match(body,/recordwatch_sms_suppressions/);
  assert.match(body,/resolution=ignore-duplicates/);
  assert.match(body,/status:"reserved"/);
});

test("provider adapters accept sandbox fake acknowledgements; no network is used",async()=>{
  const env={RECORDWATCH_ALERTS_LIVE_ENABLED:"true",
    RESEND_API_KEY:"re_fake_test_only",RECORDWATCH_EMAIL_FROM:"alerts@recordpathai.com",
    TWILIO_ACCOUNT_SID:"AC"+"a".repeat(32),TWILIO_AUTH_TOKEN:"fake_token",
    TWILIO_MESSAGING_SERVICE_SID:"MG"+"b".repeat(32),
    RECORDWATCH_SMS_CAMPAIGN_APPROVED:"true"};
  let emailCalls=0,smsCalls=0;
  const message=neutralAlertContent("eligibility_reached","email");
  await sendPremiumEmail({to:"sandbox@example.test",subject:message.subject,
    message:message.message,env,fetchFn:async(url,request)=>{
      emailCalls++;assert.match(url,/api.resend.com/);assert.equal(request.method,"POST");
      return {ok:true,json:async()=>({id:"12345678-1234-4000-8000-123456789abc"})};
    }});
  const text=neutralAlertContent("eligibility_reached","sms");
  await sendPremiumSms({to:"+17025551234",message:text.message,env,
    fetchFn:async(url,request)=>{
      smsCalls++;assert.match(url,/api.twilio.com/);assert.equal(request.method,"POST");
      return {ok:true,json:async()=>({sid:"SM"+"a".repeat(32)})};
    }});
  assert.equal(emailCalls,1);
  assert.equal(smsCalls,1);
  assert.match(text.message,/Reply STOP/);
  assert.doesNotMatch(text.message,/arrest|conviction|felony|case number|charge/i);
});

test("eligibility reminders remain milestone-only and cannot send on arbitrary dates",()=>{
  const today="2026-11-14";
  for(const n of [180,90,30,7,0]){
    const when=new Date(Date.parse(today+"T00:00:00Z")+n*864e5).toISOString().slice(0,10);
    assert.ok(reminderForDate(when,today));
  }
  for(const when of ["2026-11-13","2026-11-15","2026-12-15"])
    assert.equal(reminderForDate(when,today),null);
});
