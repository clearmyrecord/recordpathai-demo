import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {savedChargeOutcome,expectedFormType} from "../src/packet-release.js";
import {findCourtProfile} from "../src/court-profiles.js";

const source=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
const code=source.slice(source.indexOf("function customerDismissalReviewAllowed("),source.indexOf("async function approvedPreviewForCase("));
const allowed=vm.runInNewContext(code+"\ncustomerDismissalReviewAllowed",{findCourtProfile,savedChargeOutcome});
const savedCase={case_state:"OH",county:"Wood",court_type:"court-of-common-pleas",outcome:"convicted",
  metadata:{recordPathCaseReview:{all_charges_confirmed:"yes",proceedings_status:"none"}}};
const dismissed={flags:{recordPathIntake:{final_disposition:"Dismissed",disposition_date:"2020-02-12"}}};
test("Private upload and digital review route from the stored count outcome",()=>{
  assert.equal(expectedFormType(savedCase,[dismissed]),"sealing-dismissal");
  assert.equal(allowed({savedCase,charges:[dismissed]}),true);
  for(const other of [{},{final_disposition:"Convicted"},{final_disposition:"Pending"}]){
    assert.equal(expectedFormType(savedCase,[dismissed,other]),"");
    assert.equal(allowed({savedCase,charges:[dismissed,other]}),false);
  }
});
test("Customer dismissal review requires a verified charge set, disposition date and court",()=>{
  for(const changes of [{county:"Other"},{court_type:"municipal"},{metadata:{}}])
    assert.equal(allowed({savedCase:{...savedCase,...changes},charges:[dismissed]}),false);
  for(const date of ["","2020-02-31","2099-01-01"])
    assert.equal(allowed({savedCase,charges:[{final_disposition:"Dismissed",disposition_date:date}]}),false);
});
