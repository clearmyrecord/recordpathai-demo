import test from "node:test";
import assert from "node:assert/strict";
import {isWoodConvictionFormPair,isOfficialWoodConvictionFormPair,normalizeWoodFormHeading} from "../src/wood-form-pages.js";

const plain = [
  "COURT OF COMMON PLEAS SEALING / EXPUNGEMENT ADDRESS VERIFICATION NAME OF PARTY",
  "IN THE COURT OF COMMON PLEAS APPLICATION TO SEAL RECORD OF CONVICTION - O.R.C. 2953.32"
];
const pua = text => [...text].map(ch => {
  const cp=ch.charCodeAt(0);
  return cp>=0x20&&cp<=0x7E?String.fromCharCode(cp+0xF000):ch;
}).join("");

test("normalizes official PDF U+F000 symbol font heading encoding",()=>{
  assert.equal(normalizeWoodFormHeading(pua("Address Verification")),"ADDRESSVERIFICATION");
  assert.equal(normalizeWoodFormHeading("APPLICATION TO SEAL RECORD"),"APPLICATIONTOSEALRECORD");
});
test("accepts plain or legacy-encoded two official form headings",()=>{
  assert.equal(isWoodConvictionFormPair(plain),true);
  assert.equal(isWoodConvictionFormPair(plain.map(pua)),true);
});
test("rejects wrong page count, swapped pages, missing conviction and guide pages",()=>{
  assert.equal(isWoodConvictionFormPair([...plain,"guide"]),false);
  assert.equal(isWoodConvictionFormPair(plain.slice().reverse()),false);
  assert.equal(isWoodConvictionFormPair([plain[0],"APPLICATION TO SEAL RECORD"]),false);
  assert.equal(isWoodConvictionFormPair([plain[0]+" Can I seal or expunge my criminal record?",plain[1]]),false);
  assert.equal(isWoodConvictionFormPair([plain[0],"APPLICATION TO SEAL RECORD OF CONVICTION Can I seal or expunge my criminal record?"]),false);
  assert.equal(isWoodConvictionFormPair(null),false);
});

const official = [
  "COURT OF COMMON PLEAS WOOD COUNTY OHIO GENERAL DIVISION PERSONAL IDENTIFIERS Pursuant to Ohio Rule of Superintendence 45 D 1 SEALING / EXPUNGEMENT ADDRESS VERIFICATION DATE NAME OF PARTY STREET P.O. BOX / APARTMENT NUMBER CITY / STATE ZIP CODE E-mail Address",
  "IN THE COURT OF COMMON PLEAS WOOD COUNTY OHIO State of Ohio Plaintiff vs Defendant Case No Judge APPLICATION TO SEAL RECORD OF CONVICTION O.R.C. 2953.32 Applicant respectfully applies to this Court for sealing. Name of Offense / Charge Offense Code Degree of Offense Applicant’s sentence terminated on. Respectfully submitted Applicant / Defendant"
];
test("production accepts structural text of the published Wood County forms",()=>{
  assert.equal(isOfficialWoodConvictionFormPair(official),true);
  assert.equal(isOfficialWoodConvictionFormPair(official.map(pua)),true);
});
test("production rejects synthetic lookalikes even when the two headings match",()=>{
  assert.equal(isWoodConvictionFormPair(plain),true);
  assert.equal(isOfficialWoodConvictionFormPair(plain),false);
  assert.equal(isOfficialWoodConvictionFormPair(official.map((v,i)=>v+(i===0?" SANDBOX TEST ONLY":""))),false);
  assert.equal(isOfficialWoodConvictionFormPair(official.map((v,i)=>v+(i===1?" NOT FOR COURT FILING":""))),false);
  assert.equal(isOfficialWoodConvictionFormPair(official.slice().reverse()),false);
});
