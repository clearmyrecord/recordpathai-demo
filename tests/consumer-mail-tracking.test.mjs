import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {consumerTrackingSnapshot,checkConsumerTracking} from "../src/consumer-mail-tracking.js";
import {projectPacketFulfillment} from "../src/packet-fulfillment-tracking.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const job={status:"submitted_to_lob",user_id:"fixture-user",case_id:"fixture-case",stripe_session_id:"cs_live_fixture",court_fee_cents:10000,payment_method:"lob_check",lob_check_id:"chk_fixture"};
const timeline=projectPacketFulfillment({job});
const paid={id:"cs_live_fixture",mode:"payment",livemode:true,status:"complete",payment_status:"paid",currency:"usd",amount_total:15000,metadata:{productType:"record-sealing-packet",userId:job.user_id,saved_case_id:job.case_id,serviceFeeCents:"5000",courtFeeCents:"10000",fulfillmentMode:"lob_check"},payment_intent:{id:"pi_fixture",livemode:true,status:"succeeded",currency:"usd",amount:15000,amount_received:15000,latest_charge:{payment_intent:"pi_fixture",livemode:true,paid:true,status:"succeeded",currency:"usd",amount:15000,amount_refunded:0,refunded:false,disputed:false}}};
const stripe={checkout:{sessions:{retrieve:async(id,opts)=>{assert.equal(id,job.stripe_session_id);assert.deepEqual(opts.expand,["payment_intent.latest_charge"]);return paid;}}}};
test("saved order summary never implies fresh Stripe or postal verification",()=>{
 const r=consumerTrackingSnapshot(timeline);
 assert.equal(r.providerStatus,"not_checked");assert.equal(r.paymentCheck,"recorded");assert.equal(r.lobReference,"chk_fixture");assert.equal(r.latestEvent,null);
 const empty=consumerTrackingSnapshot(projectPacketFulfillment());
 assert.equal(empty.paymentCheck,"not_recorded");assert.equal(empty.providerStatus,"not_applicable");
});
test("live verification reads matching check receipt and chronological recognized events only",async()=>{
 const result=await checkConsumerTracking(timeline,job,{stripe,env:{LOB_LIVE_API_KEY:"live_fixture"},network:async(url,options)=>{
  assert.equal(url,"https://api.lob.com/v1/checks/chk_fixture");assert.equal(options.method,undefined);
  return {ok:true,json:async()=>({id:"chk_fixture",status:"rendered",expected_delivery_date:"2026-12-01",tracking_events:[{type:"check.delivered",time:"2026-12-01T12:00:00Z",address:"private"},{name:"In Transit",time:"2026-11-29T12:00:00Z"},{name:"Unknown",time:"2026-12-02T12:00:00Z"}]})};
 }});
 assert.equal(result.paymentCheck,"verified");assert.equal(result.providerStatus,"checked");assert.equal(result.latestEvent.name,"Delivered");assert.equal(result.providerEvents.length,2);assert.equal(result.providerEvents[1].address,undefined);assert.equal(result.expectedDeliveryDate,"2026-12-01");
 assert.equal(timeline.court_receipt_verified,false);assert.equal(timeline.delivered_verified,false);
});
test("refunds, mismatched provider IDs, and unavailable keys cannot imply verified payment or delivery",async()=>{
 const refunded={...paid,payment_intent:{...paid.payment_intent,latest_charge:{...paid.payment_intent.latest_charge,refunded:true,amount_refunded:15000}}};
 const r=await checkConsumerTracking(timeline,job,{stripe:{checkout:{sessions:{retrieve:async()=>refunded}}},env:{LOB_LIVE_API_KEY:"live_fixture"},network:async()=>({ok:true,json:async()=>({id:"chk_other",tracking_events:[{name:"Delivered",time:"2026-12-01T00:00:00Z"}]})})});
 assert.equal(r.paymentCheck,"not_verified");assert.equal(r.providerStatus,"unavailable");assert.equal(r.latestEvent,null);
 const noKey=await checkConsumerTracking(timeline,job,{stripe,env:{},network:async()=>{throw Error("must not request")}});
 assert.equal(noKey.providerStatus,"unavailable");
});
test("qualifying no-fee letters and digital applications remain separate from conviction checks",async()=>{
 const letter={...job,payment_method:"no_fee",court_fee_cents:0,lob_check_id:null,lob_letter_id:"ltr_fixture"};
 const r=await checkConsumerTracking(projectPacketFulfillment({job:letter}),letter,{env:{LOB_LIVE_API_KEY:"live_fixture"},network:async url=>{assert.equal(url,"https://api.lob.com/v1/letters/ltr_fixture");return {ok:true,json:async()=>({id:"ltr_fixture"})};}});
 assert.equal(r.providerStatus,"checked");assert.equal(r.lobReference,"ltr_fixture");
 const digital={...job,payment_method:"digital_only",status:"manual_filing",court_fee_cents:0,lob_check_id:null};
 const d=await checkConsumerTracking(projectPacketFulfillment({job:digital}),digital,{env:{},network:async()=>{throw Error("must not request")}});
 assert.equal(d.lobReference,null);assert.equal(d.providerStatus,"not_applicable");
});
test("both dashboards mount the same read-only component and existing tracker requests live status",()=>{
 for(const p of ["dashboard.html","recordwatch-dashboard.html"])assert.match(read(p),/consumer-mail-tracking\.js/);
 assert.match(read("js/saved-case-cards.js"),/RecordPathConsumerMailTracking\?\.mountCards/);
 assert.match(read("recordwatch-dashboard.html"),/RecordPathConsumerMailTracking\?\.mountCards\(casesContainer\)/);
 assert.match(read("js/recordwatch-filing-tracker.js"),/&live=1/);
 const server=read("server.js"),start=server.indexOf('app.get("/api/packet/filing-status"'),end=server.indexOf('app.get("/api/packet/checkout-readiness"',start);
 const route=server.slice(start,end);
 assert.match(route,/await getSavedCaseReviewFacts\(user\.id,caseId\)/);
 assert.match(route,/job\.user_id!==user\.id\|\|job\.case_id!==caseId/);
 assert.match(route,/checkConsumerTracking\(timeline,job,\{stripe\}\)/);
 assert.doesNotMatch(route,/stripe\.checkout\.sessions\.create|method:"PATCH"|method:"POST"/);
});
