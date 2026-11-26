import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Stripe from "stripe";
import {readFileSync} from "node:fs";

test("dedicated test webhook verifies the signed bytes and routes only paid test packets",async t=>{
  const source=readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const route=source.slice(source.indexOf('app.post("/api/packet/sandbox-stripe-webhook"'),source.indexOf("app.use(express.json());"));
  const app=express(), calls=[];
  const secret="whsec_test_contract_only";
  new Function("app","express","Stripe","process","reconcileSandboxProof",route)(
    app,express,Stripe,{env:{STRIPE_TEST_SECRET_KEY:"sk_test_contract",STRIPE_TEST_PACKET_WEBHOOK_SECRET:secret}},
    (id,res,eventId)=>{calls.push([id,eventId]);res.json({received:true});});
  const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const object={id:"cs_test_contract",livemode:false,payment_status:"paid",
    metadata:{productType:"packet-sandbox-simulation",lobProof:"wood-conviction-v1"}};
  const event={id:"evt_contract",livemode:false,type:"checkout.session.completed",data:{object}};
  const stripe=new Stripe("sk_test_contract");
  async function send(event,key=secret){
    const payload=JSON.stringify(event);
    return fetch("http://127.0.0.1:"+server.address().port+"/api/packet/sandbox-stripe-webhook",{
      method:"POST",headers:{"Content-Type":"application/json","Stripe-Signature":
        stripe.webhooks.generateTestHeaderString({payload,secret:key})},body:payload});
  }
  assert.equal((await send(event,"whsec_wrong")).status,400);
  for(const other of [{...event,livemode:true},{...event,type:"payment_intent.succeeded"},
    {...event,data:{object:{...object,payment_status:"unpaid"}}}]){
    assert.equal((await (await send(other)).json()).ignored,true);
  }
  assert.deepEqual(calls,[]);
  assert.equal((await send(event)).status,200);
  assert.deepEqual(calls,[[object.id,event.id]]);
});
