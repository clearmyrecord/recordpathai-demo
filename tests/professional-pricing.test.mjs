import test from "node:test";
import assert from "node:assert/strict";
import {quoteProfessionalFiling,PROFESSIONAL_PRICING as p} from "../src/professional-pricing.js";
const base={courtId:"oh-wood-common-pleas",outcome:"conviction",access:"active_subscription"};
test("professional subscribers never pay the consumer preparation fee",()=>{
 assert.equal(p.soloMonthlyCents,9900);assert.equal(p.firmMonthlyCents,24900);
 const q=quoteProfessionalFiling(base);assert.equal(q.preparationFeeCents,0);assert.equal(q.serviceFeeCents,1000);assert.equal(q.courtFeeCents,10000);assert.equal(q.totalCents,11000);assert.equal(q.recordwatchIncluded,true);assert.equal(q.checkoutEnabled,false);
 for(const outcome of ["dismissal","not_guilty"]){const r=quoteProfessionalFiling({...base,outcome});assert.equal(r.totalCents,1000);assert.equal(r.courtFeeCents,0);}
 assert.equal(quoteProfessionalFiling({...base,delivery:"self_file"}).serviceFeeCents,0);
 assert.equal(quoteProfessionalFiling({...base,outcome:"dismissal",delivery:"self_file"}).totalCents,0);
});
test("approved pilots only pay court costs and actual postage",()=>{
 const q=quoteProfessionalFiling({...base,access:"approved_pilot"});assert.equal(q.serviceFeeCents,0);assert.equal(q.totalCents,null);assert.equal(q.postagePending,true);
 assert.equal(quoteProfessionalFiling({...base,access:"approved_pilot",postageCents:650}).totalCents,10650);
 assert.equal(quoteProfessionalFiling({...base,outcome:"dismissal",access:"approved_pilot",delivery:"self_file"}).totalCents,0);
});
test("unsupported courts, mixed cases, expired or unverified subscription fail closed",()=>{
 for(const patch of [{courtId:"oh-wood-municipal"},{outcome:"mixed"},{access:"expired"},{access:"consumer"},{delivery:"invalid"}])assert.equal(quoteProfessionalFiling({...base,...patch}).ok,false);
});
