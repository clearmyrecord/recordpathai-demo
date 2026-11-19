import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function section(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "expected source section");
  return text.slice(a, b);
}

test("Step 2 prefill cannot read an earlier browser case", () => {
  const html = source("record-details.html");
  const hydrate = section(html, "function hydrateStaticFields(data) {", "function hydrateCharges(data) {");
  const values = {};
  const context = vm.createContext({
    setValue: (key, value) => { values[key] = value; },
    localStorage: {getItem: () => { throw Error("browser data was read"); }}
  });
  vm.runInContext(hydrate + "\nhydrateStaticFields({court:{state:'OH',county:'Wood',name:'Common Pleas',case_number:'26-CR-1'},charges:[]});", context);
  assert.equal(values.caseState, "OH");
  assert.equal(values.county, "Wood");
  assert.equal(values.caseNumber, "26-CR-1");
  vm.runInContext("hydrateStaticFields({court:{},charges:[]});", context);
  for (const field of ["caseState", "county", "courtName", "caseNumber"])
    assert.equal(values[field], "", field + " should be blank when Supabase is blank");
});

test("Packet maps the saved judge and charge details without browser contact", () => {
  const store = source("js/user-store.js");
  const mapper = section(store, "function caseToPacketData(caseData) {", "function writeActiveCaseToStorage(caseData) {");
  const context = vm.createContext({
    normalizeCase: value => value,
    firstNonEmpty: (...values) => values.find(value => value !== undefined && value !== null && String(value).trim()) || ""
  });
  vm.runInContext(mapper + "\nthis.mapCase = caseToPacketData;", context);
  const packet = context.mapCase({
    caseState:"OH",county:"Wood",courtName:"Wood County Court of Common Pleas",
    caseNumber:"26-CR-1",courtType:"court-of-common-pleas",
    metadata:{judge_name:"Judge Saved",recordPathCaseReview:{
      all_charges_confirmed:"yes",proceedings_status:"none"
    },recordPathStep2:{schemaVersion:1,fields:{judgeName:"Judge Earlier"}}},
    chargeDetails:[{charge_name:"Test charge",offense_code:"2911.00",
      offense_level:"F5",flags:{recordPathIntake:{disposition_date:"2025-01-02"}}}]
  });
  assert.equal(packet.court.judge_name,"Judge Saved");
  assert.equal(packet.charges[0].disposition_date,"2025-01-02");
  assert.equal(packet.case.all_charges_confirmed,"yes");
  assert.equal(packet.petitioner,undefined,"account profile is the sole contact source");
});

test("Charge lookup scopes to the freshly authenticated owner", async () => {
  const store = source("js/user-store.js");
  const fetcher = section(store, "async function fetchCaseCharges(supabase, caseIds, userId) {", "async function refreshCases(options) {");
  const scope = [];
  const owner = "a1111111-1111-4111-8111-111111111111";
  const context = vm.createContext({
    isUuid: value => /^[a-f0-9-]{36}$/i.test(value),
    currentUser:{id:"b2222222-2222-4222-8222-222222222222"}
  });
  vm.runInContext(fetcher + "\nthis.fetchCharges = fetchCaseCharges;", context);
  const query = {
    select: () => query,
    in: () => query,
    eq: (key,value) => { scope.push([key,value]); return query; },
    order: () => Promise.resolve({data:[{case_id:"case-1",charge_name:"Saved charge"}]})
  };
  const result = await context.fetchCharges({from: () => query},["case-1"],owner);
  assert.equal(scope.find(([key]) => key === "user_id")?.[1],owner);
  assert.equal(result["case-1"][0].charge_name,"Saved charge");
  await assert.rejects(context.fetchCharges({from: () => query},["case-1"],""),/Authenticated case owner/);
});
