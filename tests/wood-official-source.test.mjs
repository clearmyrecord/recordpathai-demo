import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {isOfficialWoodConvictionFormPair} from "../src/wood-form-pages.js";

const pdfPath=new URL("../assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-32-conviction.pdf",import.meta.url);
const mapPath=new URL("../templates/ohio/wood-county/sealing-conviction.json",import.meta.url);

test("bundled official Wood PDF has four pages and recognizable form pages 3 and 4",async()=>{
  const pdf=await getDocument({data:new Uint8Array(readFileSync(pdfPath)),useSystemFonts:true}).promise;
  try{
    assert.equal(pdf.numPages,4);
    const texts=[];
    for(const n of [3,4]){
      const page=await pdf.getPage(n);
      const content=await page.getTextContent();
      texts.push(content.items.map(x=>String(x.str||"")).join(" "));
    }
    assert.ok(isOfficialWoodConvictionFormPair(texts),
      "Bundled PDF does not match the court's official form structure; review extracted text before release.");
  } finally{await pdf.destroy();}
});

test("bundled coordinate map targets only form pages and includes signature",()=>{
  const mapping=JSON.parse(readFileSync(mapPath,"utf8"));
  assert.equal(mapping.pageCount,4);
  assert.equal(mapping.pageWidth,768);
  assert.equal(mapping.pageHeight,994);
  assert.equal(mapping.coordinateSystem,"top-left-reference-viewport");
  assert.equal(mapping.sourcePdfSha256,"cffa9718af0a0f1ebb3f6a14eeede2865c300148275ec1ef427df25c02f0c584");
  assert.ok(mapping.mappings.length>=20);
  assert.ok(mapping.mappings.every(f=>[3,4].includes(Number(f.page))));
  assert.equal(new Set(mapping.mappings.map(f=>f.id)).size,mapping.mappings.length,
    "mapping ids must identify one field location each");
  assert.ok(mapping.mappings.some(f=>f.type==="signature"&&Number(f.page)===4));
  for(const key of ["petitioner.full_name","court.case_number",
    "charges.0.disposition_date","charges.0.discharge_date"]){
    assert.ok(mapping.mappings.some(f=>f.name===key),key+" mapping missing");
  }
  const at=(name,page)=>mapping.mappings.find(f=>f.name===name&&Number(f.page)===page);
  assert.deepEqual(
    [at("generated.current_date",3).x,at("generated.current_date",3).y,
      at("generated.current_date",3).width,at("generated.current_date",3).height],
    [133,432,195,24]);
  assert.deepEqual(
    [at("court.case_number",4).x,at("court.case_number",4).y,
      at("court.case_number",4).width,at("court.case_number",4).height],
    [531,153,144,23]);
  assert.deepEqual(
    [at("charges.0.charge_name",4).x,at("charges.0.charge_name",4).y,
      at("charges.0.charge_name",4).width,at("charges.0.charge_name",4).height],
    [83,480,260,28]);
  assert.deepEqual(
    [at("charges.0.discharge_date",4).x,at("charges.0.discharge_date",4).y,
      at("charges.0.discharge_date",4).width,at("charges.0.discharge_date",4).height],
    [141,630,233,15]);
});
