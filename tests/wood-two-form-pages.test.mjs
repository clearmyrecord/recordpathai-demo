import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const from=html.indexOf("function trimWoodConvictionGuidance(");
const until=html.indexOf("function fieldPath(",from);
assert.ok(from>0 && until>from,"missing Wood County PDF trim helper");
const code=html.slice(from,until);
const trim=vm.runInNewContext(`(() => {
  function normalizeFields(mapping){return mapping.mappings||mapping.fields||[];}
  ${code}
  return trimWoodConvictionGuidance;
})()`);
const selected={state:"OH",county:"Wood",courtType:"court-of-common-pleas",
  formType:"sealing-conviction",
  pdfPath:"assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-32-conviction.pdf"};
const mapping={pageCount:4,mappings:[{page:3,type:"text"},
  {page:4,type:"signature"},{page:4,type:"text"}]};
function fakePdf(names=["guide 1","guide 2","address form","signed application"]){
  const pages=[...names];
  return {pages,getPageCount:()=>pages.length,
    removePage:index=>pages.splice(index,1)};
}
test("Wood County mailed PDF preserves only forms 3-4 in correct order",()=>{
  const doc=fakePdf();
  trim(doc,selected,mapping);
  assert.deepEqual(doc.pages,["address form","signed application"]);
});
test("stale source, changed form mapping, and altered PDF block mailing",()=>{
  for(const [form,sourceMap,doc] of [
    [{...selected,pdfPath:"unexpected.pdf"},mapping,fakePdf()],
    [selected,{...mapping,pageCount:3},fakePdf()],
    [selected,{pageCount:4,mappings:[{page:1,type:"text"},{page:4,type:"signature"}]},fakePdf()],
    [selected,{pageCount:4,mappings:[{page:3,type:"text"},{page:4,type:"text"}]},fakePdf()],
    [selected,mapping,fakePdf(["guide","address form","application"])]
  ]) assert.throws(()=>trim(doc,form,sourceMap),/remapping review/);
});
test("non-Wood forms are not trimmed accidentally",()=>{
  const doc=fakePdf();
  trim(doc,{...selected,county:"Franklin"},mapping);
  assert.equal(doc.getPageCount(),4);
});
test("server only stores verified two-page Wood filings",()=>{
  const server=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const start=server.indexOf('app.post("/api/packet/private-upload"');
  const end=server.indexOf("app.use(express.json())",start);
  assert.ok(start>0 && end>start);
  const route=server.slice(start,end);
  assert.match(route,/pdfPages!==2/);
  // The route intentionally delegates legacy-PDF heading decoding to the
  // shared helper (tested separately in wood-form-pages.test.mjs).
  assert.match(route,/isOfficialWoodConvictionFormPair\(pageText\)/);
  const formHelper=fs.readFileSync(new URL("../src/wood-form-pages.js",import.meta.url),"utf8");
  assert.match(formHelper,/ADDRESSVERIFICATION/);
  assert.match(formHelper,/APPLICATIONTOSEALRECORD/);
  assert.match(route,/signed_pdf_sha256:sha/);
});
test("customer's reviewed signed PDF is saved only after guide pages removed",()=>{
  assert.match(html,/trimWoodConvictionGuidance\(pdfDoc, selected, templateMapping\);\s*const finalBytes = await pdfDoc.save\(\)/);
  assert.match(html,/trimWoodConvictionGuidance\(pdfDoc, selected, mapping\);\s*const bytes = await pdfDoc.save\(\)/);
});
