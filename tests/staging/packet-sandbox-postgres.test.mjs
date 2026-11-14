import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import pg from "pg";
import {createPacketSandboxWebhookApp} from "../../src/packet-sandbox-webhook.js";

const db=new pg.Pool({connectionString:process.env.RPAI_SANDBOX_DATABASE_URL});
const sdk=new Stripe("sk_test_SYNTHETIC_NO_NETWORK");
const secret="whsec_LOCAL_TEST_SIGNATURE_ONLY";
const userId="a1111111-1111-4111-8111-111111111111";
const caseId="b2222222-2222-4222-8222-222222222222";
const stripeId="cs_test_SyntheticPacketOne";
const session={
  id:stripeId,livemode:false,mode:"payment",status:"complete",
  payment_status:"paid",currency:"usd",amount_total:15000,
  metadata:{sandboxOnly:"true",productType:"record-sealing-packet",
    userId,saved_case_id:caseId,serviceFeeCents:"5000",
    courtFeeCents:"10000",fulfillmentMode:"lob_check"}
};
let current=session, fail=false, requests=0;
const stripe={
  webhooks:sdk.webhooks,
  checkout:{sessions:{retrieve:async id=>{
    requests++;
    if(fail)throw Error("synthetic provider outage");
    assert.equal(id,stripeId);
    return current;
  }}}
};
const app=createPacketSandboxWebhookApp({stripeClient:stripe,db,signingSecret:secret});
const server=app.listen(0,"127.0.0.1");
await new Promise(resolve=>server.once("listening",resolve));
const url="http://127.0.0.1:"+server.address().port+"/stripe/packet-sandbox-webhook";
const event=(overrides={})=>({
  id:"evt_SYNTHETIC0001",object:"event",type:"checkout.session.completed",
  livemode:false,data:{object:{...session,...overrides}}
});
async function post(obj,{tamper=false,invalid=false}={}){
  const payload=JSON.stringify(obj);
  const sig=sdk.webhooks.generateTestHeaderString({payload,secret});
  const response=await fetch(url,{method:"POST",
    headers:{"content-type":"application/json","stripe-signature":invalid?"bad":sig},
    body:tamper?payload.replace("evt_SYNTHETIC0001","evt_CHANGED"):payload});
  return {status:response.status,body:await response.json()};
}
async function count(){return (await db.query("SELECT * FROM packet_sandbox_paid_holds")).rows;}
test.after(async()=>{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  await db.end();
});
test("real PostgreSQL stores one paid_hold for signed event, never dispatch",async()=>{
  assert.equal((await db.query("SELECT current_database() AS db")).rows[0].db,"recordpathai_packet_sandbox");
  assert.deepEqual(await count(),[]);
  const r=await post(event());
  assert.equal(r.status,200);
  assert.equal(r.body.status,"paid_hold");
  let rows=await count();
  assert.equal(rows.length,1);
  assert.equal(rows[0].stripe_session_id,stripeId);
  assert.equal(rows[0].status,"paid_hold");
  assert.equal(rows[0].court_fee_cents,10000);
  assert.equal(rows[0].payment_method,"lob_check");
  assert.equal(rows[0].lob_check_id,undefined);
  assert.equal((await post(event())).status,200);
  rows=await count();
  assert.equal(rows.length,1,"Unique database constraint holds after replay");
});
test("forged, wrong amount, unpaid, nonpacket, provider outage never create rows",async()=>{
  await db.query("TRUNCATE packet_sandbox_paid_holds");
  assert.equal((await post(event(),{invalid:true})).status,400);
  assert.equal((await post(event(),{tamper:true})).status,400);
  current={...session,amount_total:14999};
  assert.equal((await post(event())).status,400);
  current={...session,payment_status:"unpaid"};
  assert.equal((await post(event())).body.pending_payment,true);
  current=session;
  const other=await post(event({metadata:{productType:"premium_recordwatch"}}));
  assert.equal(other.body.ignored,true);
  fail=true;
  assert.equal((await post(event())).status,503);
  assert.equal((await count()).length,0);
  assert.ok(requests>=4);
});
