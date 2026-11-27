import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifiedProfessionalMailPayment,registerProfessionalMailing,PROFESSIONAL_MAIL_PRODUCT} from "../src/professional-mailing.js";
const o={case_id:"00000000-0000-4000-8000-000000000001",org_id:"00000000-0000-4000-8000-000000000002",user_id:"00000000-0000-4000-8000-000000000003",document_id:"00000000-0000-4000-8000-000000000004",signed_sha:"a".repeat(64),stripe_session_id:"cs_live_fixture"};
const charge={livemode:true,paid:true,status:"succeeded",payment_intent:"pi_fixture",currency:"usd",amount:11000,amount_captured:11000,amount_refunded:0,refunded:false,disputed:false};
const session={id:o.stripe_session_id,livemode:true,mode:"payment",status:"complete",payment_status:"paid",currency:"usd",amount_subtotal:11000,amount_total:11000,metadata:{productType:PROFESSIONAL_MAIL_PRODUCT,userId:o.user_id,caseId:o.case_id,orgId:o.org_id,documentId:o.document_id,signedPdfSha:o.signed_sha,serviceFeeCents:"1000",courtFeeCents:"10000"},payment_intent:{id:"pi_fixture",livemode:true,status:"succeeded",currency:"usd",amount:11000,amount_received:11000,latest_charge:charge}};
test("professional mailing requires exact live captured $10 service and $100 deposit tied to the reviewed PDF and case",()=>{
 assert.equal(verifiedProfessionalMailPayment(session,o),true);
 for(const patch of [{livemode:false},{amount_subtotal:15000},{amount_subtotal:10000},{payment_status:"unpaid"},{id:"cs_live_other"},{metadata:{...session.metadata,userId:"other"}},{metadata:{...session.metadata,signedPdfSha:"b".repeat(64)}},{metadata:{...session.metadata,serviceFeeCents:"5000"}},{payment_intent:{...session.payment_intent,latest_charge:{...charge,refunded:true}}},{payment_intent:{...session.payment_intent,latest_charge:{...charge,disputed:true}}},{payment_intent:{...session.payment_intent,latest_charge:{...charge,amount_refunded:1000}}}])assert.equal(verifiedProfessionalMailPayment({...session,...patch},o),false);
});
test("no mailing or checkout occurs while disabled; forged events and cross-account reads are rejected",async()=>{
 const routes={},app={get:(p,fn)=>routes[p]=fn,post:(p,...f)=>routes[p]=f.at(-1)};
 let writes=0,stripeCalls=0,networkCalls=0,owner=true;
 const c={id:o.case_id,org_id:o.org_id,attorney_id:o.user_id,court_id:"oh-wood-common-pleas",outcome:"conviction"};
 const svc=registerProfessionalMailing(app,{express:{json:()=>()=>{}},context:async()=>({mode:"production",user:{id:o.user_id,email_confirmed_at:"2026-01-01"},rest:async()=>owner?[c]:[]}),rest:async(t,x)=>{if(x.method)writes++;return []},config:()=>({url:"https://pfyxjhdlqgpzzzdssqpk.supabase.co"}),stripe:{checkout:{sessions:{retrieve:async()=>{stripeCalls++;return session}}}},requireOperationsKey:()=>false,lobBankVerified:async()=>false,env:{},network:async()=>{networkCalls++;throw Error("Unexpected network")}});
 const res=()=>({code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}});
 let r=res();await routes["/api/professional/mail/:caseId/checkout"]({params:{caseId:o.case_id},get:()=>"yes"},r);assert.equal(r.code,503);
 owner=false;r=res();await routes["/api/professional/mail/:caseId"]({params:{caseId:o.case_id}},r);assert.equal(r.code,403);
 r=res();await svc.reconcile(session,r,{id:"evt_fixture",livemode:false,type:"checkout.session.completed",data:{object:session}});assert.equal(r.code,400);
 assert.deepEqual(await svc.fulfill(),{submitted:0,held:0});assert.equal(writes,0);assert.equal(stripeCalls,0);assert.equal(networkCalls,0);
});
test("only the private unique-case queue and shared signed-webhook/scheduler can dispatch professional mail",()=>{
 const src=readFileSync(new URL("../src/professional-mailing.js",import.meta.url),"utf8"),sql=readFileSync(new URL("../sql/professional-mailing.sql",import.meta.url),"utf8"),server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
 assert.match(sql,/case_id uuid primary key/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public.professional_mail_orders from public, anon, authenticated/);
 assert.match(src,/status=eq.paid_hold&attempted_at=is.null/);
 assert.match(src,/requireLobLiveDispatch/);
 assert.match(src,/packet_dispatch_controls/);
 assert.match(src,/RECORDPATH_PROFESSIONAL_MAILING_ENABLED/);
 assert.match(src,/buildCourtCheckRequest/);
 assert.match(server,/professionalMailing\.reconcile\(session,res,event\)/);
 assert.match(server,/professionalMailing\.fulfill\(\)/);
});
