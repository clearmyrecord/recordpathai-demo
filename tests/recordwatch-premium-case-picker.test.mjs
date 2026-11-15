import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const dashboard=readFileSync(new URL("../recordwatch-dashboard.html",import.meta.url),"utf8");
const recordwatch=readFileSync(new URL("../recordwatch.html",import.meta.url),"utf8");
const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");

test("when no saved case is selected, the $39 dashboard offers existing saved cases instead of an eligibility dead end",()=>{
  const panel=dashboard.split("function renderPremiumPanels(cases)")[1]
    .split("function bindPremiumPanelEvents()",1)[0];
  assert.ok(panel);
  assert.match(panel,/savedCaseChoices=verifiedSavedCases\.map\(toRecordWatchCase\)\.filter/);
  assert.match(panel,/Select a saved case to purchase Premium/);
  assert.match(panel,/The \$39 purchase applies only to that saved case/);
  assert.match(panel,/encodeURIComponent\(item\.id\)/);
  assert.match(panel,/esc\(label\)/);
  assert.match(panel,/chooseSavedCase\) \+/);
  assert.match(panel,/No active, verified Supabase case is available for checkout/);
  assert.match(panel,/caseId \? '<form id="recordwatchPreCheckoutForm"/);
});

test("RecordWatch purchase CTA navigates only with an authenticated Supabase-saved case ID",()=>{
  const start=recordwatch.indexOf('document.querySelectorAll("[data-recordwatch-checkout]")');
  const end=recordwatch.indexOf('document.getElementById("recordwatchEnrollmentForm")',start);
  assert.ok(start>=0 && end>start);
  const snippet=recordwatch.slice(start,end);
  assert.match(recordwatch,/store\.getSupabaseCases\(\)/);
  assert.match(snippet,/if\(!caseRow\)/);
  assert.match(snippet,/encodeURIComponent\(caseRow\.case_id\)/);
  assert.match(snippet,/#recordwatchPremiumPanel/);
  assert.doesNotMatch(snippet,/localStorage/);
});

test("customer must still own a real saved Supabase case and accept checkout terms",()=>{
  const start=server.indexOf('app.post("/api/recordwatch/checkout"');
  const end=server.indexOf('app.post("/api/recordwatch/verify-checkout"',start);
  assert.ok(start>=0 && end>start);
  const route=server.slice(start,end);
  assert.match(route,/getSavedCaseReviewFacts\(user\.id,savedCaseId\)/);
  assert.match(route,/purchase_terms_acknowledged!==true/);
  assert.match(route,/lifetimeCasePurchaseAvailable\(current,savedCaseId\)/);
});
