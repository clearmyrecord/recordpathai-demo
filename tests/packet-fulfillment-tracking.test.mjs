import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {projectPacketFulfillment} from "../src/packet-fulfillment-tracking.js";
const read = file => readFileSync(new URL("../"+file,import.meta.url),"utf8");
const server=read("server.js");
const page=read("recordwatch-dashboard.html");
const ui=read("js/recordwatch-filing-tracker.js");
const draft={signed_pdf_sha256:"a".repeat(64),signed_pdf_private_path:"private/packets/case/doc.pdf"};
const review={status:"approved",signed_pdf_sha256:draft.signed_pdf_sha256,
  signed_pdf_private_path:draft.signed_pdf_private_path};
const base={status:"paid_hold",court_fee_cents:10000,payment_method:"lob_check",
  created_at:"2026-11-08T00:00:00Z",updated_at:"2026-11-08T00:00:00Z"};

test("Free saved case has no fabricated packet, charge, Lob or court confirmation",()=>{
  const result=projectPacketFulfillment();
  assert.equal(result.status,"not_paid");
  assert.equal(result.packet_payment_verified,false);
  assert.equal(result.lob_submitted,false);
  assert.equal(result.mailed_verified,false);
  assert.equal(result.delivered_verified,false);
  assert.equal(result.court_receipt_verified,false);
  assert.equal(result.postal_tracking_number,null);
  assert.equal(result.steps.length,7);
  assert.ok(result.steps.every(s=>s.state==="pending"));
});

test("Private signed PDF is visible before payment without unlocking court filing",()=>{
  const result=projectPacketFulfillment({draft,review});
  assert.equal(result.signed_pdf_uploaded,true);
  assert.equal(result.independently_reviewed,true);
  assert.equal(result.packet_payment_verified,false);
  assert.equal(result.lob_submitted,false);
});

test("Webhook paid_hold shows $50 plus court deposit and explicitly not mailed",()=>{
  const result=projectPacketFulfillment({draft,review,job:base});
  assert.equal(result.packet_payment_verified,true);
  assert.equal(result.preparation_fee_cents,5000);
  assert.equal(result.court_fee_cents,10000);
  assert.equal(result.lob_check_reference,null);
  assert.equal(result.mailed_verified,false);
  assert.match(result.summary,/nothing has been mailed/);
  assert.equal(result.steps[2].state,"complete");
  assert.equal(result.steps[3].state,"pending");
});

test("Submitted Lob order is not the same as USPS mailing",()=>{
  const result=projectPacketFulfillment({draft,review,
    job:{...base,status:"submitted_to_lob",lob_check_id:"chk_Abcd1234"}});
  assert.equal(result.lob_submitted,true);
  assert.equal(result.lob_check_reference,"chk_Abcd1234");
  assert.equal(result.mailed_verified,false);
  assert.equal(result.postal_tracking_number,null);
  assert.equal(result.court_receipt_verified,false);
});
test("Only a reported mailing followed by delivery can complete delivery stage",()=>{
  const result=projectPacketFulfillment({draft,review,
    job:{...base,status:"delivered",lob_check_id:"chk_Abcd1234",
      mailed_at:"2026-11-09T00:00:00Z"}});
  assert.equal(result.lob_submitted,true);
  assert.equal(result.mailed_verified,true);
  assert.equal(result.delivered_verified,true);
  assert.equal(result.court_receipt_verified,false);
  assert.equal(result.steps.at(-1).state,"pending");
});
test("Failed fulfillment never instructs another charge or mailing",()=>{
  const result=projectPacketFulfillment({draft,review,job:{...base,status:"failed"}});
  assert.match(result.summary,/Do not purchase another packet or resubmit mail/);
  assert.equal(result.mailed_verified,false);
});
test("Tracking API requires case owner and is read-only",()=>{
  assert.match(server,/app\.get\("\/api\/packet\/filing-status",async\(req,res\)=>/);
  assert.match(server,/await getSavedCaseReviewFacts\(user\.id,caseId\)/);
  assert.match(server,/projectPacketFulfillment\(/);
  assert.match(server,/packet_fulfillment_jobs/);
  assert.match(server,/No charge or mailing was created by this request/);
  assert.match(ui,/\/api\/packet\/filing-status\?case_id=/);
  assert.match(ui,/headers:\{"Authorization":"Bearer "\+token\}/);
  assert.match(page,/id="recordwatchFilingStatus"/);
  assert.match(page,/id="recordwatchFilingSteps"/);
});
