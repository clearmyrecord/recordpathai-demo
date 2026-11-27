// Professional official forms and marked drafts; signatures require actual applicant input, never automatic signing.
const BASE="assets/forms/ohio/wood/court-of-common-pleas/";
const templates=Object.freeze({
 conviction:{pdf:BASE+"application-for-sealing-2953-32-conviction-print.pdf",map:"templates/ohio/wood-county/sealing-conviction.json"},
 dismissal:{pdf:BASE+"application-for-sealing-2953-33-dismissal-print.pdf",map:"templates/ohio/wood-county/sealing-dismissal.json"},
 not_guilty:{pdf:BASE+"application-for-sealing-2953-33-dismissal-print.pdf",map:"templates/ohio/wood-county/sealing-dismissal.json"}
});
const date=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||""))throw Error("Invalid required date");return s.slice(5,7)+"/"+s.slice(8)+"/"+s.slice(0,4);};
export function prepareProfessionalDraftData(c,m,d,today){
 if(!c||!m||!d||m.client_id!==c.id||m.org_id!==c.org_id||m.attorney_id!==c.attorney_id||d.case_id!==m.id||d.org_id!==m.org_id||d.attorney_id!==m.attorney_id||d.entire_case_reviewed!==true||d.decision!=="approved_for_unsigned_draft"||m.court_id!=="oh-wood-common-pleas"||!Object.hasOwn(templates,m.outcome)||c.authorization_confirmed!==true)throw Error("No approved attorney draft.");
 const required=[c.full_name,c.line1,c.city,c.state,c.zip,c.email,c.phone,m.case_number,m.charge_name,m.charge_code,m.charge_level];
 if(required.some(v=>typeof v!=="string"||!v.trim()))throw Error("Incomplete saved information.");
 const data={petitioner:{full_name:c.full_name,phone:c.phone,email:c.email,address:{line1:c.line1,line2:c.line2||"",city:c.city,state:c.state,zip:c.zip}},
 court:{case_number:m.case_number,judge_name:m.judge_name||""},
 charges:[{charge_name:m.charge_name,charge_code:m.charge_code,level:m.charge_level,disposition_date:date(m.disposition_date),discharge_date:m.outcome==="conviction"?date(m.final_discharge_date):""}],
 generated:{current_date:date(today)}};
 return {template:templates[m.outcome],data,courtFeeCents:m.outcome==="conviction"?10000:0};
}
export async function renderProfessionalDraft({client,caseRow,decision,today,PDFLib,fetcher=fetch,counsel=null,typedSignature=null,signatureReady=false,applicantSignature=null}){
 const {template,data}=prepareProfessionalDraftData(client,caseRow,decision,today);
 if(applicantSignature&&(!signatureReady||counsel||!(applicantSignature instanceof Uint8Array)||applicantSignature.length<100||applicantSignature.length>500000))throw Error("Actual applicant signature image required.");
 if(signatureReady&&counsel)throw Error('Official unsigned export cannot carry an assumed counsel signature');
 if(counsel&&(!counsel.full_name||counsel.org_id!==caseRow.org_id||counsel.attorney_id!==caseRow.attorney_id||!counsel.verified_at||!/^\d{7}$/.test(counsel.ohio_bar_number)||typedSignature!==counsel.full_name))throw Error("Verified attorney identity and explicit signature required.");
 const [p,r]=await Promise.all([fetcher(template.pdf,{cache:"no-store",credentials:"same-origin"}),fetcher(template.map,{cache:"no-store",credentials:"same-origin"})]);
 if(!p.ok||!r.ok)throw Error("Official template unavailable.");
 const mapping=await r.json(), fields=mapping.mappings;
 if(mapping.pageCount!==4||!Number.isFinite(mapping.pageWidth)||!Number.isFinite(mapping.pageHeight)||mapping.pageWidth<=0||mapping.pageHeight<=0||!Array.isArray(fields)||!fields.length||fields.some(f=>![3,4].includes(Number(f.page)))||fields.filter(f=>f.type==="signature"&&Number(f.page)===4).length!==1||fields.filter(f=>f.type==="signature").length!==1)throw Error("Template mapping needs review.");
 const {PDFDocument,StandardFonts,rgb}=PDFLib;
 const pdf=await PDFDocument.load(await p.arrayBuffer());
 if(pdf.getPageCount()!==4)throw Error("Unexpected official form revision.");
 const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),pages=pdf.getPages();
 const allowed=/^(petitioner\.(full_name|email|phone|address\.(line1|line2|city|state|zip))|court\.(case_number|judge_name)|charges\.[0-3]\.(charge_name|charge_code|level|disposition_date|discharge_date)|generated\.current_date)$/;
 for(const f of fields){
  if(f.type==="signature"){
   if(applicantSignature){
    const page=pages[3],sx=page.getWidth()/mapping.pageWidth,sy=page.getHeight()/mapping.pageHeight;
    if(![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0||f.x+f.width>mapping.pageWidth+1||f.y+f.height>mapping.pageHeight+1)throw Error("Invalid signature coordinates.");
    const image=await pdf.embedPng(applicantSignature),w=f.width*sx,h=f.height*sy;
    const scale=Math.min(w/image.width,h/image.height);
    page.drawImage(image,{x:f.x*sx,y:page.getHeight()-(f.y+f.height)*sy+(h-image.height*scale)/2,width:image.width*scale,height:image.height*scale});
   }else if(counsel){
    const page=pages[3],sx=page.getWidth()/mapping.pageWidth,sy=page.getHeight()/mapping.pageHeight;
    const x=f.x*sx,y=page.getHeight()-(f.y+f.height)*sy,w=f.width*sx;
    const text="/s/ "+counsel.full_name+" (counsel)";
    let size=9;while(size>6&&font.widthOfTextAtSize(text,size)>w)size-=.25;
    if(font.widthOfTextAtSize(text,size)>w)throw Error("Counsel name exceeds signature space.");
    page.drawText(text,{x,y:y+3,size,font,color:rgb(0,0,0)});
   }
   continue;
  }
  const path=f.dataPath||f.name;
  if(!allowed.test(path)||!["text","date"].includes(f.type))throw Error("Unapproved template field.");
  const page=pages[Number(f.page)-1],sx=page.getWidth()/mapping.pageWidth,sy=page.getHeight()/mapping.pageHeight;
  if(![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0||f.x+f.width>mapping.pageWidth+1||f.y+f.height>mapping.pageHeight+1)throw Error("Invalid form coordinates.");
  let value=signatureReady&&!applicantSignature&&path==="generated.current_date"?"":path.split(".").reduce((a,k)=>a?.[k],data)||"";
  if(Number(f.page)===4&&path==="petitioner.address.line1")value=[value,data.petitioner.address.line2].filter(Boolean).join(", ");
  if(!value)continue;
  const w=f.width*sx,h=f.height*sy;let size=Math.min(10,h-2);
  while(size>6&&font.widthOfTextAtSize(value,size)>w)size-=0.25;
  if(font.widthOfTextAtSize(value,size)>w||size<6)throw Error("A field is too long for the official form. Review the saved record.");
  page.drawText(value,{x:f.x*sx,y:page.getHeight()-(f.y+f.height)*sy+Math.max(1,(h-size)/2),size,font,color:rgb(0,0,0)});
 }
 pdf.removePage(1);pdf.removePage(0);
 if(!signatureReady)for(const page of pdf.getPages())page.drawText(counsel?"COUNSEL SIGNATURE ASSUMPTION - DO NOT FILE":"UNSIGNED REVIEW DRAFT - DO NOT FILE",{x:30,y:14,size:9,font:bold,color:rgb(.65,.1,.1)});
 if(counsel)pdf.getPages()[1].drawText("Counsel Ohio registration: "+counsel.ohio_bar_number,{x:30,y:27,size:8,font,color:rgb(0,0,0)});
 return pdf.save();
}
