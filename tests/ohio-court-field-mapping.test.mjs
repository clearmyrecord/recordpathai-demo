import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {validateOhioRoster,selectOhioCounties,mergeOhioResearch,coverage} from "../tools/ohio-docket-agent-core.mjs";
import {REQUESTED_INFORMATION,inventoryBlankPublicPage} from "../tools/ohio-public-portal-field-inventory.mjs";
await import("../js/record-collection.js");
const collection=globalThis.RecordPathRecordCollection;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const catalog=JSON.parse(read("data/ohio-court-portal-maps.json"));
const roster=JSON.parse(read("data/ohio-counties.json"));
const targets=JSON.parse(read("data/ohio-court-mapping-assignments.json"));

test("Agent 1 assigns 87 non-Wood counties without falsely marking any verified",()=>{
  assert.equal(roster.length,88);
  assert.equal(validateOhioRoster(roster).length,87);
  assert.equal(targets.assignments.length,87);
  assert.equal(targets.assignments.some(c=>c.countySlug==="wood"),false);
  assert.equal(new Set(targets.assignments.map(c=>c.countySlug)).size,87);
  assert.ok(targets.assignments.every(c=>c.allObservedFieldsMapped===false&&
    c.allRelevantCourtsIdentified===false&&c.exactCourts.length===0));
  const chosen=selectOhioCounties(roster,null,{limit:15,asOf:"2026-11-07"});
  assert.equal(chosen.length,15);
  assert.ok(chosen.every(c=>c.slug!=="wood"));
  assert.equal(coverage(roster,null).pending,87);
});
test("Only exact reviewed Wood Common Pleas venue receives the approved clerk docket link",()=>{
  assert.equal(catalog.courts.length,1);
  assert.equal(catalog.courts[0].fieldInventory.status,"not_yet_inspected");
  assert.equal(catalog.courts[0].fieldInventory.verified,false);
  assert.equal(collection.loadReviewedCatalog(catalog),1);
  const good={state:"OH",county:"Wood",courtType:"court-of-common-pleas",
    courtName:"Wood County Court of Common Pleas"};
  const found=collection.linkFor(good);
  assert.equal(found.courtId,"oh-wood-common-pleas-general");
  assert.equal(found.linkedToExactCourt,true);
  assert.equal(found.url,collection.WOOD_COMMON_PLEAS);
  for(const changed of [
    {...good,courtName:"Bowling Green Municipal Court"},
    {...good,courtName:""},
    {...good,courtType:"municipal"},
    {...good,county:"Lucas"},
    {...good,state:"NV"}
  ]){
    const out=collection.linkFor(changed);
    assert.equal(out.linkedToExactCourt,false);
    assert.notEqual(out.url,collection.WOOD_COMMON_PLEAS);
  }
  const unreviewed=JSON.parse(JSON.stringify(catalog.courts[0]));
  unreviewed.publicLookup.approvedForCustomerLink=false;
  assert.equal(collection.linkFor(good,[unreviewed]).linkedToExactCourt,false);
  assert.equal(collection.linkFor(good,[unreviewed]).url,collection.OHIO_DIRECTORY);
});
test("Court identity is collected and no case verification is implied",()=>{
  const html=read("record-details.html");
  assert.match(html,/id="recordCollectionTitle"/);
  assert.match(html,/id="recordCollectionDocketLink"/);
  assert.match(html,/RecordPathRecordCollection\?\.init/);
  assert.match(html,/\["caseState","county","courtType","courtName"\]/);
  assert.match(html,/data\.court\.selected_court_catalog_id/);
  assert.match(html,/does not mean the applicant's case was verified/);
  const source=read("js/record-collection.js");
  assert.ok(!source.includes("data/ohio-docket-agent-progress.json"));
  assert.match(source,/approvedForCustomerLink/);
  assert.match(source,/chooseExactCourt/);
  assert.doesNotThrow(()=>new vm.Script(source));
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
    if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
});
test("Blank public portal field inventory captures every observed input and table label without sensitive values",()=>{
  const html=[
    '<form><label for="case">Case Number</label><input id="case" name="caseNo" value="PRIVATE-CASE-001" required>',
    '<label for="person">Defendant Name</label><input id="person" name="partyName" placeholder="Full name">',
    '<input type="hidden" name="__RequestVerificationToken" value="SECRET-TOKEN">',
    '<select id="caseType" name="type"><option value="criminal">Criminal</option></select>',
    '<textarea name="comments"></textarea></form>',
    '<table><thead><tr><th>Case Number</th><th>Disposition</th></tr></thead></table>',
    '<dl><dt>Judge</dt><dt>Entry Date</dt></dl><script>/* Dynamic */</script>'
  ].join("");
  const r=inventoryBlankPublicPage(html,{url:"https://courts.example.gov/public",
    courtId:"oh-wood-common-pleas-general"});
  assert.equal(r.observed.searchInputs.length,4);
  assert.equal(r.observed.technicalControls.length,1);
  assert.equal(r.observed.visibleResultsHeaders.length,2);
  assert.equal(r.observed.visibleDetailLabels.length,2);
  assert.equal(r.audit.observedFieldCount,9);
  assert.equal(r.audit.humanApprovalRequired,true);
  assert.equal(r.audit.allObservedFieldsMapped,false);
  assert.equal(r.audit.dynamicContentRequiresInspection,true);
  assert.ok(r.audit.notClaimedAvailable.includes("sentence.final_discharge_date"));
  assert.equal(r.observed.searchInputs.find(x=>x.id==="case").canonicalSuggestion,"case.case_number");
  assert.ok(!JSON.stringify(r).includes("PRIVATE-CASE-001"));
  assert.ok(!JSON.stringify(r).includes("SECRET-TOKEN"));
  assert.ok(REQUESTED_INFORMATION.length>=20);
});
test("Unverified agent search leads never authorize customer links or mapped fields",()=>{
  const output={schemaVersion:"recordpathai.ohio-county-agent-output.v1",
    attempts:[{slug:"franklin",county:"Franklin",status:"candidate_found",
      searchedAt:"2026-11-07T23:00:00Z",searches:1}],
    candidates:[{slug:"franklin",county:"Franklin",title:"Clerk search",
      url:"https://courts.example.gov/search",discoveredAt:"2026-11-07T23:00:00Z"}]};
  const ledger=mergeOhioResearch(null,output);
  assert.equal(ledger.candidates.length,1);
  assert.equal(ledger.candidates[0].verified,false);
  assert.equal(ledger.candidates[0].customerLinkApproved,false);
  assert.equal(ledger.candidates[0].courtIdentity.reviewed,false);
  assert.equal(ledger.candidates[0].fieldInventory.allObservedFieldsMapped,false);
  assert.equal(collection.loadReviewedCatalog({courts:ledger.candidates}),0);
});
test("Customer worksheet strips mapper fields and technical output",()=>{
  const body=read("js/wave1-form-requirements.js");
  assert.match(body,/YOUR COURT RECORD CHECKLIST/);
  assert.match(body,/HOW TO FIND YOUR COURT RECORDS/);
  assert.ok(!body.includes('"DISCOVERY key: "'));
  assert.ok(!body.includes('"Verified court mapping: "'));
  assert.ok(!body.includes('label+" ["+x.key+"]'));
});
