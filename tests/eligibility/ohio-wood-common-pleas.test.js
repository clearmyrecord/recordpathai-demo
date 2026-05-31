import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = { console, Date, Math, setTimeout, clearTimeout };
context.window = context;
context.globalThis = context;
context.location = { protocol: "file:" };
context.fetch = async () => ({ ok: true, json: async () => ({}) });
const store = new Map();
context.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};
vm.createContext(context);
[
  "js/rules/date-utils.js",
  "js/rules/state-rules/ohio.js",
  "js/rules/state-rules/nevada.js",
  "js/rules/state-rules/north-carolina.js",
  "js/rules/court-profiles/ohio/wood-county-common-pleas.js",
  "js/rules/court-profiles/ohio/wood-county-municipal.js",
  "js/rules/court-registry.js",
  "js/rules/rule-resolver.js",
  "js/rules/rule-engine.js",
  "js/recordwatch-rules.js",
  "js/recordwatch-notifications.js"
].forEach((file) => vm.runInContext(readFileSync(file, "utf8"), context, { filename: file }));

function baseCase(overrides = {}) {
  return {
    caseState: "OH",
    county: "Wood County",
    courtName: "Wood County Common Pleas",
    courtType: "common pleas",
    reliefType: "conviction sealing",
    charges: [{ chargeName: "Possession of Drugs", offenseCode: "2925.11(A)", offenseLevel: "Felony 3 / F3" }],
    disposition: "Convicted",
    sentenceCompletionDate: "2010-05-07",
    ...overrides
  };
}
function resolve(overrides) { return context.resolveEligibilityForCase(baseCase(overrides)); }

let result = resolve();
assert.equal(result.courtProfile.court_id, "oh_wood_common_pleas");
assert.equal(result.ruleSet.rule_set_id, "ohio_conviction_sealing_2953_32");
assert.equal(result.requiredWaitingPeriodLabel, "3 years");
assert.equal(result.estimatedEligibleDate, "2013-05-07");
assert.equal(result.eligibilityStatus, "likely_eligible");

result = resolve({ charges: [{ chargeName: "F4 test", offenseLevel: "F4" }] });
assert.equal(result.requiredWaitingPeriodLabel, "1 year");
assert.equal(result.estimatedEligibleDate, "2011-05-07");

result = resolve({ charges: [{ chargeName: "M test", offenseLevel: "Misdemeanor" }] });
assert.equal(result.requiredWaitingPeriodLabel, "1 year");
assert.equal(result.estimatedEligibleDate, "2011-05-07");

result = resolve({ charges: [{ chargeName: "MM test", offenseLevel: "Minor misdemeanor" }] });
assert.equal(result.requiredWaitingPeriodLabel, "6 months");
assert.equal(result.estimatedEligibleDate, "2010-11-07");

assert.equal(resolve({ charges: [{ chargeName: "F1", offenseLevel: "F1" }] }).eligibilityStatus, "not_eligible");
assert.equal(resolve({ charges: [{ chargeName: "F2", offenseLevel: "F2" }] }).eligibilityStatus, "not_eligible");
assert.equal(resolve({ disqualifyingFlags: { f3_felony_count: 3 } }).eligibilityStatus, "not_eligible");
assert.equal(resolve({ pendingCharges: true }).eligibilityStatus, "not_eligible");

result = resolve({ sentenceCompletionDate: "", dischargeDate: "", finalDischargeDate: "", completionDate: "" });
assert.equal(result.eligibilityStatus, "needs_review");
assert.ok(result.missingRequirements.includes("Final completion/discharge date"));

store.set("recordwatchEligibilityEvents", JSON.stringify([{ id: "old", user_id: "demo-user", case_id: "2006CR083", eligibility_date: "2015-05-07", reminder_90_sent: true }]));
context.RecordWatchNotifications.registerEligibilityEvent({ userId: "demo-user", caseId: "2006CR083", eligibilityDate: "2013-05-07", eligibilityReason: "likely_eligible", waitingPeriod: "3 years" });
const event = JSON.parse(store.get("recordwatchEligibilityEvents"))[0];
assert.equal(result = event.eligibility_date, "2013-05-07");
assert.equal(event.reminder_90_sent, false);

console.log("Ohio Wood County Common Pleas eligibility rules passed.");
