import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
test("sandbox proof endpoint requires operator secret and a test Lob API key",()=>{
  const start=s.indexOf('app.get("/api/operator/lob-test-check-status"');
  const end=s.indexOf('app.post("/api/operator/stripe-test-checkout"',start);
  assert.ok(start>0 && end>start);
  const route=s.slice(start,end);
  assert.match(route,/requireOperationsKey\(req,res\)/);
  assert.match(route,/process\.env\.LOB_TEST_API_KEY/);
  assert.match(route,/key\.startsWith\("test_"\)/);
  assert.doesNotMatch(route,/LOB_LIVE_API_KEY|LOB_VERIFIED_BANK_ID|https:\/\/api\.stripe\.com/);
  assert.match(route,/method:\s*"POST"|\.get\(/);
  assert.match(route,/proofPdfUrl/);
  assert.match(route,/Cache-Control/);
});
test("Lob sandbox proof retrieval is separate from the creation route",()=>{
  assert.match(s,/app\.post\("\/api\/operator\/lob-test-check"/);
  assert.match(s,/app\.get\("\/api\/operator\/lob-test-check-status"/);
  const proofStart=s.indexOf('app.get("/api/operator/lob-test-check-status"');
  const proofEnd=s.indexOf('app.post("/api/operator/stripe-test-checkout"',proofStart);
  const proof=s.slice(proofStart,proofEnd);
  assert.match(proof,/fetch\("https:\/\/api\.lob\.com\/v1\/checks\/"\+id/);
  assert.doesNotMatch(proof,/method:\s*"POST"|\.sessions\.create\(|\.checks\.create\(/);
});
