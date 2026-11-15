// Acceptance test for the ACTUAL browser production PDF renderer using only
// synthetic fields and a machine-generated scribble. No real applicant,
// Stripe, court or Lob calls. The artifact is watermarked NOT FOR FILING.
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import vm from "node:vm";
import {deflateSync} from "node:zlib";
import {PDFDocument,StandardFonts,rgb,degrees} from "pdf-lib";
import {getDocument,OPS} from "pdfjs-dist/legacy/build/pdf.mjs";
import {isOfficialWoodConvictionFormPair} from "../src/wood-form-pages.js";
import {renderWatermarkedPreviewPage} from "../src/packet-preview.js";

const html=readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const mapping=JSON.parse(readFileSync(new URL("../templates/ohio/wood-county/sealing-conviction.json",import.meta.url),"utf8"));
const registry=JSON.parse(readFileSync(new URL("../templates/index.json",import.meta.url),"utf8"));
const selected=registry.find(t=>t.state==="OH"&&t.county==="Wood"&&t.formType==="sealing-conviction");
assert.ok(selected,"Reviewed Wood County template is required");
const original=readFileSync(new URL("../"+selected.pdfPath,import.meta.url));
function extract(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a, "Actual production code section could not be extracted: "+start);
  return html.slice(a,b);
}
const trim=extract("function trimWoodConvictionGuidance(pdfDoc, selected, mapping)","function fieldPath(field)");
const renderer=extract("async function renderSignedCourtPdfBytes(data,selected)","async function prepareSignedReviewPdf()");
function crc32(bytes){
  let c=0xffffffff;
  for(const n of bytes){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^0xffffffff)>>>0;
}
function pngChunk(name,contents){
  const kind=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(contents.length);
  crc.writeUInt32BE(crc32(Buffer.concat([kind,contents])));
  return Buffer.concat([length,kind,contents,crc]);
}
function syntheticInkPng(){
  const w=320,h=80,raw=Buffer.alloc(h*(1+4*w));
  for(let x=12;x<300;x++){
    const y=Math.max(5,Math.min(h-5,Math.round(36+15*Math.sin(x/16)+5*Math.sin(x/5))));
    for(let dy=-2;dy<=2;dy++){
      const off=(y+dy)*(1+w*4)+1+4*x;
      raw[off]=7;raw[off+1]=11;raw[off+2]=25;raw[off+3]=255;
    }
  }
  const header=Buffer.alloc(13);
  header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);
  header[8]=8;header[9]=6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR",header),
    pngChunk("IDAT",deflateSync(raw)),
    pngChunk("IEND",Buffer.alloc(0))
  ]);
}
const nested={
  petitioner:{full_name:"SYNTHETIC APPLICANT",address:{
    line1:"123 Example Street",line2:"Apt TEST",city:"Bowling Green",state:"OH",zip:"43402"},
    email:"sample@example.invalid",phone:"000-000-0000"},
  court:{case_number:"SAMPLE-2026",judge_name:"TEST JUDGE"},
  charges:[{charge_name:"SAMPLE CHARGE",charge_code:"0000.00",
    level:"F5",disposition_date:"2020-01-15",discharge_date:"2023-01-15"}],
  generated:{current_date:"2026-11-14"}
};
function makeRenderer({ink=true,templateMapping=mapping}={}){
  const context=vm.createContext({
    window:{PDFLib:{PDFDocument,StandardFonts,rgb}},
    loadTemplateMapping:async()=>templateMapping,
    normalizeFields:m=>m.mappings||m.fields||[],
    loadTemplatePdf:async()=>original,
    hasUsableDrawnSignature:()=>ink,
    signatureImageBytes:ink?syntheticInkPng():null,
    SIGNATURE_REQUIRED_MESSAGE:"Signature required",
    getByPath:(data,path,fallback="")=>path.split(".").reduce((v,k)=>v?.[k],data)??fallback,
    fieldPath:field=>field.name==="charge.judge_name"?"charges.0.judge_name":(field.dataPath||field.name||""),
    formatDateForCourt:value=>String(value||""),
    console
  });
  return vm.runInContext(trim+"\n"+renderer+"\nrenderSignedCourtPdfBytes",context);
}
const render=makeRenderer();
await assert.rejects(makeRenderer({ink:false})(nested,selected),/Signature required/);
const changed={...selected,pdfPath:"unexpected-unreviewed.pdf"};
await assert.rejects(render(nested,changed),/two-form-page template needs remapping review/);
const signed=await render(nested,selected);
const unsignedOriginal=await getDocument({data:new Uint8Array(original),useSystemFonts:true}).promise;
const rendered=await getDocument({data:new Uint8Array(signed),useSystemFonts:true}).promise;
let texts=[];
try {
  assert.equal(unsignedOriginal.numPages,4);
  assert.equal(rendered.numPages,2,"Guidance pages must be excluded");
  for(let pageNo=1;pageNo<=2;pageNo++){
    const page=await rendered.getPage(pageNo);
    const content=await page.getTextContent();
    texts.push(content.items.map(x=>String(x.str||"")).join(" "));
  }
  assert.ok(isOfficialWoodConvictionFormPair(texts),
    "Signed output must contain exact official address and sealing-application pages");
  assert.ok(!texts.join(" ").toUpperCase().includes("CAN I SEAL OR EXPUNGE MY CRIMINAL RECORD"),
    "Eligibility guide may not be included");
  // The previous proof checked only the official blank pages and drawn
  // signature. It therefore passed even if ALL applicant fields were blank.
  const overlayExpectations=[
    ["applicant", "SYNTHETIC APPLICANT"],
    ["mailing address", "123 Example Street"],
    ["court case number", "SAMPLE-2026"],
    ["charge name", "SAMPLE CHARGE"],
    ["offense code", "0000.00"]
  ];
  const normalized=raw=>String(raw).toUpperCase().replace(/[^A-Z0-9]/g,"");
  for(const [label,value] of overlayExpectations){
    assert.ok(normalized(texts.join(" ")).includes(normalized(value)),
      "Actual signed PDF must visibly contain mapped "+label+"; an untouched blank official PDF is not acceptable");
  }
  const sourceApp=await unsignedOriginal.getPage(4);
  const finalApp=await rendered.getPage(2);
  const countImageOps=async page=>(await page.getOperatorList()).fnArray.filter(
    id=>id===OPS.paintImageXObject||id===OPS.paintInlineImageXObject||
      id===OPS.paintImageXObjectRepeat||id===OPS.paintInlineImageXObjectGroup
  ).length;
  const baseline=await countImageOps(sourceApp);
  const signedOps=await countImageOps(finalApp);
  assert.ok(signedOps>=baseline+1,
    "The drawn PNG must remain embedded in the final application page");
  const addressOps=await countImageOps(await rendered.getPage(1));
  assert.ok(addressOps>=0);
  console.log("PASS: actual browser renderer -> official 2-page PDF; signature PNG survived guide trimming");
} finally {
  await rendered.destroy();await unsignedOriginal.destroy();
}
const doc=await PDFDocument.load(signed);
const bold=await doc.embedFont(StandardFonts.HelveticaBold);
for(const page of doc.getPages()){
  page.drawText("SYNTHETIC SIGNATURE • TEST ONLY — NOT FOR FILING",{
    x:20,y:50,size:15,font:bold,color:rgb(.74,.11,.13),opacity:.5,rotate:degrees(12)
  });
}
const sample=await doc.save();
const samplePdf=await getDocument({data:new Uint8Array(sample),useSystemFonts:true}).promise;
try {
  assert.equal(samplePdf.numPages,2);
  const ts=[];
  for(let i=1;i<=2;i++){
    const pg=await samplePdf.getPage(i);
    ts.push((await pg.getTextContent()).items.map(x=>x.str||"").join(" "));
  }
  assert.equal(isOfficialWoodConvictionFormPair(ts),false,
    "Watermarked synthetic signature must never pass production form validation");
}finally{await samplePdf.destroy();}
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/wood-county-synthetic-drawn-signature-NOT-FOR-FILING.pdf",sample);
const proofPng=await renderWatermarkedPreviewPage(Buffer.from(signed),2,2);
writeFileSync("artifacts/wood-county-real-preview-p2-TEST-ONLY.png",proofPng);
console.log("PASS: actual production preview renderer returned a watermarked PNG with",proofPng.length,"bytes");
console.log("PASS: sample watermarked, production upload would reject it; no charge, filing or mail.");
