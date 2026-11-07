import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {discoveryQueries,isWave1,pdfStorageRelativePath,WAVE1_CODES} from "../tools/form-query-builder.mjs";
import {detectFormType} from "../tools/form-source-scorer.js";
await import("../js/wave1-form-requirements.js");
await import("../js/form-pipeline-core.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const catalog=JSON.parse(fs.readFileSync(path.join(root,"data/wave1-court-catalog.json"),"utf8"));
const intake=globalThis.RecordPathFormRequirements;
const pipeline=globalThis.RecordPathFormPipeline;
test("Wave 1 discovery has grounded seed courts for all five states but no unreviewed active form",()=>{
 assert.deepEqual(WAVE1_CODES,["NV","TX","FL","AZ","GA"]);
 assert.equal(catalog.length,10);
 for(const code of WAVE1_CODES){
   assert.equal(catalog.filter(x=>x.state===code).length,2);
   assert.ok(catalog.filter(x=>x.state===code).every(x=>x.status==="discovery_only"));
 }
 assert.ok(catalog.every(c=>!c.pdfPath&&!c.mappingPath&&!c.active));
});
test("Wave 1 discovery queries use current selected state, not Ohio",()=>{
 for(const court of catalog){
   const queries=discoveryQueries(court);
   assert.ok(queries.length>=4);
   assert.ok(queries.every(q=>q.includes(court.stateName)));
   assert.ok(queries.every(q=>q.includes(court.county)));
   assert.equal(queries.some(q=>q.includes("County Ohio")),false);
   assert.ok(isWave1(court.state));
   assert.ok(pdfStorageRelativePath(court,"sealing-dismissal").startsWith("assets/forms/"+court.state.toLowerCase()+"/"));
 }
 assert.throws(()=>pdfStorageRelativePath({...catalog[0],countySlug:"../secret"},"sealing-dismissal"),/Unsafe/);
});
test("Region-specific noncourt legal document types are discoverable but not approved",()=>{
 assert.equal(detectFormType("Georgia request to restrict arrest record"),"record-restriction");
 assert.equal(detectFormType("FDLE Certificate of Eligibility to Expunge"),"fdle-certificate");
 assert.equal(detectFormType("Texas Petition for Order of Nondisclosure"),"order-of-nondisclosure");
 for(const type of ["record-restriction","fdle-certificate","order-of-nondisclosure"]){
   const c=pipeline.draftCandidate({state:"GA",county:"Fulton",courtType:"superior",courtName:"Test",
    formType:type,title:"Synthetic Form",sourceUrl:"https://example.org/form.pdf",
    pdfPath:"",sha256:"b".repeat(64),bytes:456,pageCount:2});
   assert.equal(c.active,false);assert.equal(c.review.legalRoutingApproved,false);
 }
});
test("Wave 1 state-specific preparatory fields are editable screening suggestions, not required legal claims",()=>{
 for(const code of WAVE1_CODES){
   const data={court:{state:code},case:{all_charges_confirmed:"unsure"},charges:[]};
   const prep=intake.requirements(data);
   assert.ok(prep.requirements.some(x=>x.source==="state-screen-provisional"));
   assert.ok(prep.requirements.filter(x=>x.source==="state-screen-provisional").every(x=>x.required===false));
   assert.equal(prep.needsSpecificFormReview,true);
 }
 const az=intake.requirements({court:{state:"AZ"},charges:[],case:{}});
 assert.ok(az.requirements.some(x=>x.key==="petitioner.other_names"));
 const fl=intake.requirements({court:{state:"FL"},charges:[],case:{}});
 assert.ok(fl.requirements.some(x=>x.key==="case.fdle_certificate_status"));
 const ga=intake.requirements({court:{state:"GA"},charges:[],case:{}});
 assert.ok(ga.requirements.some(x=>x.key==="charges.0.arrest_date"));
});
test("Wave 1 crawl application never automatically downloads search results",()=>{
 const crawler=fs.readFileSync(path.join(root,"tools/form-crawler.js"),"utf8");
 assert.match(crawler,/WAVE1_CATALOG_PATH/);
 assert.match(crawler,/if \(isWave1\(court.state\)\) \{/);
 assert.match(crawler,/pdfAccess = 'manual_source_verification_required'/);
 assert.match(crawler,/source_verification_required/);
 assert.match(crawler,/SEARCH_QUERIES = discoveryQueries/);
});
