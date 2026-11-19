import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {isOfficialWoodDismissalFormPair} from "../src/wood-form-pages.js";
import {courtFilingPlan} from "../src/court-profiles.js";

const root=new URL("..",import.meta.url);
const pdfPath=new URL("assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf",root);
const mapPath=new URL("templates/ohio/wood-county/sealing-dismissal.json",root);

test("bundled dismissal PDF is the official Wood County R.C. 2953.33 form",async()=>{
  const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(pdfPath)),useSystemFonts:true}).promise;
  try{
    assert.equal(pdf.numPages,4);
    const texts=[];
    for(const n of [3,4]){
      const page=await pdf.getPage(n);
      const content=await page.getTextContent();
      texts.push(content.items.map(x=>String(x.str||"")).join(" "));
    }
    assert.equal(isOfficialWoodDismissalFormPair(texts),true);
  } finally { await pdf.destroy(); }
});

test("dismissal mapping targets address verification, dismissal application, charges and signature",()=>{
  const mapping=JSON.parse(fs.readFileSync(mapPath,"utf8"));
  assert.equal(mapping.formType,"sealing-dismissal");
  assert.equal(mapping.pageCount,4);
  assert.ok(mapping.mappings.length>=30);
  assert.ok(mapping.mappings.every(field=>[3,4].includes(Number(field.page))));
  for(const name of ["petitioner.full_name","court.case_number",
    "court.judge_name","charges.0.disposition_date",
    "charges.3.charge_code","signatures.petitioner_signature_name"])
    assert.ok(mapping.mappings.some(field=>field.name===name),name);
});

test("dismissal quote is preparation only with no court fee",()=>{
  const plan=courtFilingPlan({state:"OH",county:"Wood",courtType:"court-of-common-pleas",formType:"sealing-dismissal"});
  assert.equal(plan.courtFeeCents,0);
  assert.match(plan.officialForm,/143\/Application-for-Sealing-295333-Dismissal/);
});

test("packet manifest activates the official dismissal form and mapping",()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL("../templates/index.json",import.meta.url),"utf8"));
  const entry=manifest.find(item=>item.state==="OH"&&item.county==="Wood"&&item.formType==="sealing-dismissal");
  assert.ok(entry);
  assert.equal(entry.status,"active");
  assert.equal(entry.pdfPath,"assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf");
  assert.equal(entry.mappingPath,"templates/ohio/wood-county/sealing-dismissal.json");
});
