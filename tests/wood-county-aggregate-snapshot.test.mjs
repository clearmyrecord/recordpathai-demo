import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Wood County aggregate snapshot reconciles and cannot unlock filing",async()=>{
 const content=await fs.readFile(new URL("../data/wood-county-screening-snapshot.json",import.meta.url),"utf8");
 const s=JSON.parse(content);
 assert.equal(s.sourceChargeRows,54548);
 assert.equal(s.sourceDistinctCaseIds,14884);
 assert.equal(Object.values(s.screeningChargeRows).reduce((a,b)=>a+b,0),54548);
 assert.equal(s.screeningChargeRows.blue,14350);
 assert.equal(s.screeningChargeRows.green,16746);
 assert.equal(s.screeningChargeRows.red,9943);
 assert.equal(s.screeningChargeRows.yellow,13509);
 assert.equal(s.sourceDedupQA.repeatedExportRowsConsolidated+
              s.sourceDedupQA.provisionalChargeGroups,s.sourceChargeRows);
 assert.equal(s.readiness.privateRecordsImported,false);
 assert.equal(s.readiness.publicRecordSearchEnabled,false);
 assert.equal(s.readiness.legalEligibilityCertified,false);
 assert.equal(s.readiness.automaticPaymentAllowed,false);
 assert.equal(s.readiness.automaticFilingAllowed,false);
 assert.doesNotMatch(content,/\b\d{4}CR\d{4}\b|defendant_name|date_of_birth/i);
});
test("pilot page renders aggregates only and states the legal caveats",async()=>{
 const html=await fs.readFile(new URL("../admin/wood-county-pilot.html",import.meta.url),"utf8");
 assert.match(html,/wood-county-screening-snapshot\.json/);
 assert.match(html,/not verified eligibility/i);
 assert.match(html,/not proof of final discharge/i);
 assert.doesNotMatch(html,/court_source_case_versions|service_role|sourceCaseKey/);
});
