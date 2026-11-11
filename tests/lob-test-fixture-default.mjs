import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const start=source.indexOf('app.post("/api/operator/lob-test-check"');
const end=source.indexOf('app.get("/api/operator/lob-test-check-status"',start);
const route=source.slice(start,end);
test("sandbox uses only synthetic publicly readable form fixture when no override",()=>{
  assert.ok(start>0 && end>start);
  assert.ok(route.includes("assets/lob-wood-two-form-TEST-ONLY.pdf"));
  assert.ok(route.includes("process.env.LOB_TEST_API_KEY"));
  assert.ok(route.includes('key.startsWith("test_")'));
  assert.ok(route.includes("isWoodConvictionFormPair(labels)"));
  assert.ok(!route.includes("DocumentCenter/View/142"));
  assert.ok(!route.includes("LOB_LIVE_API_KEY"));
  assert.ok(!route.includes("RECORDPATH_ENABLE_LIVE_DISPATCH"));
});