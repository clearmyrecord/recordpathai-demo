import test from "node:test";
import assert from "node:assert/strict";
import {isWoodConvictionFormPair,normalizeWoodFormHeading} from "../src/wood-form-pages.js";

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
