import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {run} from "../tools/convert-wood-county-joined-csv.mjs";
import {validManifest,normalizeCourtCase} from "../tools/import-authorized-court-jsonl.mjs";

const heads=[
 "Report Year","Case ID","Defendant Name","Aliases (same source file)","DOB",
 "Offense Description","Offense Degree","Charge Code / Statute","Charge Number",
 "Charge Status (Source)","Charge Status Date","Disposition Date","Termination Date",
 "Join Status","Charge Source Line","Source DAT File","Gmail Message ID",
 "Original Charge Code (Before Audit)","Statute Code Audit",
 "Adjacent case recurrence","Unique charge key (case|count|person)",
 "Date evidence (unverified)","Sealing screen color (current)",
 "Docket verification (separate)","Scenario sealing date (not verified)",
 "Scenario expungement date (not verified)"
];
const base={
 "Case ID":"2006CR0001","Defendant Name":"FICTIONAL, TEST",
 "Offense Description":"Possession of a sample substance",
 "Offense Degree":"Felony 5th Degree","Charge Code / Statute":"2925.11",
 "Charge Number":"1","Source DAT File":"sample.dat",
 "Charge Source Line":"42","Original Charge Code (Before Audit)":"2925.11",
 "Statute Code Audit":"Standard","Sealing screen color (current)":"Blue - scenario"
};
function csvLine(obj){
 return heads.map(k=>{
  const v=String(obj[k]??"");
  return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
 }).join(",");
}
function fakeCsv(){
 const records=[
  {...base,"Report Year":"2025","Charge Status (Source)":"",
   "Disposition Date":"01/02/2020","Termination Date":"03/04/2021",
   "DOB":"01/01/1900","Aliases (same source file)":"SECRET ALIAS",
   "Gmail Message ID":"private-message-id"},
  {...base,"Report Year":"2026","Charge Status (Source)":"DISMISSED",
   "Charge Status Date":"01/02/2022","Disposition Date":"02/03/2022",
   "Termination Date":"03/04/2023","Sealing screen color (current)":"Green - provisional"},
  {...base,"Report Year":"2026","Defendant Name":"ANOTHER, FICTIONAL",
   "Charge Number":"2","Offense Description":"Another fake count"}
 ];
 return [heads.join(","),...records.map(csvLine)].join("\r\n")+"\r\n";
}
const manifest=()=>validManifest({
 sourceKey:"oh-wood-fictitious-2026-11",
 issuingAgency:"Synthetic test only",state:"OH",countyFips:"39173",
 officialSourceUrl:"https://example.org/test",dataAsOf:"2026-11-18",
 authorityReference:"synthetic-authorization",authorizedBy:"synthetic-tester"
});

test("annual duplicate source exports produce distinct private case/charge groups",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"wood-test-"));
 try{
  const input=path.join(dir,"wood.csv"),output=path.join(dir,"wood.jsonl");
  await fs.writeFile(input,fakeCsv());
  const stats=await run(["--input="+input,"--output="+output,"--expect-rows=3"]);
  assert.deepEqual(stats,{
   rawChargeRows:3,caseGroups:2,provisionalChargeGroups:2,
   repeatedExportRows:1,caseIdsWithMultipleDefendantNames:1,
   legalEligibilityDeterminations:0,mode:"PRIVATE_JSONL_CREATED",databaseRowsWritten:0
  });
  const lines=(await fs.readFile(output,"utf8")).trim().split("\n").map(JSON.parse);
  const joined=lines.find(c=>c.defendantName==="FICTIONAL, TEST");
  assert.ok(joined);
  assert.equal(joined.charges.length,1);
  assert.equal(joined.charges[0].sourceReportYear,2026);
  assert.equal(joined.charges[0].reportedChargeStatus,"DISMISSED");
  assert.equal(joined.charges[0].sourceScreenColor,"green");
  assert.equal(joined.charges[0].dispositionDate,"2022-02-03");
  assert.equal(joined.charges[0].terminationDate,"2023-03-04");
  assert.equal(joined.charges[0].finalDisposition,null);
  assert.equal(joined.charges[0].finalCharge,null);
  assert.doesNotMatch(await fs.readFile(output,"utf8"),/SECRET ALIAS|private-message-id|01\/01\/1900/);
  const normalized=normalizeCourtCase(joined,manifest());
  const charge=normalized.charges[0];
  assert.equal(charge.final_disposition,null);
  assert.equal(charge.reported_charge_status,"DISMISSED");
  assert.equal(charge.reported_charge_status_date,"2022-01-02");
  assert.equal(charge.source_screen_color,"green");
  assert.equal(charge.verified_supervision_termination_date,null);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test("row-count mismatch fails without writing any output",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"wood-test-"));
 try{
  const input=path.join(dir,"data.csv"),output=path.join(dir,"data.jsonl");
  await fs.writeFile(input,fakeCsv());
  await assert.rejects(()=>run(["--input="+input,"--output="+output,"--expect-rows=54548"]),
   /row-count reconciliation failed/);
  await assert.rejects(()=>fs.access(output));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
