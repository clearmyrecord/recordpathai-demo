import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bowlingGreenResource} from "../js/bowling-green-municipal-resource.js";
import {courtFilingPlan} from "../src/court-profiles.js";
const profile=JSON.parse(readFileSync(new URL("../data/bowling-green-municipal-resources.json",import.meta.url),"utf8"));
const courtId=profile.courtId;
test("both relief types require notarization and never enable payment or automated filing",()=>{
 for(const relief of ["sealing","expungement"])for(const outcome of ["conviction","dismissal"]){
 const r=bowlingGreenResource(profile,{courtId,relief,outcome});
 assert.equal(r.notarizationRequired,true);assert.equal(r.manualReviewRequired,true);
 assert.equal(r.packetGenerationApproved,false);assert.equal(r.checkoutEnabled,false);assert.equal(r.automatedFilingEnabled,false);
 assert.equal(r.courtFeeCents,outcome==="conviction"?10000:0);assert.equal(r.feeClerkConfirmed,outcome==="conviction");
 assert.equal(r.dismissalAffidavitClarificationRequired,outcome==="dismissal");
 assert.equal(r.officialForm,profile.forms[relief]);
 }
});
test("wrong court or unresolved outcomes cannot select an automatic form",()=>{
 assert.equal(bowlingGreenResource(profile,{courtId:"oh-wood-perrysburg-municipal",relief:"sealing",outcome:"conviction"}),null);
 for(const outcome of ["acquittal","mixed","unknown","no_bill"]){
 const r=bowlingGreenResource(profile,{courtId,relief:"sealing",outcome});
 assert.equal(r.officialForm,null);assert.equal(r.courtFeeCents,null);assert.equal(r.notarizationRequired,true);}
});
test("no common pleas filing authorization leaks into municipal court",()=>{
 assert.equal(courtFilingPlan({state:"OH",county:"Wood",courtType:"municipal",formType:"sealing-conviction"}).supported,false);
 assert.equal(courtFilingPlan({state:"OH",county:"Wood",courtType:"court-of-common-pleas",formType:"sealing-conviction"}).courtFeeCents,10000);
});
test("public resource prominently distinguishes notarization from e-signing",()=>{
 const html=readFileSync(new URL("../bowling-green-municipal.html",import.meta.url),"utf8");
 assert.match(html,/Required step: notarize the affidavit/);
 assert.match(html,/An ordinary electronic signature is not notarization/);
 assert.match(html,/Paid packet preparation and automated filing are not active/);
 assert.doesNotMatch(html,/<input|<textarea|<form\b/);
});
