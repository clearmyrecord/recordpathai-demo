import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const start=server.indexOf('app.post("/api/operator/lob-test-dismissal-letter-pdf"');
const end=server.indexOf("// Read a Lob TEST proof",start);
const route=server.slice(start,end);

test("dismissal letter proof endpoint is operator-only and uses the Lob sandbox key",()=>{
  assert.ok(start>=0&&end>start);
  assert.match(route,/requireOperationsKey\(req,res\)/);
  assert.match(route,/process\.env\.LOB_TEST_API_KEY/);
  assert.match(route,/!key\.startsWith\("test_"\)/);
  assert.doesNotMatch(route,/LOB_LIVE_API_KEY|stripe\.|supabaseRest\(/);
});
test("dismissal probe accepts only the two official pages and creates no court check",()=>{
  assert.match(route,/pdf\.numPages!==2/);
  assert.match(route,/isOfficialWoodDismissalFormPair\(texts\)/);
  assert.match(route,/https:\/\/api\.lob\.com\/v1\/letters/);
  assert.match(route,/fields\.append\("file"/);
  assert.match(route,/courtFeeCents:0/);
  assert.match(route,/"Idempotency-Key":idempotency/);
  assert.doesNotMatch(route,/\/v1\/checks|bank_account|amount:"100"/);
});
test("a rejected test letter never claims live readiness",()=>{
  assert.match(route,/if\(!lob\.ok\)return res\.status\(502\)/);
  assert.match(route,/live dismissal mailing must remain disabled/);
  assert.match(route,/Inspect the rendered proof before enabling live mailing/);
});
