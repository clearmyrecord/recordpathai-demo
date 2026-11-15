import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packet=readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const section=(first,last)=>{
  const a=packet.indexOf(first),b=packet.indexOf(last,a);
  assert.ok(a>=0 && b>a,"missing packet code section");
  return packet.slice(a,b);
};

test("checkout readiness never trusts browser-local completed-step flags",()=>{
  const gate=section("function ensureCheckoutPrerequisites()","// The same mapped renderer");
  assert.match(gate,/packetContactProfileLoaded/);
  assert.match(gate,/accountSelectedCaseId/);
  assert.match(gate,/readPacketData\(\)/);
  assert.doesNotMatch(gate,/RecordPathWorkflow|localStorage/);
  assert.doesNotMatch(packet,/RecordPathWorkflow\.guardPage\("packet"\)/);
});

test("selected checkout case is freshly loaded from owner-scoped Supabase",()=>{
  const resolver=section("async function resolveCheckoutCase()","function eligibilityFieldsForSavedCase(");
  assert.match(resolver,/getSupabaseCaseById\(accountSelectedCaseId\)/);
  assert.match(resolver,/source:"supabase"/);
  assert.doesNotMatch(resolver,/getCaseById\(|getActiveCase\(|visibleSelectedPacketRecord\(/);
});

test("approved packet checkout does not rewrite case or charges",()=>{
  const save=section("async function saveCheckoutCaseIfNeeded(","function serverReadinessUrl(");
  assert.match(save,/getSupabaseCaseById\(id\)/);
  assert.doesNotMatch(save,/\.saveCase\(|saveCurrentCaseDraft\(|\.update\(|\.upsert\(/);
});

test("intake summary updates after Supabase confirms the filing contact",()=>{
  const persist=section("async function persistPacketContactForReview()","function readPacketData()");
  assert.match(persist,/\.from\("profiles"\)/);
  assert.match(persist,/updateSummary\(buildNormalizedPacketData\(readPacketData\(\)\)\)/);
});
