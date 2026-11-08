import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const details = readFileSync("record-details.html", "utf8");
const step1 = readFileSync("eligibility.html", "utf8");
const intake = readFileSync("js/wave1-intake-ui.js", "utf8");
const feeSource = readFileSync("js/filing-fee-summary.js", "utf8");
const sandbox = {};
vm.runInNewContext(feeSource, sandbox);
const fees = sandbox.RecordPathFilingFees;

test("Ohio conviction court fees are separate from RecordPathAI's service charge", () => {
  const result = fees.describe("OH", [{ final_disposition: "Convicted" }]);
  assert.match(result.heading, /\\$50 state fee.*\\$50 local court fee/);
  assert.match(result.detail, /poverty affidavit/);
  assert.match(result.sourceUrl, /2953\\.32$/);
  assert.match(details, /\\$50 for your final packet and tracked mailing/);
  assert.match(details, /Charged only at checkout, not during case intake/);
});

test("Dismissed, not-guilty, and no-bill Ohio cases do not display conviction application fee", () => {
  for (const final_disposition of ["Dismissed", "Not Guilty", "Acquitted", "No Bill"]) {
    const result = fees.describe("OH", [{ final_disposition }]);
    assert.match(result.heading, /no \\$50 conviction-application fee/);
    assert.match(result.sourceUrl, /2953\\.33$/);
  }
  const mixed = fees.describe("OH", [
    { final_disposition: "Dismissed" },
    { final_disposition: "Convicted" }
  ]);
  assert.match(mixed.heading, /\\$50 state fee/);
  assert.match(mixed.detail, /Mixed convicted and dismissed outcomes/);
});

test("Other states and unknown dispositions show cautious court-specific guidance", () => {
  assert.match(fees.describe("NY", [{ final_disposition: "Convicted" }]).heading, /confirm with your filing court/);
  assert.equal(fees.describe("", []).sourceUrl, "");
  assert.match(fees.describe("OH", [{ final_disposition: "Pending" }]).detail, /Verify unknown or mixed outcomes/);
});

test("Case inputs, including partial charge cards and mapped court-form inputs, save before refresh", () => {
  assert.match(details, /const hasTypedValue = Array\\.from\\(card\\.querySelectorAll/);
  assert.match(details, /if \\(!hasTypedValue\\) return;/);
  assert.doesNotMatch(details, /if \\(!charge\\.charge_name && !charge\\.charge_code && !charge\\.final_disposition\\) return;/);
  assert.match(details, /function scheduleAutosave\\(\\) \\{[\\s\\S]*?const result = saveDraft\\(false, \\{ quiet: true \\}\\);/);
  assert.match(details, /window\\.addEventListener\\("pagehide"/);
  assert.match(details, /document\\.addEventListener\\("visibilitychange"/);
  assert.match(details, /Saved in this browser/);
  assert.match(step1, /field\\.addEventListener\\("input", saveEligibilityIntake\\)/);
  assert.match(intake, /input\\.addEventListener\\("input",saveMappedField\\)/);
  assert.match(details, /hydrateCharges\\(data\\)/);
});

test("RecordWatch is an opt-in action, while saving locally requires no sign-in", () => {
  assert.match(details, /id="saveRecordWatchBtn"/);
  assert.match(details, /recordPathRecordWatchOptIn/);
  assert.match(details, /if \\(!isRecordWatchEnabled\\(\\) \\|\\| !window\\.RecordWatchBridge\\) return;/);
  assert.match(details, /localStorage\\.setItem\\(RECORDWATCH_OPT_IN_KEY, "true"\\)/);
  assert.doesNotMatch(details, /RecordPathAuth\\.requireAuth\\("save progress"/);
  assert.match(details, /persistCurrentCaseDraft\\(result\\.casePayload, false\\)/);
  assert.match(step1, /localStorage\\.getItem\\("recordPathRecordWatchOptIn"\\) === "true"/);
});

test("The Ohio pilot review is not presented in the customer case intake", () => {
  assert.doesNotMatch(intake, /renderOhioPilotReview\\(|ohioPilotLegalReview|Ohio pilot intake/);
  assert.doesNotMatch(details, /src="js\\/ohio-case-review\\.js"/);
  assert.match(details, /id="formRequirementsReviewDetails"/);
  assert.match(details, /id="filingFeesPanel"/);
  assert.match(details, /id="courtFeeHeading"/);
  assert.match(details, /id="courtFeeSource"/);
  assert.match(intake, /document\\.getElementById\\("formRequirementsReviewDetails"\\)/);
});
