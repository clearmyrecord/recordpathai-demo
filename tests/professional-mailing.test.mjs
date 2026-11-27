import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {verifiedProfessionalMailPayment,registerProfessionalMailing,PROFESSIONAL_MAIL_PRODUCT} from "../src/professional-mailing.js";
const o={case_id:"00000000-0000-4000-8000-000000000001",org_id:"00000000-0000-4000-8000-000000000002",user_id:"00000000-0000-4000-8000-000000000003",document_id:"00000000-0000-4000-8000-000000000004",signed_sha:"a".repeat(64),stripe_session_id:"cs_live_fixture"};
const charge={livemode:true,paid:true,status:"succeeded",payment_intent:"pi_fixture",currency:"usd",amount:10000,amount_captured:10000,amount_refunded:0,refunded:false,disputed:false};
const session={id:o.stripe_session_id,livemode:true,mode:"payment",status:"complete",payment_status:"paid",currency:"usd",amount_subtotal:10000,amount_total:10000,metadata:{productType:PROFESSIONAL_MAIL_PRODUCT,userId:o.user_id,caseId:o.case_id,orgId:o.org_id,documentId:o.document_id,signedPdfSha:o.signed_sha,serviceFeeCents:"0",courtFeeCents:"10000"},payment_intent:{id:"pi_fixture",livemode:true,status:"succeeded",currency:"usd",amount:10000,amount_received:10000,latest_charge:charge}};
test("professional mailing requires exact live captured $100 court deposit only tied to the reviewed PDF and case",()=>{
 assert.equal(verifiedProfessionalMailPayment(session,o),true);
 for(const patch of [{livemode:false},{amount_subtotal:15000},{amount_subtotal:11000},{amount_total:11000},{payment_status:"unpaid"},{id:"cs_live_other"},{metadata:{...session.metadata,userId:"other"}},{metadata:{...session.metadata,signedPdfSha:"b".repeat(64)}},{metadata:{...session.metadata,serviceFeeCents:"5000"}},{payment_intent:{...session.payment_intent,latest_charge:{...charge,refunded:true}}},{payment_intent:{...session.payment_intent,latest_charge:{...charge,disputed:true}}},{payment_intent:{...session.payment_intent,latest_charge:{...charge,amount_refunded:1000}}}])assert.equal(verifiedProfessionalMailPayment({...session,...patch},o),false);
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

test("mocked professional order moves from approved review through Stripe and exactly one Lob check",async()=>{
 const routes={},app={get:(p,fn)=>routes[p]=fn,post:(p,...f)=>routes[p]=f.at(-1)};
 const bytes=Buffer.from("%PDF-1.7\n"+"fixture-only ".repeat(60)+"\n%%EOF"),hash=createHash("sha256").update(bytes).digest("hex");
 const order={...o,signed_sha:hash,stripe_session_id:null,reviewed_at:new Date().toISOString(),review_checks:Object.fromEntries(["identity","docket","charges","discharge","exclusions","form","signature","authorization","court_fee_and_address"].map(k=>[k,true])),status:"approved"};
 const c={id:o.case_id,org_id:o.org_id,attorney_id:o.user_id,court_id:"oh-wood-common-pleas",outcome:"conviction",case_number:"FIXTURE-ONLY",client_id:"00000000-0000-4000-8000-000000000005"};
 const d={id:o.document_id,case_id:o.case_id,org_id:o.org_id,attorney_id:o.user_id,sha256:hash,page_count:2,signature_mode:"applicant_external",attorney_signature_attested:true};
 const customer="cus_fixture",price="price_1UgEDMEGlcQZ3lmXWhFcmLh2";
 let created=0,mailings=0,claims=0,paid=false,refund=false,webhook=false,latest=null;
 const privateRest=async(t,x)=>{
  if(t==="professional_mail_orders"){
   if(x.method==="PATCH"){
    if(x.query.includes("status=eq.approved&stripe_session_id=is.null")&&order.stripe_session_id)return [];
    if(x.query.includes("status=eq.paid_hold&attempted_at=is.null")){if(order.status!=="paid_hold"||order.attempted_at)return [];claims++;}
    if(x.query.includes("status=eq.approved")&&order.status!=="approved")return [];
    if(x.query.includes("status=eq.dispatch_claimed")&&order.status!=="dispatch_claimed")return [];
    Object.assign(order,x.body);return [{...order}];
   }
   if(x.query.includes("stripe_session_id=eq.")&&order.stripe_session_id!==o.stripe_session_id)return [];
   if(x.query.includes("status=eq.paid_hold")&&order.status!=="paid_hold")return [];
   return [{...order}];
  }
  if(t==="professional_cases")return [c];
  if(t==="professional_signed_documents")return x.query.includes("pdf_bytes")?[{sha256:hash,pdf_bytes:"\\x"+bytes.toString("hex")}]:[d];
  if(t==="professional_signed_reviews")return [{org_id:o.org_id,attorney_id:o.user_id,exact_document_reviewed:true}];
  if(t==="professional_case_decisions")return [{org_id:o.org_id,attorney_id:o.user_id,decision:"approved_for_unsigned_draft",entire_case_reviewed:true}];
  if(t==="professional_clients")return [{id:c.client_id,org_id:o.org_id,attorney_id:o.user_id,authorization_confirmed:true}];
  if(t==="professional_live_billing")return [{org_id:o.org_id,authorized_user:o.user_id,stripe_customer_id:customer,plan:"solo",approved:true}];
  if(t==="packet_dispatch_controls")return [{live_dispatch_enabled:true}];
  throw Error(t);
 };
 const stripe={customers:{retrieve:async()=>({id:customer,livemode:true,metadata:{authorized_user:o.user_id,product_family:"recordpathai_professional"}})},subscriptions:{list:async()=>({has_more:false,data:[{id:"sub_fixture",livemode:true,status:"active",customer,metadata:{product_family:"recordpathai_professional",org_id:o.org_id,plan:"solo"},items:{data:[{price:{id:price},quantity:1}]},current_period_end:Math.floor(Date.now()/1000)+3600,latest_invoice:{livemode:true,status:"paid",subscription:"sub_fixture",currency:"usd",amount_paid:9900,charge:{livemode:true,paid:true,status:"succeeded",currency:"usd",amount_captured:9900,amount_refunded:0,refunded:false,disputed:false}}}]})},checkout:{sessions:{create:async(p)=>{created++;assert.equal(p.customer,customer);assert.equal(p.metadata.serviceFeeCents,"0");assert.equal(p.automatic_tax,undefined);assert.deepEqual(p.line_items.map(i=>i.price_data.unit_amount),[10000]);latest={...session,customer,metadata:p.metadata,status:"open",payment_status:"unpaid",url:"https://checkout.stripe.com/c/pay/fixture"};return latest;},retrieve:async()=>paid?{...latest,status:"complete",payment_status:"paid",payment_intent:{...session.payment_intent,latest_charge:{...charge,refunded:refund,amount_refunded:refund?10000:0}}}:latest}}};
 const env={STRIPE_SECRET_KEY:"sk_live_fixture",SUPABASE_SERVICE_ROLE_KEY:"fixture",RECORDPATH_PROFESSIONAL_MAILING_ENABLED:"true",RECORDPATH_ENABLE_AUTOMATIC_FULFILLMENT:"true",STRIPE_WEBHOOK_SECRET:"whsec_fixture",RECORDPATH_ENABLE_LIVE_DISPATCH:"true",LOB_LIVE_CHECKS_ENABLED:"true",LOB_CHECK_ATTACHMENTS_APPROVED:"true",LOB_LIVE_API_KEY:"live_fixture",LOB_VERIFIED_BANK_ID:"bank_fixture",LOB_FROM_ADDRESS_JSON:JSON.stringify({name:"Fixture",address_line1:"Fixture",address_city:"Fixture",address_state:"OH",address_zip:"43402"})};
 const cfg={url:"https://pfyxjhdlqgpzzzdssqpk.supabase.co",key:"fixture"};
 const network=async(url,init)=>{
  if(url.includes("/bucket/"))return {ok:true,json:async()=>({public:false})};
  if(url.includes("/object/sign/"))return {ok:true,json:async()=>({signedURL:"/object/sign/packet-documents/fixture?token=fixture"})};
  if(url.includes("/storage/v1/object/")){assert.equal(createHash("sha256").update(init.body).digest("hex"),hash);return {ok:true};}
  if(url==="https://api.lob.com/v1/checks"){mailings++;assert.equal(webhook,true);assert.equal(order.status,"dispatch_claimed");const data=JSON.parse(init.body);assert.equal(data.amount,100);assert.equal(data.memo,c.case_number);assert.equal(data.attachment.includes("packet-documents/fixture"),true);assert.equal(init.headers["Idempotency-Key"],"rpai-pro-"+o.stripe_session_id);return {ok:true,json:async()=>({id:"chk_fixture"})};}
  throw Error(url);
 };
 const svc=registerProfessionalMailing(app,{express:{json:()=>()=>{}},context:async()=>({mode:"production",user:{id:o.user_id,email_confirmed_at:"2026-01-01"},rest:async()=>[c]}),rest:privateRest,config:()=>cfg,stripe,requireOperationsKey:()=>true,lobBankVerified:async()=>true,env,network});
 const res=()=>({code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}});
 const invoke=async()=>{const r=res();await routes["/api/professional/mail/:caseId/checkout"]({params:{caseId:o.case_id},get:()=>"yes"},r);return r;};
 assert.equal((await invoke()).code,200);assert.equal((await invoke()).code,200);assert.equal(created,1);
 assert.deepEqual(await svc.fulfill(),{submitted:0,held:0});assert.equal(mailings,0);
 paid=true;webhook=true;const r=res();await svc.reconcile({...latest,payment_status:"paid"},r,{id:"evt_fixture",livemode:true,type:"checkout.session.completed",data:{object:latest}});assert.equal(r.code,200);assert.equal(order.status,"paid_hold");
 refund=true;assert.deepEqual(await svc.fulfill(),{submitted:0,held:1});assert.equal(claims,0);assert.equal(mailings,0);
 refund=false;assert.deepEqual(await svc.fulfill(),{submitted:1,held:0});assert.equal(claims,1);assert.equal(mailings,1);assert.equal(order.lob_check_id,"chk_fixture");
 assert.deepEqual(await svc.fulfill(),{submitted:0,held:0});assert.equal(mailings,1);
});
