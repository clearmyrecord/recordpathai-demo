import test from "node:test";
import assert from "node:assert/strict";
import {assessLobSandboxProof,trustedLobProofUrl} from "../src/lob-sandbox-proof-audit.js";
import {readFileSync} from "node:fs";
const id="chk_A12Bc34";
const url="https://lob-assets.com/checks/"+id+".pdf?version=v1&signature=TEST&expires=1800000000";
const check={id,status:"rendered",amount:100,url,mail_type:"usps_first_class"};
const address="SEALING/EXPUNGEMENT ADDRESS VERIFICATION: PERSONAL IDENTIFIERS; NAME OF PARTY; PO BOX/APARTMENT NUMBER";
const application="IN THE STATE OF OHIO CASE JUDGE APPLICATION TO SEAL RECORD OF CONVICTION NAME OF OFFENSE CHARGE OFFENSE CODE DEGREE OF OFFENSE APPLICANTS RESPECTFULLY SUBMITTED";
const proofPageTexts=["TEST CHECK - NOT A REAL PAYMENT","CHECK BACK - TEST",address,application];

test("only the Lob signed HTTPS check asset URL with exact check id is trusted",()=>{
  assert.equal(trustedLobProofUrl(url,id),true);
  for(const candidate of [
    "http://lob-assets.com/checks/"+id+".pdf",
    "https://lob-assets.com.evil.example/checks/"+id+".pdf",
    "https://lob-assets.com@evil.example/checks/"+id+".pdf",
    "https://lob-assets.com/checks/chk_other.pdf",
    "https://lob-assets.com/checks/"+id+".pdf#section",
    "https://lob-assets.com/letters/"+id+".pdf",
    "https://lob-assets.com:8443/checks/"+id+".pdf"
  ]) assert.equal(trustedLobProofUrl(candidate,id),false,candidate);
});
test("rendered Lob sandbox proof requires one correct $100 check and two ordered court attachment pages",()=>{
  const result=assessLobSandboxProof({checkId:id,check,proofPageTexts});
  assert.equal(result.proofContentsVerified,true);
  assert.equal(result.proofPages,4);
  assert.equal(result.twoFormPagesConfirmed,true);
  assert.equal(result.officialFormStructureConfirmed,true);
  for(const modified of [
    {check:{...check,status:"processed"}},
    {check:{...check,amount:99}},
    {check:{...check,url:"https://evil.example/check.pdf"}},
    {check:{...check,id:"chk_wrong"}},
    {proofPageTexts:proofPageTexts.slice(0,3)},
    {proofPageTexts:[...proofPageTexts,application]},
    {proofPageTexts:[...proofPageTexts.slice(0,2),application,address]},
    {proofPageTexts:[...proofPageTexts.slice(0,2),"CAN I SEAL OR EXPUNGE MY CRIMINAL RECORD",application]}
  ]){
    const audit=assessLobSandboxProof({checkId:id,check,proofPageTexts,...modified});
    assert.equal(audit.proofContentsVerified,false,JSON.stringify(modified));
  }
});
test("legacy Lob status and launch audit are read-only and check rendered contents before marking proof",()=>{
  const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const start=server.indexOf('app.get("/api/operator/lob-test-check-status"');
  const end=server.indexOf('app.post("/api/operator/stripe-test-checkout"',start);
  const route=server.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(route,/requireOperationsKey\(req,res\)/);
  assert.match(route,/auditLobSandboxCheckProof\(result,id\)/);
  assert.match(route,/proofPdfUrl/);
  assert.doesNotMatch(route,/method:"POST"|https:\/\/api\.stripe\.com/);
  const readiness=server.split('app.get("/api/operator/packet/launch-readiness"')[1]?.split("// Explicit operator action only.",1)[0];
  assert.ok(readiness);
  assert.match(readiness,/testProofContentsVerified=proofAudit\.proofContentsVerified/);
  assert.match(readiness,/lob_test_proof_content_not_verified/);
  assert.match(readiness,/testProofContentsVerified,testProofPages,officialFormStructureConfirmed/);
  assert.match(readiness,/readyForLiveFiling:false/);
  assert.doesNotMatch(readiness,/method:"PATCH"|process\.env\.RECORDPATH_ENABLE_LIVE_DISPATCH="true"/);
});
