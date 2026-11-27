import test from "node:test";
import assert from "node:assert/strict";
import {projectProfessionalTracking,enrichProfessionalTracking,registerProfessionalMailTracking} from "../src/professional-mail-tracking.js";
import {mailingTrackingLabel} from "../js/professional-mail-tracking.js";
const caseId="00000000-0000-4000-8000-000000000001",org="00000000-0000-4000-8000-000000000002",user="00000000-0000-4000-8000-000000000003",other="00000000-0000-4000-8000-000000000004";
const c={id:caseId,org_id:org,attorney_id:user,court_id:"oh-wood-common-pleas",outcome:"dismissal"};
const o={case_id:caseId,org_id:org,user_id:user,status:"submitted_to_lob",document_id:other,signed_sha:"a".repeat(64),court_fee_cents:0,lob_letter_id:"ltr_fixture",stripe_session_id:"cs_live_fixture",stripe_event_id:"evt_fixture"};
test("saved status is not a postal scan or a confirmed court filing",()=>{
 assert.equal(projectProfessionalTracking(c,null).status,"not_started");
 assert.equal(projectProfessionalTracking({...c,court_id:"review-only"},null).status,"unsupported");
 const result=projectProfessionalTracking(c,o);
 assert.equal(result.payment,"verified_recorded");assert.equal(result.providerStatus,"not_checked");
 assert.equal(mailingTrackingLabel(result),"Accepted by Lob");
 assert.equal(projectProfessionalTracking(c,{...o,status:"approved",stripe_session_id:null}).payment,"not_recorded");
 assert.throws(()=>projectProfessionalTracking(c,{...o,user_id:other}));
 assert.throws(()=>projectProfessionalTracking(c,{...o,lob_letter_id:null}));
 assert.equal(result.stripe_session_id,undefined);assert.equal(result.signed_sha,undefined);
});
test("provider receipt must match and only supported dated postal events are projected",async()=>{
 let url;
 const result=await enrichProfessionalTracking(projectProfessionalTracking(c,o),o,{env:{LOB_LIVE_API_KEY:"live_fixture"},stripe:null,network:async(u)=>{url=u;return {ok:true,json:async()=>({id:"ltr_fixture",status:"rendered",expected_delivery_date:"2026-12-01",tracking_events:[{name:"Delivered",time:"2026-12-01T12:00:00Z",location:"private"},{name:"In Transit",time:"2026-11-29T12:00:00Z"},{name:"Fake",time:"2026-12-02T12:00:00Z"}]})};}});
 assert.equal(url,"https://api.lob.com/v1/letters/ltr_fixture");assert.equal(result.paymentCheck,"unavailable");assert.equal(result.providerStatus,"checked");assert.equal(result.expectedDeliveryDate,"2026-12-01");assert.equal(result.latestEvent.name,"Delivered");assert.equal(mailingTrackingLabel(result),"Lob: Delivered");assert.equal(result.providerEvents.length,2);assert.equal(result.providerEvents[1].location,undefined);
 const mismatch=await enrichProfessionalTracking(projectProfessionalTracking(c,o),o,{env:{LOB_LIVE_API_KEY:"live_fixture"},network:async()=>({ok:true,json:async()=>({id:"ltr_other",tracking_events:[{name:"Delivered",time:"2026-12-01T12:00:00Z"}]})})});
 assert.equal(mismatch.providerStatus,"unavailable");assert.equal(mismatch.latestEvent,undefined);assert.equal(mailingTrackingLabel(mismatch),"Accepted by Lob");
});
test("batch and detail routes enforce assigned RLS scope before any service-role order access",async()=>{
 const routes={},app={get:(p,f)=>routes[p]=f};let access=true,privateReads=0,providerReads=0;
 const ctx={mode:"production",user:{id:user,email_confirmed_at:"2026-01-01"},rest:async(table,query,opts)=>{
  assert.ok(query.includes(org));assert.ok(query.includes(user));
  if(table==="professional_cases"){assert.ok(!opts?.service);return access?[c]:[];}
  assert.equal(table,"professional_mail_orders");assert.equal(opts.service,true);privateReads++;return [o];
 }};
 registerProfessionalMailTracking(app,{context:async()=>ctx,env:{LOB_LIVE_API_KEY:"live_fixture"},network:async()=>{providerReads++;return {ok:false}}});
 const res=()=>({code:200,setHeader(k,v){assert.equal(v,"no-store, private")},status(n){this.code=n;return this},json(body){this.body=body;return this}});
 let r=res();await routes["/api/professional/mail-tracking"]({query:{org,ids:caseId}},r);assert.equal(r.code,200);assert.equal(r.body.cases[0].status,"submitted_to_lob");assert.equal(providerReads,0);
 access=false;r=res();await routes["/api/professional/mail-tracking/:caseId"]({query:{org},params:{caseId}},r);assert.equal(r.code,403);assert.equal(privateReads,1);assert.equal(providerReads,0);
 access=true;r=res();await routes["/api/professional/mail-tracking/:caseId"]({query:{org},params:{caseId}},r);assert.equal(r.code,200);assert.equal(r.body.case.providerStatus,"unavailable");assert.equal(providerReads,1);
 r=res();await routes["/api/professional/mail-tracking"]({query:{org,ids:"invalid"}},r);assert.equal(r.code,400);assert.equal(privateReads,2);
});
