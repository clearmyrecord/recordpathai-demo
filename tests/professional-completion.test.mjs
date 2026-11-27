import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateProfessionalSignedPdf} from "../src/professional-signed-review.js";
import {validProfessionalTestPrice,validProfessionalTestSubscription} from "../src/professional-billing-sandbox.js";
test("attorney signing is a marked staging-only mode and cannot pass as applicant signing",async()=>{
 const bytes=Buffer.from("%PDF-1.7\n"+" ".repeat(600)+"\n%%EOF");
 const address="Address Verification Personal Identifiers Name of Party PO Box Apartment Number";
 const app="State of Ohio Case Judge Name of Offense Charge Offense Code Degree of Offense Respectfully Submitted Application to Seal Record Conviction Applicant's";
 const counsel={full_name:"Synthetic Counsel",ohio_bar_number:"0000001"};
 const mark=" COUNSEL SIGNATURE ASSUMPTION - DO NOT FILE";
 const pages=[address+mark,app+mark+" /s/ Synthetic Counsel (counsel) Counsel Ohio registration: 0000001"];
 await assert.doesNotReject(validateProfessionalSignedPdf(bytes,"conviction",async()=>pages,counsel));
 await assert.rejects(validateProfessionalSignedPdf(bytes,"conviction",async()=>pages));
 await assert.rejects(validateProfessionalSignedPdf(bytes,"conviction",async()=>pages,{...counsel,ohio_bar_number:"0000002"}));
 await assert.rejects(validateProfessionalSignedPdf(bytes,"conviction",async()=>[address,app],counsel));
});
test("professional billing requires sandbox, exact recurring price, organization and quantity",()=>{
 const price={id:"price_1UgDZYE2dI5377iPC7Ldxgrf",livemode:false,active:true,currency:"usd",unit_amount:9900,recurring:{interval:"month",interval_count:1}};
 assert.equal(validProfessionalTestPrice(price,"solo"),true);
 assert.equal(validProfessionalTestPrice({...price,livemode:true},"solo"),false);
 assert.equal(validProfessionalTestPrice({...price,unit_amount:50},"solo"),false);
 assert.equal(validProfessionalTestPrice(price,"firm"),false);
 const s={livemode:false,customer:"cus_fixture",metadata:{product_family:"recordpathai_professional",org_id:"fixture-org",plan:"solo"},items:{data:[{price,quantity:1}]}};
 assert.equal(validProfessionalTestSubscription(s,"fixture-org","cus_fixture","solo"),true);
 assert.equal(validProfessionalTestSubscription(s,"other-org","cus_fixture","solo"),false);
 assert.equal(validProfessionalTestSubscription({...s,livemode:true},"fixture-org","cus_fixture","solo"),false);
});
test("source observation never treats missing records as relief and restricts worker privileges",()=>{
 const sql=readFileSync(new URL("../sql/professional-billing-watch-staging.sql",import.meta.url),"utf8");
 assert.match(sql,/no_approved_feed/);
 assert.match(sql,/approved_for_internal_matching/);
 assert.match(sql,/revoke all on function public.professional_refresh_watch\(\) from public,anon,authenticated/);
 assert.match(sql,/e.enabled and e.consent_confirmed/);
 const schedule=readFileSync(new URL("../sql/professional-watch-schedule-staging.sql",import.meta.url),"utf8");
 assert.match(schedule,/professional-source-refresh-staging/);
});
