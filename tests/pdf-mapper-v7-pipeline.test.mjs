import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import "../js/form-pipeline-core.js";
import {prepareLocalCandidate} from "../tools/prepare-form-candidates.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const core=globalThis.RecordPathFormPipeline;
function candidate(){
  return core.draftCandidate({
    state:"OH",county:"Wood",courtType:"court-of-common-pleas",
    courtName:"Wood County Court of Common Pleas",formType:"sealing-dismissal",
    title:"Official dismissal petition",
    sourceUrl:"https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/143/Application-for-Sealing-295333-Dismissal-PDF",
    sourcePageUrl:"https://clerkofcourt.co.wood.oh.us/174/Forms",
    pdfPath:"assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf",
    sha256:"b".repeat(64),bytes:947735,pageCount:4,
    discoveredAt:"2026-11-07T10:00:00Z",suggestions:[]
  });
}
const mappings=[
  {page:4,name:"court.case_number",type:"text",x:300,y:160,width:220,height:25},
  {page:4,name:"petitioner.full_name",type:"text",x:100,y:260,width:250,height:25},
  {page:4,name:"charges.0.charge_name",type:"text",x:100,y:520,width:200,height:25},
  {page:4,name:"charges.0.disposition_date",type:"date",x:100,y:455,width:180,height:25},
  {page:4,name:"signatures.petitioner_signature_name",type:"signature",x:400,y:845,width:200,height:25}
];
function sample(){
  return {meta:{synthetic:true},
    court:{case_number:"SYNTHETIC-001"},petitioner:{full_name:"Alex Test"},
    charges:[{charge_name:"Synthetic charge",disposition_date:"2021-05-01"}],
    signatures:{petitioner_signature_name:"NOT REAL"}};
}
test("new manifest preserves source, fingerprint and stays review-only",()=>{
  const c=candidate();
  assert.equal(core.validateCandidate(c).ok,true);
  assert.equal(c.active,false);
  assert.equal(c.review.mappingApproved,false);
  assert.equal(c.review.legalRoutingApproved,false);
  assert.equal(c.mapping.status,"draft");
  assert.equal(c.pdf.sha256,"b".repeat(64));
});
test("rejects unsafe URL, paths, missing hash and changed source",()=>{
  let c=candidate();
  c.source.url="http://localhost/private.pdf";
  assert.equal(core.validateCandidate(c).ok,false);
  c=candidate();c.pdf.localPath="../sensitive.pdf";
  assert.equal(core.validateCandidate(c).ok,false);
  c=candidate();c.pdf.sha256="";
  assert.equal(core.validateCandidate(c).ok,false);
  c=candidate();
  assert.throws(()=>core.buildFillPlan({manifest:c,mappings,caseData:sample(),
    currentPdfSha256:"a".repeat(64),mode:"draft"}),/fingerprint changed/);
});
test("canonical path reader supports charge arrays without executing arbitrary property names",()=>{
  const data=sample();
  assert.equal(core.getValue(data,"court.case_number").value,"SYNTHETIC-001");
  assert.equal(core.getValue(data,"charges.0.charge_name").value,"Synthetic charge");
  assert.equal(core.getValue(data,"charges.1.charge_name").present,false);
  for(const bad of ["__proto__.hello","petitioner.constructor","charges.__proto__.name","charges.999.charge_name","foo.bar"]){
    assert.equal(core.getValue(data,bad).present,false);
  }
});
test("draft prefill requires synthetic data and leaves signatures empty",()=>{
  const c=candidate();
  assert.throws(()=>core.buildFillPlan({manifest:c,mappings,caseData:{...sample(),meta:{}},
    currentPdfSha256:c.pdf.sha256,mode:"draft"}),/synthetic/);
  const plan=core.buildFillPlan({manifest:c,mappings,caseData:sample(),
    currentPdfSha256:c.pdf.sha256,mode:"draft"});
  assert.equal(plan.fields.filter(x=>x.state==="prefilled").length,4);
  assert.equal(plan.fields.find(x=>x.type==="signature").state,"manual_signature_required");
  assert.equal(plan.safeToFile,false);
  assert.equal(plan.readyForMailing,false);
});
test("production mode stays blocked absent approval and consent",()=>{
  const c=candidate();
  for(const consent of [true,false]){
    assert.throws(()=>core.buildFillPlan({manifest:c,mappings,caseData:sample(),
      currentPdfSha256:c.pdf.sha256,mode:"production",consent}),/blocked/);
  }
  const approved=structuredClone(c);
  approved.active=true;
  approved.review={status:"approved",sourceVerified:true,mappingApproved:true,legalRoutingApproved:true};
  approved.mapping={status:"approved",approvedForPdfSha256:c.pdf.sha256,suggestions:[]};
  const plan=core.buildFillPlan({manifest:approved,mappings,caseData:sample(),
    currentPdfSha256:c.pdf.sha256,mode:"production",consent:true});
  assert.equal(plan.safeToFile,false); // Even permitted auto-fill does not itself make it court-ready
  assert.equal(plan.readyForMailing,false);
});
test("malformed or non-canonical mappings cannot be used",()=>{
  const c=candidate();
  for(const invalid of [
    [{page:5,name:"petitioner.full_name",type:"text",x:10,y:10,width:10,height:10}],
    [{page:4,name:"person.ssn",type:"text",x:10,y:10,width:10,height:10}],
    [{page:4,name:"petitioner.full_name",type:"text",x:10,y:10,width:-1,height:10}]
  ]){
    assert.throws(()=>core.buildFillPlan({manifest:c,mappings:invalid,caseData:sample(),
      currentPdfSha256:c.pdf.sha256,mode:"draft"}),/Invalid/);
  }
});
test("crawler-local PDF creates deterministic review manifest with real SHA and charge suggestions",async()=>{
  const metadata={
    state:"OH",county:"Wood",courtType:"court-of-common-pleas",
    courtName:"Wood County Court of Common Pleas",
    formType:"sealing-dismissal",
    formTitle:"R.C. 2953.33 petition",
    sourceUrl:"https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/143/Application-for-Sealing-295333-Dismissal-PDF",
    localPath:"assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf",
    discoveredAt:"2026-11-07"
  };
  const m=await prepareLocalCandidate(metadata,{repoRoot:root});
  const bytes=fs.readFileSync(path.join(root,metadata.localPath));
  assert.equal(m.pdf.sha256,crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.equal(m.pdf.pageCount,4);
  assert.equal(m.pdf.bytes,bytes.length);
  assert.equal(m.review.sourceVerified,false);
  assert.equal(m.review.mappingApproved,false);
  assert.equal(m.active,false);
  assert.equal(m.mapping.profile,"wood-county-2953.33");
  assert.ok(m.mapping.suggestions.some(s=>s.name==="charges.3.charge_code"));
});
test("V7 UI and separate logic parse, retaining V6 manual mapping tools",()=>{
  const h=fs.readFileSync(path.join(root,"pdf-mapper-v7.html"),"utf8");
  for(const needle of ["id=\"pdfUpload\"","id=\"candidateManifestUpload\"",
    "id=\"loadCandidatePdfBtn\"","id=\"downloadCandidateBtn\"",
    "id=\"previewFieldValuesBtn\"","id=\"downloadSyntheticPdfBtn\"",
    "id=\"importJsonBtn\"","id=\"addTextFieldBtn\""]){
    assert.ok(h.includes(needle),"Missing "+needle);
  }
  const inline=[...h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for(const chunk of inline){
    if(chunk[1].trim())assert.doesNotThrow(()=>new vm.Script(chunk[1]));
  }
  assert.match(h,/syntheticData\(\)/);
  assert.match(h,/SYNTHETIC DRAFT/);
  assert.match(h,/crypto\.subtle\.digest/);
});
