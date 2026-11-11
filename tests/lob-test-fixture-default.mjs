import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const route=source.slice(source.indexOf('app.post("/api/operator/lob-test-check"'),source.indexOf('app.get("/api/operator/lob-test-check-status"'));
test("sandbox uses only synthetic publicly readable form fixture when no override",()=>{
  assert.match(route,/assets\\/lob-wood-two-form-TEST-ONLY\\.pdf/);
  assert.match(route,/process\\.env\\.LOB_TEST_API_KEY/);
  assert.match(route,/key\\.startsWith\\("test_"\\)/);
  assert.match(route,/isWoodConvictionFormPair\\(labels\\)/);
  assert.doesNotMatch(route,/DocumentCenter\\/View\\/142|LOB_LIVE_API_KEY|RECORDPATH_ENABLE_LIVE_DISPATCH/);
});