import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { requireLobLiveDispatch } from "../src/lob-checks.js";
const funded = {
  RECORDPATH_ENABLE_LIVE_DISPATCH:"true",
  LOB_LIVE_CHECKS_ENABLED:"true",
  LOB_LIVE_API_KEY:"live_synthetic",
  LOB_VERIFIED_BANK_ID:"bank_SYNTHETIC"
};
test("verified bank and live key are insufficient without Lob attachment approval",()=>{
  assert.equal(requireLobLiveDispatch(funded),false);
  assert.equal(requireLobLiveDispatch({...funded,LOB_CHECK_ATTACHMENTS_APPROVED:"false"}),false);
});
test("live authorization also requires all original release switches",()=>{
  const permitted={...funded,LOB_CHECK_ATTACHMENTS_APPROVED:"true"};
  assert.equal(requireLobLiveDispatch(permitted),true);
  for(const prop of Object.keys(permitted)){
    assert.equal(requireLobLiveDispatch({...permitted,[prop]:""}),false,prop);
  }
});
test("server checkout readiness checks attachment approval separately from verified bank",()=>{
  const s=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  assert.match(s,/lobLiveEnabled:process\.env\.LOB_LIVE_CHECKS_ENABLED==="true" &&\s*process\.env\.LOB_CHECK_ATTACHMENTS_APPROVED==="true"/);
});
