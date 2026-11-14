// Offline HTTP integration of the ACTUAL production webhook route. This test
// uses a synthetically signed Stripe event and an in-memory PostgREST stub.
// It must never contact Stripe, Supabase, Lob, a court, or production.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import express from "express";
import Stripe from "stripe";
import {verifiedPacketSession,PACKET_PRICE_CENTS} from "../src/payment-security.js";
import {validCaseId} from "../src/packet-release.js";

const source=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const reconcilerStart=source.indexOf("async function reconcilePaidPacketCheckout(session,res){");
const reconcilerEnd=source.indexOf("// Stripe requires the original raw body",reconcilerStart);
const routeStart=source.indexOf('app.post("/api/stripe/webhook"');
const routeEnd=source.indexOf('app.post("/api/packet/private-upload"',routeStart);
assert.ok(reconcilerStart>0 && reconcilerEnd>reconcilerStart);
assert.ok(routeStart>reconcilerEnd && routeEnd>routeStart);
const realReconcilerSource=source.slice(reconcilerStart,reconcilerEnd);
const realWebhookSource=source.slice(routeStart,routeEnd);
assert.match(realWebhookSource,/express\.raw\(\{type:"application\/json"/);
assert.match(realWebhookSource,/stripe\.webhooks\.constructEvent/);
assert.doesNotMatch(realWebhookSource+realReconcilerSource,/api\.lob\.com|buildCourtCheckRequest|dispatch-lob/);

const userId="a1111111-1111-4111-8111-111111111111";
const caseId="b2222222-2222-4222-8222-222222222222";
const sessionId="cs_live_SignedOfflinePacketContract001";
const syntheticSecret="whsec_OFFLINE_TEST_ONLY_NEVER_PRODUCTION";
const baseSession={
  id:sessionId,livemode:true,status:"complete",payment_status:"paid",
  currency:"usd",amount_total:15000,
  metadata:{
    productType:"record-sealing-packet",
    userId,saved_case_id:caseId,
    courtFeeCents:"10000",serviceFeeCents:"5000",fulfillmentMode:"lob_check"
  }
};
function eventFor(session=baseSession,type="checkout.session.completed"){
  return {id:"evt_SYNTHETIC_NEVER_STRIPE",object:"event",
    livemode:true,type,
    data:{object:{id:session.id,status:session.status,
      payment_status:session.payment_status,livemode:true,
      metadata:session.metadata}}};
}

async function harness(t,session=baseSession){
  const app=express();
  const realSdk=new Stripe("sk_test_OFFLINE_ONLY_NO_NETWORK");
  const rows=new Map();
  const writes=[];
  const lookups=[];
  const affiliateCalls=[];
  let current={...session,metadata:{...session.metadata}};
  let failLookup=false;
  // Distinct mocked boundary, shared production reconciler and webhook source.
  const stripe={
    webhooks:realSdk.webhooks,
    checkout:{sessions:{retrieve:async id=>{
      lookups.push(id);
      if(failLookup)throw Error("Simulated provider outage");
      assert.equal(id,sessionId);
      return current;
    }}}
  };
  const supabaseRest=async(table,request)=>{
    if(table!=="packet_fulfillment_jobs")throw Error("Unexpected table "+table);
    assert.equal(request.method,"POST");
    assert.match(request.query,/on_conflict=stripe_session_id/);
    assert.match(request.prefer,/resolution=ignore-duplicates/);
    const body=request.body;
    writes.push(body);
    if(!rows.has(body.stripe_session_id)){
      rows.set(body.stripe_session_id,{id:"synthetic-row-only",...body});
      return [rows.get(body.stripe_session_id)];
    }
    return [];
  };
  const context=vm.createContext({
    app,express,stripe,supabaseRest,
    packetDatabaseReady:()=>true,
    verifiedPacketSession,validCaseId,PACKET_PRICE_CENTS,
    recordAffiliateCommission:async(...args)=>{affiliateCalls.push(args);},
    voidAffiliateCommission:async()=>{},
    process:{env:{STRIPE_WEBHOOK_SECRET:syntheticSecret}},
    console:{warn:()=>{}}
  });
  vm.runInContext(realReconcilerSource+"\n"+realWebhookSource,context,
    {filename:"production-packet-webhook-isolated.mjs"});
  const server=app.listen(0,"127.0.0.1");
  await new Promise(resolve=>server.once("listening",resolve));
  t.after(()=>new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
  }));
  const url="http://127.0.0.1:"+server.address().port+"/api/stripe/webhook";
  async function send(event,{tamper=false,invalidSignature=false}={}){
    const payload=JSON.stringify(event);
    const signature=realSdk.webhooks.generateTestHeaderString({
      payload,secret:syntheticSecret
    });
    const wire=tamper?payload.replace("evt_SYNTHETIC_NEVER_STRIPE","evt_TAMPERED"):payload;
    const response=await fetch(url,{method:"POST",
      headers:{"content-type":"application/json",
        "stripe-signature":invalidSignature?"t=1,v1=invalid":signature},
      body:wire});
    return {status:response.status,body:await response.json()};
  }
  return {send,rows,writes,lookups,affiliateCalls,setSession:s=>{current=s;},
    failLookup:()=>{failLookup=true;}};
}

test("cryptographically signed HTTP event creates one paid_hold and zero mail",async t=>{
  const h=await harness(t);
  const first=await h.send(eventFor());
  assert.equal(first.status,200);
  assert.equal(first.body.status,"paid_hold");
  assert.equal(first.body.product,"record-sealing-packet");
  assert.equal(h.rows.size,1);
  assert.equal(h.rows.get(sessionId).status,"paid_hold");
  assert.equal(h.rows.get(sessionId).user_id,userId);
  assert.equal(h.rows.get(sessionId).case_id,caseId);
  assert.equal(h.rows.get(sessionId).court_fee_cents,10000);
  assert.equal(h.rows.get(sessionId).payment_method,"lob_check");
  assert.deepEqual(h.lookups,[sessionId]);
  // The webhook has no Lob dependency; no network API to Lob is supplied.
  const replay=await h.send(eventFor());
  assert.equal(replay.status,200);
  assert.equal(replay.body.status,"paid_hold");
  assert.equal(h.rows.size,1,"unique session key prevents duplicate fulfillment");
  assert.equal(h.writes.length,2,"duplicate delivery is an upsert-ignore, not dispatch");
});

test("invalid Stripe signature and modified body cannot create paid_hold",async t=>{
  const h=await harness(t);
  assert.equal((await h.send(eventFor(),{invalidSignature:true})).status,400);
  assert.equal((await h.send(eventFor(),{tamper:true})).status,400);
  assert.equal(h.lookups.length,0);
  assert.equal(h.rows.size,0);
});

test("unsigned, unpaid, test-session, and mispriced cases never enqueue",async t=>{
  const h=await harness(t);
  const wrongCases=[
    {...baseSession,payment_status:"unpaid"},
    {...baseSession,status:"open"},
    {...baseSession,livemode:false},
    {...baseSession,id:"cs_test_ShouldBeRejected"},
    {...baseSession,currency:"eur"},
    {...baseSession,amount_total:14999},
    {...baseSession,metadata:{...baseSession.metadata,userId:"not-a-uuid"}},
    {...baseSession,metadata:{...baseSession.metadata,serviceFeeCents:"4900"}},
    {...baseSession,metadata:{...baseSession.metadata,fulfillmentMode:"invalid"}}
  ];
  for(const [index,session] of wrongCases.entries()){
    h.setSession(session);
    const event=eventFor({...session,id:sessionId});
    const result=await h.send(event);
    assert.ok([200,400].includes(result.status),"rejected index "+index);
    assert.equal(h.rows.size,0,"should not insert index "+index);
  }
  h.setSession({...baseSession});
  const testEvent=eventFor({...baseSession,id:"cs_test_SignedSandboxEvent"});
  const result=await h.send(testEvent);
  assert.equal(result.status,400,"production webhook must reject Stripe test IDs");
  assert.equal(h.rows.size,0);
});

test("other products and non-checkout events are ignored",async t=>{
  const h=await harness(t);
  const other=eventFor({...baseSession,metadata:{productType:"premium_recordwatch"}});
  const result=await h.send(other);
  assert.equal(result.status,200);
  assert.equal(result.body.ignored,true);
  const ignored=await h.send(eventFor(baseSession,"invoice.paid"));
  assert.equal(ignored.status,200);
  assert.equal(h.rows.size,0);
  assert.equal(h.lookups.length,0);
});

test("provider outage returns retryable 503 and no fulfillment record",async t=>{
  const h=await harness(t);
  h.failLookup();
  const result=await h.send(eventFor());
  assert.equal(result.status,503);
  assert.equal(h.rows.size,0);
  assert.match(result.body.error,/will retry/);
});
