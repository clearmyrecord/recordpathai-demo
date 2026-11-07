import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";
import {validManifest,normalizeCourtCase,run} from "../tools/import-authorized-court-jsonl.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function source(){
 return {sourceKey:"oh-wood-court-monthly-2026-11",
 issuingAgency:"Example clerk for synthetic test",state:"OH",countyFips:"39173",
 officialSourceUrl:"https://example.gov/court/export",dataAsOf:"2026-11-07",
 authorityReference:"synthetic-authority-only-test",authorizedBy:"synthetic-reviewer"};
}
function fakeCase(){
 return {sourceCaseKey:"EXAMPLE-CASE-1",state:"OH",countyFips:"39173",
  courtName:"Example Court",caseNumber:"2006CR0001",defendantName:"Fictional Person",
  charges:[
   {sourceChargeKey:"count-1",originalCharge:"Original",originalStatute:"123.456",
    finalCharge:"Reduced",finalStatute:"123.457",offenseLevel:"F5",
    finalDisposition:"Dismissed",dispositionDate:"2020-06-05",
    terminationDate:"2021-07-01",verifiedTerminationDate:"2021-07-01",
    terminationEvidenceReference:"untrusted-applicant-claim"},
   {sourceChargeKey:"count-2",originalCharge:"Second",finalCharge:"Second",
    finalDisposition:"",dispositionDate:"",terminationDate:""}
  ]};
}
test("private manifest requires jurisdiction and proof of authorized access",()=>{
 const m=validManifest(source());
 assert.equal(m.status,"quarantined");
 assert.equal(m.jurisdiction_state,"OH");
 assert.equal(m.county_fips,"39173");
 assert.throws(()=>validManifest({...source(),authorityReference:""}));
 assert.throws(()=>validManifest({...source(),officialSourceUrl:"http://example.org"}));
 assert.throws(()=>validManifest({...source(),countyFips:"123"}));
});
test("source original and final charges preserved; source cannot claim verified supervision completion",()=>{
 const m=validManifest(source());
 const r=normalizeCourtCase(fakeCase(),m);
 assert.equal(r.caseRecord.docket_review_status,"needs_review");
 assert.equal(r.charges.length,2);
 assert.equal(r.charges[0].original_charge,"Original");
 assert.equal(r.charges[0].final_charge,"Reduced");
 assert.equal(r.charges[0].disposition_date,"2020-06-05");
 assert.equal(r.charges[0].reported_termination_date,"2021-07-01");
 assert.equal(r.charges[0].verified_supervision_termination_date,null);
 assert.equal(r.charges[0].termination_evidence_reference,null);
 assert.equal(r.charges[1].final_disposition,null);
});
test("reject multi-jurisdiction rows, duplicate charge IDs and incomplete identity",()=>{
 const m=validManifest(source()),row=fakeCase();
 assert.throws(()=>normalizeCourtCase({...row,state:"NV"},m),/State mismatch/);
 assert.throws(()=>normalizeCourtCase({...row,countyFips:"32003"},m),/County FIPS mismatch/);
 assert.throws(()=>normalizeCourtCase({...row,defendantName:""},m));
 assert.throws(()=>normalizeCourtCase({...row,charges:[row.charges[0],row.charges[0]]},m),/Duplicate/);
});
test("dry-run validates synthetic court JSONL but makes no database request",async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"recordpathai-private-source-"));
 try{
  const manifest=path.join(tmp,"authorization.json");
  const jsonl=path.join(tmp,"records.jsonl");
  await fs.writeFile(manifest,JSON.stringify(source()));
  await fs.writeFile(jsonl,JSON.stringify(fakeCase())+"\n");
  const result=await run(["--input="+jsonl,"--manifest="+manifest],{});
  assert.equal(result.mode,"DRY_RUN");
  assert.equal(result.cases,1);assert.equal(result.chargeRows,2);
  await assert.rejects(()=>run(["--input="+jsonl,"--manifest="+manifest,"--execute"],{}),
    /authorization acknowledgment/);
  await assert.rejects(()=>run(["--input="+jsonl,"--manifest="+manifest,"--execute","--ack-authorized"],
    {RECORDPATH_PRIVATE_INGEST_ENABLED:"true"}),/secret unavailable/);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test("database migration is locked to service role, never public or authenticated",async()=>{
 const file=await fs.readFile(path.join(root,"supabase/migrations/20261107000000_private_court_source_staging.sql"),"utf8");
 for(const table of ["court_source_import_batches","court_source_case_versions","court_source_charge_versions"]){
  assert.ok(file.includes("alter table public."+table+" enable row level security"));
  assert.ok(file.includes("revoke all on public."+table+" from public, anon, authenticated"));
 }
 assert.match(file,/check \(.*status in \('quarantined'/);
 assert.match(file,/verified_termination_requires_evidence/);
 assert.doesNotMatch(file,/grant select[^;]+to authenticated/i);
});

test("private exports cannot be packed into Git, Cloud Run source or the container",async()=>{
 for(const file of [".gitignore",".gcloudignore",".dockerignore"]){
  const rules=await fs.readFile(path.join(root,file),"utf8");
  for(const pattern of ["private-exports/","private-records/","*.jsonl","*.dat","*.csv","*.xlsx"])
   assert.ok(rules.includes(pattern),file+" must exclude "+pattern);
 }
});
