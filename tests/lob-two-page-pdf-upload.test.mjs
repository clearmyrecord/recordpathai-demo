import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
const start=s.indexOf('app.post("/api/operator/lob-test-check-pdf"');
const end=s.indexOf("// Authorized test-only proof polling.",start);
assert.ok(start>0&&end>start,"Sandbox route not found");
const route=s.slice(start,end);

test("sandbox PDF upload requires operator key, test key and 2 verified forms",()=>{
  assert.match(route,/requireOperationsKey\(req,res\)/);
  assert.match(route,/express\.raw\(\{type:"application\/pdf",limit:"4mb"\}\)/);
  assert.match(route,/LOB_TEST_API_KEY/);
  assert.match(route,/key\.startsWith\("test_"\)/);
  assert.match(route,/LOB_TEST_BANK_ACCOUNT_ID/);
  assert.match(route,/pages!==2\|\|!isWoodConvictionFormPair\(texts\)/);
  assert.doesNotMatch(route,/LOB_LIVE_API_KEY|LOB_VERIFIED_BANK_ID|STRIPE_SECRET_KEY|STRIPE_TEST_SECRET_KEY/);
});
test("sandbox sends blank PDF as multipart not remote or secret URL",()=>{
  assert.match(route,/new FormData\(\)/);
  assert.match(route,/fields\.append\("attachment",new Blob\(\[bytes\]/);
  assert.match(route,/Authorization:"Basic "/);
  assert.match(route,/https:\/\/api\.lob\.com\/v1\/checks/);
  assert.doesNotMatch(route,/attachment:testAttachment|private\/packets|signed_pdf_private_path/);
});
test("identical sandbox form upload is idempotent, never auto-mailed live",()=>{
  assert.match(route,/recordpathai-wood-two-pages-/);
  assert.match(route,/createHash\("sha256"\)/);
  assert.match(route,/"Idempotency-Key":idempotency/);
  assert.match(route,/environment:"test"/);
  assert.doesNotMatch(route,/RECORDPATH_ENABLE_LIVE_DISPATCH|LOB_LIVE_CHECKS_ENABLED|packet_fulfillment_jobs/);
});
