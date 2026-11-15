import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../dashboard.html", import.meta.url), "utf8");

test("RecordPathAI account overview prominently offers $39 RecordWatch Premium", () => {
  assert.match(dashboard, /id="purchaseRecordWatchPremium" class="btn"/);
  assert.match(dashboard, /Purchase RecordWatch Premium — \$39/);
  assert.match(dashboard, /recordwatch-dashboard\.html#recordwatchPremiumPanel/);
  assert.match(dashboard, /href="recordwatch-dashboard\.html">Open RecordWatch/);
});

test("account dashboard only forwards verified Supabase case IDs", () => {
  assert.match(dashboard, /const verifiedCaseIds = showingCachedCases \? \[\] : cases/);
  assert.match(dashboard, /\.filter\(isSavedCaseUuid\)/);
  assert.match(dashboard, /verifiedCaseIds\.includes\(activeCaseId\)/);
  assert.match(dashboard, /verifiedCaseIds\.length === 1 \? verifiedCaseIds\[0\] : ""/);
  assert.match(dashboard, /selectedRecordWatchCaseId \? "\?caseId=" \+ encodeURIComponent\(selectedRecordWatchCaseId\) : ""/);
  assert.match(dashboard, /#recordwatchPremiumPanel/);
});

test("purchase button respects genuine Premium and refunded case statuses", () => {
  assert.match(dashboard, /fetchPremiumSubscription\(verifiedCaseId\)/);
  assert.match(dashboard, /subscription = result && result\.subscription \|\| null/);
  assert.match(dashboard, /RecordWatchMessageProvider\.isPremium\(recordWatchData && recordWatchData\.subscription\)/);
  assert.match(dashboard, /purchaseLink\.textContent = "Manage RecordWatch Premium"/);
  assert.doesNotMatch(dashboard, /localStorage\.getItem\("recordwatchPremiumSubscription"\)/);
  assert.match(dashboard, /selectedVerifiedCase \? "Free" : "Select a saved case"/);
});
