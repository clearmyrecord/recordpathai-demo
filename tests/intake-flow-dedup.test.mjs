import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const step1 = readFileSync("eligibility.html", "utf8");
const step2 = readFileSync("record-details.html", "utf8");
const flow = readFileSync("js/workflow.js", "utf8");
const mapped = readFileSync("js/wave1-intake-ui.js", "utf8");
const bridge = readFileSync("js/packet-data-bridge.js", "utf8");

const extractSelect = (html, id) => {
  const match = html.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)<\\/select>'));
  assert.ok(match, "Missing state selector: " + id);
  return match[1];
};

test("Step 1 collects personal details only, once each", () => {
  const paths = [...step1.matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
  assert.ok(paths.length >= 9);
  assert.equal(paths.length, new Set(paths).size, "Do not ask the same identity question twice");
  assert.ok(paths.every(path => path.startsWith("petitioner.")), "Step 1 must have no case data");
  assert.match(step1, /id="fullName"/);
  assert.match(step1, /id="dateOfBirth"/);
  assert.doesNotMatch(step1, /id="firstName"/);
  assert.doesNotMatch(step1, /id="lastName"/);
  assert.doesNotMatch(step1, /id="screenChargeName"|id="screenOutcome"|id="caseState"|id="screenCounty"/);
  assert.doesNotMatch(step1, /id="formRequirementsPanel"/);
});

test("Step 2 contains court, cases, counts and their individual dates without re-asking identity", () => {
  assert.match(step2, /id="caseState"/);
  assert.match(step2, /id="caseNumber"/);
  assert.match(step2, /id="county"/);
  assert.match(step2, /data-field="original_charge_name"/);
  assert.match(step2, /data-field="final_disposition"/);
  assert.match(step2, /data-field="disposition_date"/);
  assert.match(step2, /data-field="discharge_date"/);
  assert.doesNotMatch(step2, /id="fullName"|id="dateOfBirth"|id="email"|id="phone"|id="residenceState"/);
  assert.doesNotMatch(step2, /id="finalDisposition"|id="dispositionDate"|id="dischargeDate"/);
  assert.doesNotMatch(step2, /data-field="pending_charges"/);
});

test("The filing state and arrest state support all 50 US states independent of residence", () => {
  for (const id of ["caseState", "arrestState"]) {
    const states = [...extractSelect(step2, id).matchAll(/<option value="([A-Z]{2})">/g)].map(m => m[1]);
    assert.equal(states.length, 50, id + " should list all 50 states");
    assert.equal(new Set(states).size, 50);
  }
  assert.match(extractSelect(step1, "residenceState"), /<option value="WY">Wyoming/);
});

test("Workflow step 1 is personal info; step 2 is all case data; Step 1 doesn't require case state", () => {
  assert.match(flow, /id: "eligibility", label: "Personal Information"/);
  assert.match(flow, /id: "record-details", label: "Case Information"/);
  const eligibilityCheck = flow.match(/function deriveEligibilityComplete\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.match(eligibilityCheck, /return Boolean\(hasText\(fullName\)\)/);
  assert.doesNotMatch(eligibilityCheck, /&& caseState/);
});

test("Mapped court fields cannot duplicate visible case questions or personal details", () => {
  assert.match(mapped, /x\.key\.startsWith\("petitioner\."\)/);
  for (const field of ["court.state", "court.court_type", "court.prosecutor_agency", "case.all_charges_confirmed", "case.proceedings_status"]) {
    assert.ok(mapped.includes('"' + field + '":'), "missing dedup mapping: " + field);
  }
});

test("Canonical legal name cannot be overwritten by legacy first/last aliases", () => {
  assert.match(bridge, /if \(normalizeString\(p\.full_name\)\.trim\(\)\) return;/);
  assert.match(step1, /id="dateOfBirth" data-path="petitioner\.dob"/);
  assert.match(step1, /data\?\.court\?\.state/);
});


test("The reviewed court docket link is a prominent, accessible button-style link", () => {
  assert.match(step2, /<a id="recordCollectionDocketLink" class="btn btn-primary record-docket-button" href="#" target="_blank" rel="noopener noreferrer" hidden>/);
  assert.match(step2, /#recordCollectionDocketLink\\.record-docket-button\\[hidden\\]\\s*\\{\\s*display: none;/);
  assert.match(step2, /#recordCollectionDocketLink\\.record-docket-button:focus-visible/);
  assert.match(step2, /#recordCollectionDocketLink\\.record-docket-button\\s*\\{[\\s\\S]*?background: #1455b3;/);
});
