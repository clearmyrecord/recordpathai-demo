import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
await import("../js/pdf-auto-map.js");
const auto=globalThis.RecordPathPdfAutoMap;
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const html=readFileSync(join(root,"pdf-mapper-v6.html"),"utf8");
test("V6 HTML script syntax is valid and retains manual tools",()=>{
  assert.match(html,/id="pdfUpload"/);
  assert.match(html,/id="applyCheckedBtn"/);
  assert.match(html,/id="applyHighBtn"/);
  assert.match(html,/id="downloadJsonBtn"/);
  assert.match(html,/id="importJsonBtn"/);
  assert.match(html,/WOOD_PDF_ASSET/);
  assert.match(html,/function scanPdfForSuggestions/);
  assert.match(html,/zoomRatio\(\)/);
  assert.match(html,/pageWidth: Math.round\(baseViewport.width\)/);
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for(const s of scripts) {
    if(!s[1].trim())continue;
    assert.doesNotThrow(()=>new vm.Script(s[1]));
  }
});
test("helper classifies expected labels and does not invent unsupported names",()=>{
  assert.equal(auto.canonicalField("Case Number"),"court.case_number");
  assert.equal(auto.canonicalField("Judge Name"),"court.judge_name");
  assert.equal(auto.canonicalField("Phone Number"),"petitioner.phone");
  assert.equal(auto.canonicalField("Unknown Data"),"");
});
test("generic text labels suggest fields but do not claim strong confidence",()=>{
  const p={number:1,width:765,height:990,items:[
    {str:"Case No.:",x:90,y:120,width:110,height:15},
    {str:"Judge:",x:90,y:160,width:76,height:15},
    {str:"E-mail Address:",x:90,y:190,width:121,height:15}
  ]};
  const result=auto.analyzePages([p]);
  assert.equal(result.profile,"generic");
  const names=result.suggestions.map(s=>s.name);
  assert.ok(names.includes("court.case_number"));
  assert.ok(names.includes("court.judge_name"));
  assert.ok(names.includes("petitioner.email"));
  assert.ok(result.suggestions.every(s=>s.confidence<.85));
});
test("image-only scanned pages do not fabricate locations",()=>{
  const r=auto.analyzePages([{number:1,width:765,height:990,items:[],annotations:[]}]);
  assert.equal(r.suggestions.length,0);
  assert.match(r.diagnostics.join(" "),/No searchable text/);
});
test("actual Wood County official 2953.33 PDF yields court and four-row charge suggestions",async()=>{
  const file=join(root,"assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf");
  const pdf=await getDocument({data:new Uint8Array(readFileSync(file)),useSystemFonts:true}).promise;
  try {
    assert.equal(pdf.numPages,4);
    const pages=[];
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n);
      const vp=page.getViewport({scale:auto.BASE_SCALE});
      const text=await page.getTextContent();
      const items=(text.items||[]).filter(x=>x.str&&x.transform).map(x=>{
        const xy=vp.convertToViewportPoint(x.transform[4],x.transform[5]);
        const h=Math.max(7,Math.abs(x.height||x.transform[3]||10)*auto.BASE_SCALE);
        return {str:x.str,x:xy[0],y:xy[1]-h,width:Math.max(0,(x.width||0)*auto.BASE_SCALE),height:h};
      });
      pages.push({number:n,width:vp.width,height:vp.height,items,annotations:[]});
    }
    const result=auto.analyzePages(pages);
    assert.equal(result.profile,"wood-county-2953.33");
    assert.ok(result.suggestions.length>=26,"Expected at least 26 suggested fields, got "+result.suggestions.length);
    const has=(name,page)=>result.suggestions.some(s=>s.name===name&&s.page===page&&s.width>20&&s.height>=8);
    for(const name of ["generated.current_date","petitioner.full_name","petitioner.email"]){
      assert.ok(has(name,3),"Missing page-3 "+name);
    }
    for(const name of ["court.case_number","court.judge_name","charges.0.disposition_date","signatures.petitioner_signature_name"]){
      assert.ok(has(name,4),"Missing page-4 "+name);
    }
    for(let i=0;i<4;i++){
      for(const field of ["charge_name","charge_code","level"]){
        assert.ok(has(`charges.${i}.${field}`,4),"Missing charge row "+i+" "+field);
      }
    }
    assert.ok(result.suggestions.every(s=>s.page>=1&&s.page<=4&&s.x>=0&&s.y>=0));
    assert.equal(result.suggestions.find(s=>s.type==="signature")?.confidence < .85,true);
  } finally {await pdf.destroy();}
});
