import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  renderWatermarkedPreviewPage,confirmedPreviewMatches,PREVIEW_WATERMARK
} from "../src/packet-preview.js";

const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const page=readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const official=readFileSync(new URL("../assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-32-conviction.pdf",import.meta.url));

test("Real Clerk form is flattened into a WATERMARKED PNG, never distributed as PDF",async()=>{
  const result=await renderWatermarkedPreviewPage(official,3,4);
  assert.ok(Buffer.isBuffer(result));
  assert.equal(result.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.ok(result.length>10000);
  assert.ok(!result.subarray(0,1024).toString("latin1").includes("%PDF"));
  await assert.rejects(renderWatermarkedPreviewPage(official,5,4),/Invalid preview page|out of range|changed/);
  await assert.rejects(renderWatermarkedPreviewPage(official,3,2),/page count changed/);
  assert.equal(PREVIEW_WATERMARK,"PREVIEW ONLY - NOT FOR FILING");
});

test("Confirmed preview expires and binds exactly to the current approved PDF, account, and case snapshot",()=>{
  const now=new Date("2026-11-15T06:00:00Z");
  const sha="a".repeat(64),fingerprint="b".repeat(64);
  const source={userId:"user-a",caseId:"case-a",signedPdfSha:sha,caseSnapshotSha:fingerprint};
  const row={user_id:"user-a",case_id:"case-a",signed_pdf_sha256:sha,
    case_snapshot_sha256:fingerprint,confirmed_at:"2026-11-15T05:59:59Z"};
  assert.equal(confirmedPreviewMatches(row,source,now),true);
  assert.equal(confirmedPreviewMatches({...row,signed_pdf_sha256:"c".repeat(64)},source,now),false);
  assert.equal(confirmedPreviewMatches({...row,case_snapshot_sha256:"d".repeat(64)},source,now),false);
  assert.equal(confirmedPreviewMatches({...row,case_id:"other"},source,now),false);
  assert.equal(confirmedPreviewMatches({...row,user_id:"other"},source,now),false);
  assert.equal(confirmedPreviewMatches({...row,confirmed_at:"2026-08-01T00:00:00Z"},source,now),false);
  assert.equal(confirmedPreviewMatches({...row,confirmed_at:"2026-11-16T00:00:00Z"},source,now),false);
});

test("Prepayment preview endpoints never return original PDF, signed URL, or create a payment/check",()=>{
  const start=server.indexOf('app.get("/api/packet/preview-manifest"');
  const end=server.indexOf('// This endpoint never returns applicant data',start);
  assert.ok(start>0 && end>start);
  const area=server.slice(start,end);
  assert.match(area,/requireApiUser\(req,res\)/);
  assert.match(area,/approvedPreviewForCase\(user\.id,caseId\)/);
  assert.match(area,/fetchExactApprovedPreviewPdf\(source\)/);
  assert.match(area,/renderWatermarkedPreviewPage\(original,page,source\.pageCount\)/);
  assert.match(area,/res\.setHeader\("Content-Type","image\/png"\)/);
  assert.match(area,/res\.setHeader\("Content-Disposition","inline"\)/);
  assert.match(area,/private, no-store/);
  assert.match(area,/confirmed:true/);
  assert.doesNotMatch(area,/application\/pdf|storage\.createSignedUrl|checkout\.sessions\.create|dispatch-lob|signed_pdf_private_path/);
});

test("Both checkout-readiness and Stripe session creation REQUIRE server-owned matching preview acknowledgment",()=>{
  const readiness=server.split('app.get("/api/packet/checkout-readiness"')[1]?.split('app.get("/api/packet/preview-manifest"',1)[0];
  assert.ok(readiness);
  assert.match(readiness,/previewHasConfirmation\(user\.id,caseId\)/);
  assert.match(readiness,/const ready=result\.ready && confirmed/);
  const checkout=server.split('app.post("/api/create-checkout-session"')[1]?.split('app.get("/api/find-packet"',1)[0];
  assert.ok(checkout);
  assert.match(checkout,/previewHasConfirmation\(checkoutUser\.id,savedCaseId\)/);
  assert.match(checkout,/if\(!previewConfirmed\)/);
  assert.ok(checkout.indexOf("if(!previewConfirmed)")<checkout.indexOf("stripe.checkout.sessions.create("));
  const download=server.split('app.post("/api/packet/download-approved"')[1]?.split('app.post("/api/packet/verify-payment"',1)[0];
  assert.match(download,/verifiedPacketSession\(session,user\.id,caseId\)/);
  assert.match(download,/Content-Disposition[^\n]*attachment/);
});

test("UI offers only image preview and an explicit acknowledgment, not downloadable real PDFs before checkout",()=>{
  assert.match(page,/id="approvedPreviewPanel"/);
  assert.match(page,/id="approvedPreviewPages"/);
  assert.match(page,/id="approvedPreviewConsent"/);
  assert.match(page,/id="confirmApprovedPreviewBtn"/);
  assert.match(page,/id="downloadSamplePdfBtn" hidden aria-hidden="true" style="display:none;"/);
  const renderer=page.split("async function openApprovedPacketPreview()")[1]?.split("async function confirmApprovedPacketPreview()",1)[0];
  assert.ok(renderer);
  assert.match(renderer,/preview-manifest/);
  assert.match(renderer,/preview-page/);
  assert.match(renderer,/image\/png/);
  assert.match(renderer,/URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(renderer,/application\/pdf|\.download\s*=|downloadApprovedPacket\(/);
  const confirmer=page.split("async function confirmApprovedPacketPreview()")[1]?.split("async function downloadApprovedPacket()",1)[0];
  assert.match(confirmer,/previewAccuracyCheckbox|approvedPreviewConsent/);
  assert.match(confirmer,/confirm-preview/);
  assert.match(confirmer,/checkServerPacketReadiness/);
});
