import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCourtPdfHeading,isWoodTwoFormPacket} from "../src/wood-form-text.js";
import fs from "node:fs";

const pua=s=>Array.from(s,c=>String.fromCharCode(c.codePointAt(0)+0xF000)).join("");

test("normalize ordinary PDF heading with spaces, slashes, and punctuation",()=>{
  assert.equal(normalizeCourtPdfHeading("Sealing / Expungement Address Verification"),
    "SEALINGEXPUNGEMENTADDRESSVERIFICATION");
});
test("decode original court PDF private-use glyph encoding",()=>{
  assert.equal(normalizeCourtPdfHeading(pua("Address Verification")),"ADDRESSVERIFICATION");
  assert.equal(normalizeCourtPdfHeading(pua("Application To Seal Record")),"APPLICATIONTOSEALRECORD");
});
test("two exact filing form pages are required in correct order",()=>{
  const page1=pua("Sealing / Expungement Address Verification");
  const page2=pua("Application To Seal Record Of Conviction");
  assert.equal(isWoodTwoFormPacket([page1,page2]),true);
  assert.equal(isWoodTwoFormPacket([page2,page1]),false);
  assert.equal(isWoodTwoFormPacket(["Can I seal my criminal record?",page1,page2]),false);
  assert.equal(isWoodTwoFormPacket([page1,"eligibility waiting periods"]),false);
  assert.equal(isWoodTwoFormPacket([page1]),false);
  assert.equal(isWoodTwoFormPacket([page1,page2,"eligibility guide"]),false);
  assert.equal(isWoodTwoFormPacket([pua("address verification"),page2]),true);
});
test("private upload and Lob test both invoke same normalized form validator",()=>{
  const server=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  assert.match(server,/import \{ isWoodTwoFormPacket \} from "\.\/src\/wood-form-text\.js"/);
  assert.equal(server.match(/isWoodTwoFormPacket\(/g)?.length,2);
  assert.match(server,/pdfPages!==2/);
  assert.match(server,/count!==2\|\|!isWoodTwoFormPacket\(labels\)/);
});
