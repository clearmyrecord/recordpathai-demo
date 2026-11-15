import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import vm from "node:vm";
import {
  lifetimeCaseEntitled, lifetimeCasePurchaseAvailable, lifetimePurchaseGeneration,
  RECORDWATCH_LIFETIME_CENTS
} from "../src/recordwatch-lifetime.js";

const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../recordwatch-dashboard.html",import.meta.url),"utf8");
const userId="11111111-1111-4111-8111-111111111111";
const caseId="33333333-3333-4333-8333-333333333333";
const before={id:"55555555-5555-4555-8555-555555555555",user_id:userId,
  saved_case_id:caseId,plan:"lifetime_case",status:"refunded",
  stripe_checkout_session_id:"cs_test_previous",stripe_payment_intent_id:"pi_test_previous",
  currency:"usd",amount_cents:3900,revoked_at:"2026-11-14T22:15:00.000Z"};
const now={...before,status:"active",revoked_at:null};
const newSession={id:"cs_test_newcheckout",created:1794702000,
  payment_intent:"pi_test_newcheckout",customer:"cus_test_rebuyer",
  metadata:{user_id:userId,saved_case_id:caseId}};
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value||""));

test("refund revokes paid access but makes a subsequent purchase available",()=>{
  assert.equal(lifetimeCaseEntitled(now,caseId),true);
  assert.equal(lifetimeCasePurchaseAvailable(now,caseId),false);
  assert.equal(lifetimeCaseEntitled(before,caseId),false);
  assert.equal(lifetimeCasePurchaseAvailable(before,caseId),true);
  assert.equal(lifetimeCasePurchaseAvailable({...before,status:"disputed"},caseId),true);
  assert.equal(lifetimeCasePurchaseAvailable(null,caseId),true);
  assert.equal(lifetimeCasePurchaseAvailable(before,"other-case"),false);
});

test("new purchase after refund uses a NEW Stripe idempotency key even within same time bucket",()=>{
  const bucket=654321;
  const key=row=>createHash("sha256").update(
    "recordwatch-lifetime:"+userId+":"+caseId+":"+
    lifetimePurchaseGeneration(row,caseId)+":"+bucket).digest("hex");
  assert.notEqual(key(now),key(before));
  assert.equal(key(before),key({...before}));
  assert.notEqual(key(before),key({...before,
    stripe_checkout_session_id:"cs_test_second",revoked_at:"2026-11-15T06:00:00.000Z"}));
  const checkout=server.slice(server.indexOf('app.post("/api/recordwatch/checkout"'),
    server.indexOf('app.post("/api/recordwatch/verify-checkout"'));
  assert.match(checkout,/lifetimeCasePurchaseAvailable\(current,savedCaseId\)/);
  assert.match(checkout,/lifetimePurchaseGeneration\(current,savedCaseId\)/);
  assert.match(checkout,/generation\+":"\+bucket/);
});

function simulateUpsert({existing=before,updatedRows,latest}={}){
  const first=server.indexOf("async function upsertRecordwatchLifetimeCase(session){");
  const last=server.indexOf("// One verified Stripe subscription =>",first);
  assert.ok(first>=0&&last>first);
  const fragment=server.slice(first,last);
  const calls={writes:[],refunds:[],queries:0};
  const context={
    RECORDWATCH_LIFETIME_CENTS,isUuid:uuid,lifetimeCaseEntitled,Date,
    getRecordwatchLifetimeCase:async()=>{calls.queries++;
      return calls.queries===1?existing:(latest||existing);},
    recordwatchStripe:{refunds:{create:async(...args)=>{calls.refunds.push(args);
      return {id:"re_test_duplicate"};}}},
    supabaseRest:async(table,args)=>{calls.writes.push({table,args});
      return updatedRows!==undefined?updatedRows:[{...existing,...args.body}];},
    encodeURIComponent
  };
  const upsert=vm.runInNewContext(fragment+"\nupsertRecordwatchLifetimeCase",context);
  return {calls,upsert};
}

test("refunded session is not reactivated by replay of its old Stripe event",async()=>{
  const {calls,upsert}=simulateUpsert();
  const result=await upsert({...newSession,
    id:before.stripe_checkout_session_id,payment_intent:before.stripe_payment_intent_id});
  assert.equal(result.status,"refunded");
  assert.equal(calls.writes.length,0);
});

test("a newly paid purchase can replace only the matching refunded database row",async()=>{
  const {calls,upsert}=simulateUpsert();
  const result=await upsert(newSession);
  assert.equal(result.status,"active");
  assert.equal(result.revoked_at,null);
  assert.equal(result.stripe_checkout_session_id,newSession.id);
  assert.equal(result.stripe_payment_intent_id,newSession.payment_intent);
  assert.equal(calls.writes.length,1);
  const patch=calls.writes[0];
  assert.equal(patch.table,"recordwatch_lifetime_cases");
  assert.equal(patch.args.method,"PATCH");
  assert.match(patch.args.query,/stripe_checkout_session_id=eq.cs_test_previous/);
  assert.equal(calls.refunds.length,0);
});

test("two paid checkouts for an already active case do not double-sell Premium",async()=>{
  const {calls,upsert}=simulateUpsert({existing:now});
  const result=await upsert(newSession);
  assert.equal(result.stripe_checkout_session_id,now.stripe_checkout_session_id);
  assert.equal(calls.writes.length,0);
  assert.equal(calls.refunds.length,1);
  assert.equal(calls.refunds[0][0].payment_intent,newSession.payment_intent);
});

test("concurrent repurchase does not overwrite a different new active purchase",async()=>{
  const another={...now,stripe_checkout_session_id:"cs_test_alreadynew",
    stripe_payment_intent_id:"pi_test_alreadynew"};
  const {calls,upsert}=simulateUpsert({updatedRows:[],latest:another});
  const result=await upsert(newSession);
  assert.equal(result.stripe_checkout_session_id,another.stripe_checkout_session_id);
  assert.equal(calls.refunds.length,1);
});

test("late old-charge refund cannot revoke a repurchased case",()=>{
  const webhook=server.slice(server.indexOf('app.post("/api/recordwatch/stripe-webhook"'),
    server.indexOf('app.post("/api/recordwatch/stripe-webhook"')+8000);
  assert.match(webhook,/stripe_payment_intent_id=eq/);
  assert.match(webhook,/status=eq.active/);
  assert.match(server,/previous_purchase_status:lifetime/);
});

test("refunded customers see a clear repurchase button and the original payment gate remains",()=>{
  assert.match(dashboard,/Premium available — previous purchase refunded/);
  assert.match(dashboard,/Purchase Premium again — \$39/);
  assert.match(dashboard,/premiumState\.previousPurchaseStatus = results\[0\]\.previous_purchase_status/);
  assert.match(dashboard,/purchase_terms_acknowledged:true/);
  assert.match(dashboard,/RecordWatchNotifications\.checkoutPremium\('lifetime_case'/);
});
