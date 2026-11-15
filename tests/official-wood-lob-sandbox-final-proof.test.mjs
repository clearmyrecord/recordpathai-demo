import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const script=readFileSync(new URL("../scripts/lob-two-form-sandbox-qa.sh",import.meta.url),"utf8");

test("Official form-only Lob proof starts from the Clerk's current source and strips the two guidance pages",()=>{
  assert.match(script,/clerkofcourt\.co\.wood\.oh\.us\/DocumentCenter\/View\/142\/Application-for-Sealing/);
  assert.match(script,/len\(source\.pages\)!=4/);
  assert.match(script,/for i in \(2,3\): writer\.add_page\(source\.pages\[i\]\)/);
  assert.match(script,/ADDRESSVERIFICATION/);
  assert.match(script,/APPLICATIONTOSEALRECORD/);
});

test("Operator-only final sandbox test is read-only with respect to live Stripe and Lob",()=>{
  assert.match(script,/\/api\/operator\/lob-test-check-pdf/);
  assert.match(script,/\/api\/operator\/lob-test-check-status/);
  assert.match(script,/\/api\/operator\/packet\/launch-readiness/);
  assert.match(script,/proofContentsVerified/);
  assert.match(script,/officialFormStructureConfirmed/);
  assert.match(script,/r\.get\("readyForLiveFiling"\) is False/);
  assert.doesNotMatch(script,/api\/operator\/packet\/dispatch-lob|api\/create-checkout-session|liveDispatchEnabled=true/);
  assert.match(script,/set \+x/);
  assert.match(script,/unset OPS/);
});

test("The Lob PDF URL must be signed HTTPS for the exact sandbox check ID",()=>{
  assert.match(script,/host\.scheme!="https"/);
  assert.match(script,/host\.hostname!="lob-assets\.com"/);
  assert.match(script,/host\.path != "\/checks\/"\+data\.get\("testCheckId",""\)\+"\.pdf"/);
  assert.match(script,/len\(proof\.pages\)==4/);
});
