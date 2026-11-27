import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {metroCourtResource} from "../js/ohio-metro-court-resources.js";
import {courtFilingPlan} from "../src/court-profiles.js";
const registry=JSON.parse(readFileSync(new URL("../data/ohio-metro-court-resources.json",import.meta.url),"utf8"));
test("six exact named court resources with distinct fees and no payment authorization",()=>{
 assert.equal(registry.courts.length,6);assert.equal(new Set(registry.courts.map(c=>c.id)).size,6);
 for(const c of registry.courts){for(const [outcome,fee,total] of [["conviction",5000,10000],["nonconviction",0,5000]]){
 const r=metroCourtResource(registry,c.id,outcome);assert.equal(r.courtFeeCents,fee);assert.equal(r.illustrativeTotalCents,total);
 assert.match(r.officialForm,/^https:\/\//);assert.equal(r.checkoutEnabled,false);assert.equal(r.packetGenerationApproved,false);assert.equal(r.automatedFilingEnabled,false);
 assert.equal(courtFilingPlan({state:"OH",county:c.county,courtType:c.type,formType:"sealing-conviction"}).supported,false);
 }}
});
test("unknown court and ambiguous outcome fail closed",()=>{
 assert.equal(metroCourtResource(registry,"oh-lucas-municipal","conviction"),null);
 assert.equal(metroCourtResource(registry,"oh-toledo-municipal","mixed"),null);
 assert.equal(metroCourtResource(registry,"oh-hamilton-municipal",""),null);
});
test("local restrictions and legacy Wood County price remain distinct",()=>{
 assert.match(metroCourtResource(registry,"oh-franklin-municipal","conviction").filing,/no checks of any kind/i);
 assert.match(metroCourtResource(registry,"oh-toledo-municipal","nonconviction").filing,/No email/);
 assert.equal(courtFilingPlan({state:"OH",county:"Wood",courtType:"court-of-common-pleas",formType:"sealing-conviction"}).courtFeeCents,10000);
});
test("resource page is explicitly read-only and discoverable",()=>{
 const html=readFileSync(new URL("../ohio-metro-courts.html",import.meta.url),"utf8");
 assert.match(html,/Automated form preparation, paid checkout and RecordPathAI filing are not yet available/);
 assert.doesNotMatch(html,/<input|<textarea|<form\b/);
 assert.match(readFileSync(new URL("../sitemap.xml",import.meta.url),"utf8"),/ohio-metro-courts.html/);
});
