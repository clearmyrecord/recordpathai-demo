// Generate a synthetic preview using the ORIGINAL clerk-issued four-page PDF.
// Pages 1–2 are removed only after overlay; output is NEVER a filing document.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {PDFDocument,StandardFonts,rgb,degrees} from "pdf-lib";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {isOfficialWoodConvictionFormPair} from "../src/wood-form-pages.js";

const original=readFileSync(new URL("../assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-32-conviction.pdf",import.meta.url));
const map=JSON.parse(readFileSync(new URL("../templates/ohio/wood-county/sealing-conviction.json",import.meta.url),"utf8"));
const doc=await PDFDocument.load(original);
if(doc.getPageCount()!==4||map.pageCount!==4)throw Error("Official four-page form required");
const font=await doc.embedFont(StandardFonts.Helvetica);
const bold=await doc.embedFont(StandardFonts.HelveticaBold);
const pages=doc.getPages();
const sample={
 "petitioner.full_name":"SAMPLE APPLICANT","petitioner.address.line1":"123 Example Street",
 "petitioner.address.line2":"Apt 2","petitioner.address.city":"Bowling Green",
 "petitioner.address.state":"OH","petitioner.address.zip":"43402",
 "petitioner.email":"sample@example.invalid","petitioner.phone":"000-000-0000",
 "court.case_number":"SAMPLE-2026","court.judge_name":"SAMPLE JUDGE",
 "charges.0.charge_name":"SAMPLE OFFENSE","charges.0.charge_code":"0000.00",
 "charges.0.level":"F5","charges.0.disposition_date":"01/15/2020",
 "charges.0.discharge_date":"01/15/2023","generated.current_date":"11/14/2026"
};
const required=["petitioner.full_name","court.case_number","charges.0.charge_name",
 "charges.0.disposition_date","charges.0.discharge_date"];
const mapped=new Set();
for(const field of map.mappings){
  if(![3,4].includes(Number(field.page)))throw Error("Mapping targets non-filing pages");
  const page=pages[Number(field.page)-1],width=page.getWidth(),height=page.getHeight();
  const scaleX=width/Number(map.pageWidth||768),scaleY=height/Number(map.pageHeight||994);
  const x=Number(field.x)*scaleX;
  const cellHeight=Number(field.height||18)*scaleY;
  const y=height-Number(field.y)*scaleY-cellHeight+3;
  const path=field.name;
  if(field.type==="signature"){
    page.drawText("UNSIGNED — SAMPLE ONLY",{x,y,size:7,font:bold,color:rgb(.7,.15,.15)});
    continue;
  }
  if(!Object.hasOwn(sample,path))continue;
  const value=sample[path],limit=Number(field.width||180)*scaleX;
  let size=Math.min(Number(field.fontSize||10),10);
  while(font.widthOfTextAtSize(value,size)>limit&&size>6)size-=.5;
  if(font.widthOfTextAtSize(value,size)>limit)throw Error("Field overflow: "+path);
  page.drawText(value,{x,y,size,font,color:rgb(.16,.25,.39)});
  mapped.add(path);
}
for(const key of required)if(!mapped.has(key))throw Error("Missing required mapping: "+key);
doc.removePage(1);doc.removePage(0);
for(const page of doc.getPages()){
  page.drawText("SAMPLE ONLY — NOT FOR FILING",{x:30,y:45,size:17,font:bold,
    color:rgb(.75,.1,.1),opacity:.35,rotate:degrees(16)});
}
const output=await doc.save();
const check=await getDocument({data:new Uint8Array(output),useSystemFonts:true}).promise;
try{
 if(check.numPages!==2)throw Error("Output must have exactly two pages");
 const texts=[];
 for(let i=1;i<=2;i++){
   const page=await check.getPage(i),text=await page.getTextContent();
   texts.push(text.items.map(item=>String(item.str||"")).join(" "));
 }
 // The preview will intentionally fail the strict upload guard because it is marked SAMPLE ONLY;
 // validate the original court headings independently.
 const clean=texts.map(t=>t.replaceAll("SAMPLE ONLY — NOT FOR FILING",""));
 if(!clean[0].includes("ADDRESS")&&!clean[0].includes("SEALING"))throw Error("Address form absent");
 if(!clean[1].includes("APPLICATION")&&!clean[1].includes("CONVICTION"))throw Error("Sealing form absent");
 if(isOfficialWoodConvictionFormPair(texts))throw Error("Preview must be blocked from production upload");
}finally{await check.destroy();}
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/wood-county-official-form-SAMPLE-NOT-FOR-FILING.pdf",output);
console.log("Generated original-form two-page synthetic preview; NOT FOR FILING");
