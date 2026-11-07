import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
await import("../js/pdf-auto-map.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const mapper=globalThis.RecordPathPdfAutoMap;
const pdf="assets/forms/ga/statewide/arrest-agency/restrict-arrest-record-prior-2013.pdf";
const manifestPath="admin/form-candidates/ga:statewide:arrest-agency:record-restriction:5fe841de2630.json";
test("Official GBI prior-2013 PDF is hash-bound, review-only and no agency section is auto-fillable",async()=>{
 const buf=fs.readFileSync(path.join(root,pdf));
 assert.equal(buf.subarray(0,5).toString(),"%PDF-");
 const manifest=JSON.parse(fs.readFileSync(path.join(root,manifestPath),"utf8"));
 assert.equal(manifest.pdf.localPath,pdf);
 assert.equal(manifest.pdf.pageCount,4);
 assert.equal(manifest.form.type,"record-restriction");
 assert.equal(manifest.active,false);
 assert.equal(manifest.review.mappingApproved,false);
 assert.equal(manifest.review.legalRoutingApproved,false);
 assert.ok(manifest.mapping.suggestions.every(x=>x.page===2&&x.source==="ga-pre2013-layout"));
 assert.ok(!manifest.mapping.suggestions.some(x=>/ssn|social_security|race|sex/i.test(x.name)));
 const doc=await getDocument({data:new Uint8Array(buf),useSystemFonts:true}).promise;
 try{
  assert.equal(doc.numPages,4);
  const pages=[];
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n);
   const vp=page.getViewport({scale:mapper.BASE_SCALE});
   const text=await page.getTextContent();
   const items=(text.items||[]).filter(x=>x.str&&x.transform).map(x=>{
     const xy=vp.convertToViewportPoint(x.transform[4],x.transform[5]);
     const h=Math.max(7,Math.abs(x.height||x.transform[3]||10)*mapper.BASE_SCALE);
     return {str:x.str,x:xy[0],y:xy[1]-h,width:Math.max(0,(x.width||0)*mapper.BASE_SCALE),height:h};
   });
   pages.push({number:n,width:vp.width,height:vp.height,items,annotations:[]});
  }
  const result=mapper.analyzePages(pages);
  assert.equal(result.profile,"ga-prior-2013-record-restriction");
  assert.equal(result.suggestions.length,12);
  assert.ok(result.suggestions.every(s=>s.page===2));
  for(const name of ["petitioner.full_name","petitioner.dob","petitioner.phone","petitioner.address.line1",
    "charges.0.arresting_agency","charges.0.arrest_date","charges.0.charge_name"]){
    assert.ok(result.suggestions.some(x=>x.name===name),"Missing "+name);
  }
  assert.ok(result.diagnostics.join(" ").includes("Sections Two/Three"));
 }finally{await doc.destroy();}
});
