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
  assert.match(result.heading, /\$50 state fee.*\$50 local court fee/);
  assert.match(result.detail, /poverty affidavit/);
  assert.match(result.sourceUrl, /2953\.32$/);
  assert.match(details, /\$50 for your final packet and tracked mailing/);
  assert.match(details, /Charged only at checkout, not during case intake/);
});

test("Dismissed, not-guilty, and no-bill Ohio cases do not display conviction application fee", () => {
  for (const final_disposition of ["Dismissed", "Not Guilty", "Acquitted", "No Bill"]) {
    const result = fees.describe("OH", [{ final_disposition }]);
    assert.match(result.heading, /no \$50 conviction-application fee/);
    assert.match(result.sourceUrl, /2953\.33$/);
  }
  const mixed = fees.describe("OH", [
    { final_disposition: "Dismissed" },
    { final_disposition: "Convicted" }
  ]);
  assert.match(mixed.heading, /\$50 state fee/);
  assert.match(mixed.detail, /Mixed convicted and dismissed outcomes/);
});

test("Other states and unknown dispositions show cautious court-specific guidance", () => {
  assert.match(fees.describe("NY", [{ final_disposition: "Convicted" }]).heading, /confirm with your filing court/);
  assert.equal(fees.describe("", []).sourceUrl, "");
  assert.match(fees.describe("OH", [{ final_disposition: "Pending" }]).detail, /Verify unknown or mixed outcomes/);
});

test("Case inputs, including partial charge cards, save through Supabase instead of browser storage",()=>{
  const sync=readFileSync("js/record-details-fields.js","utf8");
  const store=readFileSync("js/user-store.js","utf8");
  assert.match(details,/const hasTypedValue = Array\.from\(card\.querySelectorAll/);
  assert.match(details,/if \(!hasTypedValue\) return;/);
  assert.match(details,/RecordPathRecordDetailsFields\.capture/);
  assert.match(details,/saveRecordDetailsToSupabase\(payload\)/);
  assert.match(details,/await store\.getSupabaseCaseById\(candidate\)/);
  assert.match(details,/Unsaved changes — synchronizing to Supabase/);
  assert.match(store,/hasPartialStep2/);
  assert.match(store,/await syncCharges\(data\.id,nextCase\)|await syncCharges\(data\.id, nextCase\)/);
  assert.match(sync,/schemaVersion:1,fields,charges/);
  assert.doesNotMatch(details,/RecordPathDataBridge\.savePacketData\(data\)/);
  assert.doesNotMatch(details,/window\.addEventListener\("pagehide"/);
  assert.match(step1,/field\.addEventListener\("input", saveEligibilityIntake\)/);
  assert.match(intake,/input\.addEventListener\("input",saveMappedField\)/);
});

test("RecordWatch displays account-saved Step 2 fields without Premium enrollment",()=>{
  const watch=readFileSync("recordwatch-dashboard.html","utf8");
  assert.match(details,/id="saveRecordWatchBtn"/);
  assert.match(details,/verifiedRemoteRecordWatchCase/);
  assert.match(details,/Browser drafts never become RecordWatch/);
  assert.match(details,/All saved case details are visible in RecordWatch/);
  assert.match(watch,/RecordPathRecordDetailsFields\.render\(sourceCase\.metadata\?\.recordPathStep2\)/);
  assert.match(watch,/store\.getSupabaseCases\(\),store\.getSupabaseProfile\(\)/);
  assert.doesNotMatch(details,/localStorage\.setItem\(RECORDWATCH_OPT_IN_KEY, "true"\)/);
  assert.match(details,/persistCurrentCaseDraft\(result\.casePayload,false\)/);
  assert.match(step1,/localStorage\.getItem\("recordPathRecordWatchOptIn"\) === "true"/);
});

test("The Ohio pilot review is not presented in the customer case intake", () => {
  assert.doesNotMatch(intake, /renderOhioPilotReview\(|ohioPilotLegalReview|Ohio pilot intake/);
  assert.doesNotMatch(details, /src="js\/ohio-case-review\.js"/);
  assert.match(details, /id="formRequirementsReviewDetails"/);
  assert.match(details, /id="filingFeesPanel"/);
  assert.match(details, /id="courtFeeHeading"/);
  assert.match(details, /id="courtFeeSource"/);
  assert.match(intake, /document\.getElementById\("formRequirementsReviewDetails"\)/);
});


test("RecordWatch case normalization keeps individual outcomes and proof dates after account save", async () => {
  const storeSource = readFileSync("js/user-store.js", "utf8");
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const context = {
    localStorage,
    console,
    URL,
    CustomEvent: class { constructor() {} },
    document: { dispatchEvent() {} },
    window: { location: { pathname: "/record-details.html", origin: "https://recordpathai.com", search: "" } }
  };
  vm.runInNewContext(storeSource, context);
  const store = context.window.RecordPathUserStore;
  await store.ready;
  const original = {
    charge_name: "Possession",
    charge_code: "2925.11",
    degree: "F5",
    original_charge_name: "Trafficking allegation",
    original_charge_code: "2925.03",
    final_disposition: "Convicted",
    disposition_date: "2008-04-09",
    discharge_date: "2010-06-15",
    notes: "Plea reduced from original allegation",
    isViolentOffense: false
  };
  const entered = store.normalizeCase({
    caseState: "OH", county: "Wood", courtName: "Wood County Court of Common Pleas",
    caseNumber: "SYNTHETIC-2008", charges: [original]
  });
  const chargeSavedToDb = entered.chargeDetails[0];
  assert.equal(chargeSavedToDb.flags.recordPathIntake.original_charge_name, original.original_charge_name);
  assert.equal(chargeSavedToDb.flags.recordPathIntake.discharge_date, original.discharge_date);
  // Simulate the schema-backed fields returned by case_charges after logging in on another device.
  const reloaded = store.normalizeCase({
    caseState: "OH", county: "Wood", courtName: "Wood County Court of Common Pleas",
    caseNumber: "SYNTHETIC-2008",
    charges: [{
      charge_name: chargeSavedToDb.charge_name,
      offense_code: chargeSavedToDb.offense_code,
      offense_level: chargeSavedToDb.offense_level,
      offense_date: chargeSavedToDb.offense_date,
      charge_notes: chargeSavedToDb.charge_notes,
      flags: chargeSavedToDb.flags
    }]
  });
  assert.equal(reloaded.chargeDetails[0].original_charge_name, original.original_charge_name);
  assert.equal(reloaded.chargeDetails[0].final_disposition, original.final_disposition);
  assert.equal(reloaded.chargeDetails[0].disposition_date, original.disposition_date);
  assert.equal(reloaded.chargeDetails[0].discharge_date, original.discharge_date);
  const restored = store.caseToPacketData(reloaded).charges[0];
  assert.equal(restored.original_charge_code, original.original_charge_code);
  assert.equal(restored.final_disposition, original.final_disposition);
  assert.equal(restored.discharge_date, original.discharge_date);
  assert.equal(restored.notes, original.notes);
});

test("court type survives nested snake_case packet data and existing saved case updates",()=>{
  const storeSource = readFileSync("js/user-store.js", "utf8");
  const context = {
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    console,URL,
    CustomEvent:class {constructor(){}},
    document:{dispatchEvent(){}},
    window:{location:{pathname:"/record-details.html",origin:"https://recordpathai.com",search:""}}
  };
  vm.runInNewContext(storeSource,context);
  const normalized=context.window.RecordPathUserStore.normalizeCase({
    court:{state:"OH",county:"Wood",name:"Wood County Court of Common Pleas",
      court_type:"court-of-common-pleas",caseNumber:"SYNTHETIC"}
  });
  assert.equal(normalized.courtType,"court-of-common-pleas");
  assert.match(storeSource,/courtType: firstNonEmpty\(court\.type, court\.courtType, court\.court_type\)/);
  assert.match(storeSource,/if \(!payload\.court_type && existing\.court_type\) payload\.court_type = existing\.court_type/);
});

test("Saved case to packet projection carries the exact structured court type",async()=>{
  const source=readFileSync("js/user-store.js","utf8");
  const context={
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    console,URL,CustomEvent:class{constructor(){}},
    document:{dispatchEvent(){}},
    window:{location:{pathname:"/record-details.html",origin:"https://recordpathai.com",search:""}}
  };
  vm.runInNewContext(source,context);
  const store=context.window.RecordPathUserStore;
  await store.ready;
  const p=store.caseToPacketData({caseState:"OH",county:"Wood",
    courtName:"Wood County Court of Common Pleas",courtType:"court-of-common-pleas",
    caseNumber:"SAMPLE-ACCOUNT-CASE",charges:[{charge_name:"Synthetic possession",final_disposition:"Convicted"}]});
  assert.equal(p.court.court_type,"court-of-common-pleas");
  assert.equal(p.court.case_type,"court-of-common-pleas");
});
