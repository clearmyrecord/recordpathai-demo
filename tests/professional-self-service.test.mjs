import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {registerProfessionalLiveBilling,LIVE_PROFESSIONAL_PRICES} from "../src/professional-live-billing.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("paid plan selection does not require attorney credentials or MFA before checkout",()=>{
 const html=read("professional-account.html"),js=read("js/professional-account.js");
 assert.match(html,/No bar number or manual approval is needed/);
 assert.match(html,/id="paid-plan"/);
 assert.match(js,/if\(pilot\)\{\s*if\(!await ensureMfa/);
 assert.match(js,/if\(secure\)\{[^\n]*ensureMfa/);
 assert.match(js,/data.unregistered/);
 assert.match(js,/x-professional-terms/);
 assert.match(html,/id="confirm-account" hidden/);
 assert.match(js,/confirmedAccountId!==user\.id/);
 const form=html.match(/<form id="request-form"[\s\S]*?<\/form>/)[0];
 assert.doesNotMatch(form,/<option value="solo"|<option value="firm"/);
});
test("unpaid and paid provisioning uses actual Stripe account and service-only RPC",async()=>{
 const routes={};const user={id:"00000000-0000-4000-8000-000000000123",email:"fixture@example.invalid",email_confirmed_at:"2026-01-01"};
 const price={id:LIVE_PROFESSIONAL_PRICES.solo.id,livemode:true,active:true,currency:"usd",unit_amount:9900,recurring:{interval:"month",interval_count:1}};
 const customer={id:"cus_fixture",livemode:true,metadata:{product_family:"recordpathai_professional",authorized_user:user.id}};
 let row=null,creates=0,checkout=0,signedIn=true,paid=false,leaseCalls=0;
 const ctx={user,mode:"production",rest:async(table,query,opts)=>{
  assert.equal(opts.service,true);
  if(table==="professional_live_billing")return row?[row]:[];
  if(table==="rpc/professional_create_self_service"){assert.equal(opts.body.p_user,user.id);assert.equal(opts.body.p_plan,"solo");row={org_id:"org",authorized_user:user.id,plan:"solo",stripe_customer_id:customer.id,approved:true};return "org";}
  if(table==="professional_pilot_orgs")return [{active:true,access_kind:"paid",self_service_terms_at:"2026-01-01"}];
  if(table==="professional_pilot_members")return [{active:true,role:"staff",attorney_verified:false}];
  if(table==="rpc/professional_set_paid_lease"){leaseCalls++;assert.equal(opts.body.p_user,user.id);assert.equal(opts.body.p_customer,customer.id);assert.equal(opts.body.p_verified,paid);if(paid)assert.equal(opts.body.p_subscription,"sub_fixture");return paid;}
  throw Error(table);
 }};
 const stripe={accounts:{retrieve:async()=>({id:"acct_1TNJc5EGlcQZ3lmX"})},prices:{retrieve:async()=>price},customers:{create:async(p)=>{creates++;assert.equal(p.metadata.authorized_user,user.id);return customer;},retrieve:async()=>customer},subscriptions:{list:async()=>({data:paid?[{id:"sub_fixture",livemode:true,status:"active",customer:customer.id,metadata:{product_family:"recordpathai_professional",org_id:"org",plan:"solo"},items:{data:[{price,quantity:1}]},current_period_end:Math.floor(Date.now()/1000)+3600,latest_invoice:{livemode:true,status:"paid",subscription:"sub_fixture",currency:"usd",amount_paid:9900,charge:{livemode:true,paid:true,status:"succeeded",currency:"usd",amount_captured:9900,amount_refunded:0,refunded:false,disputed:false}}}]:[],has_more:false})},checkout:{sessions:{list:async()=>({data:[],has_more:false}),create:async(p)=>{checkout++;assert.equal(p.customer,customer.id);assert.equal(p.line_items[0].price,price.id);return {id:"cs_fixture",livemode:true,status:"open",customer:customer.id,url:"https://checkout.stripe.com/c/pay/fixture"};},listLineItems:async()=>({data:[{price,quantity:1}],has_more:false})}}};
 registerProfessionalLiveBilling({post:(p,fn)=>routes[p]=fn},{context:async(req,res)=>{if(!signedIn){res.status(401).end();return null;}return ctx;},env:{STRIPE_SECRET_KEY:"sk_live_fixture",SUPABASE_SERVICE_ROLE_KEY:"fixture"},stripeFactory:()=>stripe});
 const invoke=async(action,headers={})=>{const res={statusCode:200,status(n){this.statusCode=n;return this},json(x){this.body=x;return this},end(){return this}};await routes["/api/professional/live-billing/"+action]({get:k=>headers[k]},res);return res;};
 const consent={"x-professional-live-consent":"yes","x-professional-plan":"solo","x-professional-terms":"accepted-v1","x-professional-account-id":user.id};
 signedIn=false;
 let res=await invoke("checkout",consent);assert.equal(res.statusCode,401);assert.equal(creates,0);assert.equal(checkout,0);
 signedIn=true;user.email_confirmed_at=null;
 res=await invoke("checkout",consent);assert.equal(res.statusCode,403);assert.equal(creates,0);assert.equal(checkout,0);
 user.email_confirmed_at="2026-01-01";
 res=await invoke("refresh");assert.equal(res.body.unregistered,true);assert.equal(creates,0);
 res=await invoke("checkout",{"x-professional-live-consent":"yes","x-professional-plan":"solo","x-professional-account-id":user.id});assert.equal(res.statusCode,400);assert.equal(creates,0);
 res=await invoke("checkout",{...consent,"x-professional-account-id":""});assert.equal(res.statusCode,403);assert.equal(creates,0);
 res=await invoke("checkout",{...consent,"x-professional-account-id":"00000000-0000-4000-8000-000000000999"});assert.equal(res.statusCode,403);assert.equal(creates,0);
 res=await invoke("checkout",consent);assert.equal(res.statusCode,200);assert.equal(res.body.mode,"live");assert.equal(creates,1);assert.equal(checkout,1);
 res=await invoke("refresh");assert.equal(res.body.active,false);assert.equal(leaseCalls,1);
 row.authorized_user="00000000-0000-4000-8000-000000000999";
 res=await invoke("checkout",consent);assert.equal(res.statusCode,403);assert.equal(checkout,1);
 res=await invoke("refresh");assert.equal(res.statusCode,403);assert.equal(leaseCalls,1);
 row.authorized_user=user.id;paid=true;
 res=await invoke("refresh");assert.equal(res.body.active,true);assert.equal(leaseCalls,2);
 res=await invoke("checkout",consent);assert.equal(res.statusCode,409);assert.equal(checkout,1);
});
test("paid membership never grants counsel verification, and tenant data remains MFA protected",()=>{
 const sql=read("sql/professional-self-service.sql");
 assert.match(sql,/values\(org,p_user,'staff',false,true\)/);
 assert.doesNotMatch(sql,/insert into public.professional_counsel_profiles/);
 assert.match(sql,/revoke all on function public.professional_create_self_service\(uuid,text,text\) from public,anon,authenticated/);
 assert.match(sql,/auth.jwt\(\)->>'aal'\)='aal2'/);
 assert.match(sql,/o.ends_at>now\(\)/);
 assert.match(read("src/professional-signed-review.js"),/ctx.mode==="production"&&mode!=="applicant_external"/);
});