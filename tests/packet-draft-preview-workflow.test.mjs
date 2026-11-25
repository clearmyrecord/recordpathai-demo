import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const server=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../packet.html",import.meta.url),"utf8");

test("The packet UI follows actual customer steps rather than exposing a locked preview first",()=>{
  const first=html.indexOf('id="packetSubmitStep"');
  const second=html.indexOf('id="approvedPreviewPanel"');
  const third=html.indexOf('id="packetPaymentStep"');
  assert.ok(first>0 && first<second && second<third);
  assert.ok(html.indexOf('id="prepareSignedReviewBtn"')<html.indexOf('id="openApprovedPreviewBtn"'));
  assert.ok(html.indexOf('id="openApprovedPreviewBtn"')<html.indexOf('id="generateSealingBtn"'));
  assert.match(html,/Step 1 — Prepare and Submit Your Real Signed Packet/);
  assert.match(html,/Step 2 — Preview Your Actual Application/);
  assert.match(html,/Step 3 — Checkout After Independent Approval/);
});

test("Authenticated pending draft may be viewed as watermarked images, never unwatermarked PDF",()=>{
  const funcs=server.split('async function savedDraftPreviewForCase(userId,caseId)')[1]
    ?.split('async function previewHasConfirmation(',1)[0];
  assert.ok(funcs);
  assert.match(funcs,/getSavedCaseReviewFacts\(userId,caseId\)/);
  assert.match(funcs,/supabaseRest\("packet_drafts"/);
  assert.match(funcs,/caseReviewFingerprint\(facts.savedCase,facts.charges\)/);
  assert.match(funcs,/private_review_signature_mode!=="drawn"/);
  assert.match(funcs,/path!=="private\/packets\/"\+caseId\+"\/"\+sha\+"\.pdf"/);
  assert.match(funcs,/stage:"draft"/);
  assert.match(funcs,/approvedPreviewForCase\(userId,caseId\)/);
  assert.match(funcs,/stage:"approved"/);
  const preview=server.split('app.get("/api/packet/preview-manifest"')[1]
    ?.split('app.post("/api/packet/confirm-preview"',1)[0];
  assert.ok(preview);
  assert.match(preview,/customerPreviewForCase\(user.id,caseId\)/);
  assert.match(preview,/renderWatermarkedPreviewPage\(original,page,source.pageCount\)/);
  assert.match(preview,/Content-Type","image\/png"/);
  assert.doesNotMatch(preview,/Content-Type","application\/pdf"/);
  assert.match(preview,/reviewStatus:source.stage/);
});

test("Draft stage cannot confirm or buy; approval is still checked by the server",()=>{
  const confirm=server.split('app.post("/api/packet/confirm-preview"')[1]
    ?.split('// This endpoint never returns applicant data',1)[0];
  assert.ok(confirm);
  assert.match(confirm,/approvedPreviewForCase\(user.id,caseId\)/);
  assert.doesNotMatch(confirm,/customerPreviewForCase\(user.id,caseId\)/);
  const readiness=server.split('app.get("/api/packet/checkout-readiness"')[1]
    ?.split('app.get("/api/packet/preview-manifest"',1)[0];
  assert.match(readiness,/previewHasConfirmation\(user.id,caseId\)/);
  const checkout=server.split('app.post("/api/create-checkout-session"')[1]
    ?.split('app.get("/api/find-packet"',1)[0];
  assert.match(checkout,/previewHasConfirmation\(checkoutUser.id,savedCaseId,source\)/);
  const client=html.split('async function openApprovedPacketPreview()')[1]
    ?.split('async function confirmApprovedPacketPreview()',1)[0];
  assert.ok(client);
  assert.match(client,/const approved=manifest.reviewStatus==="approved"/);
  assert.match(client,/approvedPreviewConsentLabel"\)\.hidden=!approved/);
  assert.match(client,/confirmApprovedPreviewBtn"\)\.hidden=!approved/);
  assert.match(client,/Draft preview ready/);
  assert.doesNotMatch(client,/\.download\s*=/);
  const confirmation=html.split('async function confirmApprovedPacketPreview()')[1]
    ?.split('async function downloadApprovedPacket()',1)[0];
  assert.match(confirmation,/approvedPreviewState.stage!=="approved"/);
});

test("No draft is a guided Step 1 state, not a checkout error",()=>{
  assert.match(server,/No signed packet has been submitted yet\. First draw your signature/);
  const preview=html.split('async function openApprovedPacketPreview()')[1]
    ?.split('async function confirmApprovedPacketPreview()',1)[0];
  const catchBlock=preview.split('}catch(error){')[1]||"";
  assert.doesNotMatch(catchBlock,/setCheckoutError\(msg\)/);
  assert.match(html,/Your signed packet was received\. Select Preview My Signed Application/);
});
