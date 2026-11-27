import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LIVE_PROFESSIONAL_PRICES as p,verifiedLivePrice,verifiedLiveSubscription} from "../src/professional-live-billing.js";
const row={org_id:"org",plan:"solo",stripe_customer_id:"cus_fixture"};
const price={id:p.solo.id,livemode:true,active:true,currency:"usd",unit_amount:9900,recurring:{interval:"month",interval_count:1}};
const charge={livemode:true,paid:true,status:"succeeded",currency:"usd",amount_captured:9900,amount_refunded:0,refunded:false,disputed:false};
const sub={id:"sub_fixture",livemode:true,status:"active",customer:row.stripe_customer_id,metadata:{product_family:"recordpathai_professional",org_id:row.org_id,plan:"solo"},items:{data:[{price,quantity:1}]},current_period_end:2000,latest_invoice:{livemode:true,status:"paid",subscription:"sub_fixture",currency:"usd",amount_paid:9900,charge}};
test("live Stripe price and actual captured invoice required for professional access",()=>{
 assert.equal(verifiedLivePrice(price,"solo"),true);assert.equal(verifiedLivePrice({...price,livemode:false},"solo"),false);
 assert.equal(verifiedLiveSubscription(sub,row,1000),true);
 for(const patch of [{status:"past_due"},{livemode:false},{customer:"cus_other"},{current_period_end:999},{latest_invoice:{...sub.latest_invoice,status:"open"}},{latest_invoice:{...sub.latest_invoice,amount_paid:0}},{latest_invoice:{...sub.latest_invoice,charge:{...charge,amount_refunded:1}}},{latest_invoice:{...sub.latest_invoice,charge:{...charge,disputed:true}}},{metadata:{...sub.metadata,org_id:"other"}},{items:{data:[{price,quantity:2}]}}])assert.equal(verifiedLiveSubscription({...sub,...patch},row,1000),false);
});
test("paid lease is bounded and not writable by browser",()=>{
 const sql=readFileSync(new URL("../sql/professional-live-billing.sql",import.meta.url),"utf8");
 assert.match(sql,/now\(\)\+interval '20 minutes'/);
 assert.match(sql,/true,false,'paid'/);
 assert.match(sql,/revoke all on function public.professional_set_paid_lease\(uuid,uuid,text,text,timestamptz,boolean\) from public,anon,authenticated/);
 assert.match(sql,/client_intake_enabled=false/);
});
