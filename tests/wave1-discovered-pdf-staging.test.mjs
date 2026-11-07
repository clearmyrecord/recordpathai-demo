import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {buildReviewCandidate} from "../tools/stage-wave1-mapper-candidate.mjs";
const OFFICIAL_PDF="assets/forms/ga/statewide/arrest-agency/restrict-arrest-record-prior-2013.pdf";
test("a discovered multi-county Wave 1 form is scanned once but remains unapproved",async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),"wave1-form-review-"));
 const sourceId="synthetic-georgia-statewide-source";
 const ledgerPath=path.join(temp,"review-ledger.json");
 const source={
  id:sourceId,sourceUrl:"https://gbi.georgia.gov/services/georgia-criminal-history-record-restrictions",
  formType:"record-restriction",title:"Georgia record restriction test review",
  counties:["13121","13089"],discoveredAt:"2026-11-07T00:00:00Z",
  approved:false,active:false,status:"source_verification_required"
 };
 try{
  await fs.writeFile(ledgerPath,JSON.stringify({counties:{},sources:[source]}));
  const manifest=await buildReviewCandidate({
   sourceId,countyFips:"13121",courtType:"arrest-agency",courtName:"Sample Georgia arrest records agency",
   pdfLocalPath:OFFICIAL_PDF,
   pdfSourceUrl:"https://gbi.georgia.gov/services/georgia-criminal-history-record-restrictions",
   ledgerPath
  });
  assert.equal(manifest.jurisdiction.state,"GA");
  assert.equal(manifest.jurisdiction.county,"Fulton");
  assert.equal(manifest.review.status,"pending_review");
  assert.equal(manifest.mapping.status,"draft");
  assert.equal(manifest.review.sourceVerified,false);
  assert.equal(manifest.review.mappingApproved,false);
  assert.equal(manifest.review.legalRoutingApproved,false);
  assert.equal(manifest.active,false);
  assert.ok(/^[a-f0-9]{64}$/.test(manifest.pdf.sha256));
  assert.ok(manifest.mapping.suggestions.length>0);
  assert.equal(manifest.source.wave1LeadId,sourceId);
  assert.deepEqual(manifest.source.proposedCoverageCountyFips,["13089","13121"]);
  assert.equal(manifest.source.proposedCoverageRequiresCourtVerification,true);
  await assert.rejects(()=>buildReviewCandidate({
   sourceId,countyFips:"32003",courtType:"arrest-agency",courtName:"Wrong state",
   pdfLocalPath:OFFICIAL_PDF,pdfSourceUrl:source.sourceUrl,ledgerPath
  }),/association/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
