import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const start=server.indexOf('app.get("/api/operator/packet/launch-readiness"');
const end=server.indexOf('// Explicit operator action only.',start);
const route=server.slice(start,end);
test("operator launch readiness is authentication protected and read only",()=>{
  assert.ok(start>0 && end>start);
  assert.match(route,/requireOperationsKey\(req,res\)/);
  assert.match(route,/Cache-Control","no-store, private"/);
  assert.doesNotMatch(route,/stripe\.checkout\.sessions\.create|api\.lob\.com\/v1\/checks",\s*\{/);
  assert.doesNotMatch(route,/method:"PATCH"|method:"DELETE"/);
  assert.ok(!route.includes('process.env.RECORDPATH_ENABLE_LIVE_DISPATCH="true"'));
  assert.ok(!route.includes('process.env.LOB_LIVE_CHECKS_ENABLED="true"'));
  assert.match(route,/readyForLiveFiling:false/);
});
test("Lob processed status does not count as rendered PDF proof",()=>{
  assert.match(route,/testProofRendered=testProofStatus==="rendered"/);
  assert.match(route,/lob_test_proof_not_yet_rendered/);
  assert.match(route,/lob_test_proof_not_specified/);
  assert.match(route,/testProofStatus="not_checked"/);
});
test("launch audit is independent of live flag when verifying bank in read-only mode",()=>{
  assert.ok(route.includes("https://api.lob.com/v1/bank_accounts/"));
  assert.match(route,/liveBankVerified=row\.id===bank && row\.verified===true/);
  assert.match(route,/wood_county_clerk_mailing_acceptance_unconfirmed/);
  assert.match(route,/signed_stripe_event_to_paid_hold_not_proven/);
  assert.match(route,/packet_payment_webhook_receipts/);
  assert.match(route,/signedEventDeliveryProven=true/);
  assert.match(route,/evidenceScope:"production_live_paid_packet_only"/);
  assert.match(route,/reserve_packet_lob_dispatch/);
  assert.match(route,/cs_test_launch_preflight_NEVER_CHARGE/);
});
