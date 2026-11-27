import {registerProfessionalMailing} from "./professional-mailing.js";
import {registerProfessionalLiveBilling} from "./professional-live-billing.js";
import {registerProfessionalBillingRoutes} from "./professional-billing-sandbox.js";
import {createHash} from "node:crypto";
import {isOfficialWoodConvictionFormPair,isOfficialWoodDismissalFormPair,normalizeWoodFormHeading} from "./wood-form-pages.js";
const HOST="ckrqmlnckhagskpumjbh.supabase.co";
const PRODUCTION_HOST="pfyxjhdlqgpzzzdssqpk.supabase.co";
const META="id,org_id,case_id,attorney_id,sha256,page_count,attorney_signature_attested,created_at,signature_mode,counsel_name,counsel_bar_number";
const GENERATED_META="id,org_id,case_id,attorney_id,kind,sha256,page_count,created_at";
export const PROFESSIONAL_PDF_MAX=2097152;
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const digest=b=>createHash("sha256").update(b).digest("hex");
export function professionalStagingReady(config,publicConfig){
 try{return new URL(config.url).origin==="https://"+HOST&&new URL(publicConfig.url).origin==="https://"+HOST&&Boolean(config.key&&publicConfig.anonKey);}catch{return false;}
}
export function professionalProductionReady(config,publicConfig){
 try{return new URL(config.url).origin==="https://"+PRODUCTION_HOST&&new URL(publicConfig.url).origin==="https://"+PRODUCTION_HOST&&Boolean(config.key&&publicConfig.anonKey);}catch{return false;}
}
export async function validateProfessionalSignedPdf(bytes,outcome,parse,counsel=null){
 if(!Buffer.isBuffer(bytes)||bytes.length<500||bytes.length>PROFESSIONAL_PDF_MAX||bytes.subarray(0,5).toString()!=="%PDF-"||!bytes.subarray(-2048).includes(Buffer.from("%%EOF")))throw Error("Invalid PDF");
 if(!["conviction","dismissal","not_guilty"].includes(outcome))throw Error("Outcome requires review");
 const texts=await parse(bytes);
 if(texts.some(t=>normalizeWoodFormHeading(t).includes("UNSIGNEDREVIEWDRAFT")))throw Error("Unsigned draft");
 const combined=texts.join(" ");
 const counselMarked=texts.some(t=>normalizeWoodFormHeading(t).includes("COUNSELSIGNATUREASSUMPTIONDONOTFILE"));
 if(Boolean(counsel)!==counselMarked)throw Error("Signature mode mismatch");
 if(counsel&&(!texts.every(t=>normalizeWoodFormHeading(t).includes("COUNSELSIGNATUREASSUMPTIONDONOTFILE"))||!normalizeWoodFormHeading(combined).includes(normalizeWoodFormHeading("/s/ "+counsel.full_name+" (counsel)"))||!combined.replace(/\s/g,"").includes(counsel.ohio_bar_number)))throw Error("Counsel identity missing");
 if(!(outcome==="conviction"?isOfficialWoodConvictionFormPair(texts):isOfficialWoodDismissalFormPair(texts)))throw Error("Wrong official form pair");
 return digest(bytes);
}
export async function validateGeneratedProfessionalPacket(bytes,outcome,kind,parse){
 if(!["review_draft","unsigned_application"].includes(kind)||!Buffer.isBuffer(bytes)||bytes.length<500||bytes.length>PROFESSIONAL_PDF_MAX||bytes.subarray(0,5).toString()!=="%PDF-"||!bytes.subarray(-2048).includes(Buffer.from("%%EOF")))throw Error("Invalid packet");
 if(!["conviction","dismissal","not_guilty"].includes(outcome))throw Error("Outcome requires review");
 const texts=await parse(bytes);
 if(texts.length!==2||texts.some(t=>normalizeWoodFormHeading(t).includes("COUNSELSIGNATUREASSUMPTIONDONOTFILE")))throw Error("Unexpected packet");
 const marked=texts.map(t=>normalizeWoodFormHeading(t).includes("UNSIGNEDREVIEWDRAFT"));
 if(kind==="review_draft"?!marked.every(Boolean):marked.some(Boolean))throw Error("Packet kind mismatch");
 if(!(outcome==="conviction"?isOfficialWoodConvictionFormPair(texts):isOfficialWoodDismissalFormPair(texts)))throw Error("Wrong official form pair");
 return digest(bytes);
}
async function parsePdf(bytes){
 const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
 const doc=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}).promise;
 try{if(doc.numPages!==2)throw Error("Two pages required");const out=[];for(let i=1;i<=2;i++){const page=await doc.getPage(i);const t=await page.getTextContent();out.push(t.items.map(x=>String(x.str||"")).join(" "));}return out;}finally{await doc.destroy();}
}
export function registerProfessionalReviewRoutes(app,{express,publicSupabaseConfig,supabaseRestConfig,requireApiUser,getBearerToken,parse=parsePdf,mailing=null}){
 async function context(req,res){
  res.setHeader("Cache-Control","no-store, private");
  const config=supabaseRestConfig(),pub=publicSupabaseConfig();
  const mode=professionalStagingReady(config,pub)?"staging":professionalProductionReady(config,pub)?"production":null;
  if(!mode){res.status(503).json({ok:false,error:"Professional review configuration unavailable."});return null;}
  const user=await requireApiUser(req,res);if(!user)return null;
  const token=getBearerToken(req);if(!uuid(user.id)||!token){res.status(401).end();return null;}
  async function rest(table,query,{service=false,body,method=body?"POST":"GET"}={}){
   const key=service?config.key:pub.anonKey;
   const r=await fetch(config.url.replace(/\/+$/,"")+"/rest/v1/"+table+"?"+query,{method,headers:{apikey:key,Authorization:"Bearer "+(service?config.key:token),"Content-Type":"application/json",Prefer:"return=representation"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error("Private review request rejected");
   return r.json();
  }
  async function ownedCase(caseId){
   if(!uuid(caseId))return null;
   const [c]=await rest("professional_cases","select=id,org_id,attorney_id,outcome,court_id&id=eq."+caseId+"&attorney_id=eq."+user.id+"&limit=1");
   if(!c||c.court_id!=="oh-wood-common-pleas")return null;
   const [d]=await rest("professional_case_decisions","select=id&case_id=eq."+caseId+"&attorney_id=eq."+user.id+"&decision=eq.approved_for_unsigned_draft&entire_case_reviewed=eq.true&limit=1");
   return d?c:null;
  }
  return {user,rest,ownedCase,mode};
 }
 registerProfessionalLiveBilling(app,{context});
 registerProfessionalBillingRoutes(app,{context:async(req,res)=>{
  const ctx=await context(req,res);if(!ctx)return null;
  if(ctx.mode!=="staging"){res.status(503).json({ok:false,error:"Sandbox subscription routes are staging-only."});return null;}
  return ctx;
 }});
 // A held decision may be reconsidered only by its assigned authenticated user.
 // The existing RLS read checks enforce AAL2 and current organization access.
 app.post("/api/professional/case/:id/resume-review",express.json({limit:"4kb"}),async(req,res)=>{
  try{
   const ctx=await context(req,res);if(!ctx)return;
   if(ctx.mode!=="production"||!uuid(req.params.id)||req.body?.entire_case_reviewed!==true)return res.status(400).json({ok:false,error:"Confirm the complete case review."});
   const [c]=await ctx.rest("professional_cases","select=id,org_id,attorney_id,outcome,court_id&id=eq."+req.params.id+"&attorney_id=eq."+ctx.user.id+"&limit=1");
   if(!c||c.court_id!=="oh-wood-common-pleas"||!["conviction","dismissal","not_guilty"].includes(c.outcome))return res.status(403).json({ok:false,error:"Supported assigned case required."});
   const [d]=await ctx.rest("professional_case_decisions","select=id,decision,org_id,attorney_id&case_id=eq."+c.id+"&attorney_id=eq."+ctx.user.id+"&org_id=eq."+c.org_id+"&limit=1");
   if(!d||d.decision!=="hold")return res.status(409).json({ok:false,error:"Case is not on hold."});
   const rows=await ctx.rest("professional_case_decisions","id=eq."+d.id+"&case_id=eq."+c.id+"&org_id=eq."+c.org_id+"&attorney_id=eq."+ctx.user.id+"&decision=eq.hold",{service:true,method:"PATCH",body:{decision:"approved_for_unsigned_draft",entire_case_reviewed:true}});
   if(rows.length!==1)return res.status(409).json({ok:false,error:"Review state changed; reload."});
   return res.json({ok:true,decision:"approved_for_unsigned_draft"});
  }catch{return res.status(503).json({ok:false,error:"Unable to save the renewed review."});}
 });
 // Generated packets are private case archives, not signed or independently reviewed documents.
 app.post("/api/professional/recordwatch/generated-packet",express.raw({type:"application/pdf",limit:"2mb"}),async(req,res)=>{
  try{
   const ctx=await context(req,res);if(!ctx)return;
   if(ctx.mode!=="production")return res.status(503).end();
   const c=await ctx.ownedCase(req.get("x-professional-case-id"));
   if(!c)return res.status(403).json({ok:false,error:"Approved assigned case required."});
   const kind=req.get("x-professional-packet-kind");
   let sha;try{sha=await validateGeneratedProfessionalPacket(req.body,c.outcome,kind,parse);}catch{return res.status(400).json({ok:false,error:"Generated document must use the correct official two-page forms."});}
   if(!await ctx.ownedCase(c.id))return res.status(403).end();
   const existing=await ctx.rest("professional_generated_packets","select="+GENERATED_META+"&case_id=eq."+c.id+"&kind=eq."+kind+"&sha256=eq."+sha+"&limit=1");
   if(existing.length)return res.json({ok:true,document:existing[0]});
   const rows=await ctx.rest("professional_generated_packets","select="+GENERATED_META,{service:true,body:{org_id:c.org_id,case_id:c.id,attorney_id:ctx.user.id,kind,sha256:sha,pdf_bytes:"\\x"+req.body.toString("hex"),page_count:2}});
   return res.json({ok:true,document:rows[0],note:"Saved privately. Not proof of a signature, payment, or filing."});
  }catch{return res.status(503).json({ok:false,error:"Generated packet could not be saved in RecordWatch."});}
 });
 app.get("/api/professional/recordwatch/generated-packet/:id/preview/:page",async(req,res)=>{
  try{
   const ctx=await context(req,res);if(!ctx)return;
   const id=req.params.id,page=Number(req.params.page);
   if(ctx.mode!=="production"||!uuid(id)||![1,2].includes(page))return res.status(404).end();
   const [d]=await ctx.rest("professional_generated_packets","select="+GENERATED_META+"&id=eq."+id+"&attorney_id=eq."+ctx.user.id+"&kind=eq.review_draft&limit=1");
   if(!d||!await ctx.ownedCase(d.case_id))return res.status(404).end();
   const [row]=await ctx.rest("professional_generated_packets","select=pdf_bytes,sha256&id=eq."+id+"&case_id=eq."+d.case_id+"&attorney_id=eq."+ctx.user.id+"&limit=1",{service:true});
   if(!row||typeof row.pdf_bytes!=="string"||!/^\\x[0-9a-f]+$/i.test(row.pdf_bytes))return res.status(503).end();
   const bytes=Buffer.from(row.pdf_bytes.slice(2),"hex");
   if(bytes.length>PROFESSIONAL_PDF_MAX||digest(bytes)!==d.sha256||row.sha256!==d.sha256)return res.status(403).end();
   const {renderWatermarkedPreviewPage}=await import("./packet-preview.js");
   const png=await renderWatermarkedPreviewPage(bytes,page,d.page_count,{professional:true});
   if(!await ctx.ownedCase(d.case_id))return res.status(403).end();
   res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");return res.type("image/png").send(png);
  }catch{return res.status(503).end();}
 });
 app.get("/api/professional/recordwatch/generated-packet/:id",async(req,res)=>{
  try{
   const ctx=await context(req,res);if(!ctx)return;
   if(ctx.mode!=="production"||!uuid(req.params.id))return res.status(404).end();
   const [d]=await ctx.rest("professional_generated_packets","select="+GENERATED_META+"&id=eq."+req.params.id+"&attorney_id=eq."+ctx.user.id+"&limit=1");
   if(!d||!await ctx.ownedCase(d.case_id))return res.status(404).end();
   const [row]=await ctx.rest("professional_generated_packets","select=pdf_bytes,sha256&id=eq."+d.id+"&case_id=eq."+d.case_id+"&attorney_id=eq."+ctx.user.id+"&limit=1",{service:true});
   if(!row||typeof row.pdf_bytes!=="string"||!/^\\x[0-9a-f]+$/i.test(row.pdf_bytes))return res.status(503).end();
   const bytes=Buffer.from(row.pdf_bytes.slice(2),"hex");
   if(bytes.length>PROFESSIONAL_PDF_MAX||digest(bytes)!==d.sha256||row.sha256!==d.sha256||!await ctx.ownedCase(d.case_id))return res.status(403).end();
   res.setHeader("X-Content-Type-Options","nosniff");
   res.setHeader("Content-Disposition",'attachment; filename="recordwatch-unsigned-packet.pdf"');
   return res.type("application/pdf").send(bytes);
  }catch{return res.status(503).end();}
 });
 app.post("/api/professional/signed-review",express.raw({type:"application/pdf",limit:"2mb"}),async(req,res)=>{
  try{
   const ctx=await context(req,res);if(!ctx)return;
   const c=await ctx.ownedCase(req.get("x-professional-case-id"));
   if(!c)return res.status(403).json({ok:false,error:"Approved assigned case required."});
   if(req.get("x-professional-signature-attested")!=="yes")return res.status(400).json({ok:false,error:"Attest that the identified signer signed the official document."});
   const mode=req.get("x-professional-signature-mode")||"applicant_external";
   if(!["applicant_external","counsel_assumption_staging"].includes(mode))return res.status(400).end();
   if(ctx.mode==="production"&&mode!=="applicant_external")return res.status(409).json({ok:false,error:"Court acceptance of attorney-only signing is not verified; no production counsel-assumption signature."});
   let counsel=null;
   if(mode==="counsel_assumption_staging"){
    [counsel]=await ctx.rest("professional_counsel_profiles","select=org_id,attorney_id,full_name,ohio_bar_number,verified_at&org_id=eq."+c.org_id+"&attorney_id=eq."+ctx.user.id+"&limit=1");
    if(!counsel||req.get("x-professional-counsel-consent")!=="yes")return res.status(403).json({ok:false,error:"Verified counsel and explicit signature consent required."});
   }
   let sha;try{sha=await validateProfessionalSignedPdf(req.body,c.outcome,parse,counsel);}catch{return res.status(400).json({ok:false,error:"Use the correct two-page signed official application; unsigned review drafts are not accepted."});}
   const fresh=await ctx.ownedCase(c.id);if(!fresh)return res.status(403).end();
   const existing=await ctx.rest("professional_signed_documents","select="+META+"&case_id=eq."+c.id+"&sha256=eq."+sha+"&limit=1");
   if(existing.length)return res.json({ok:true,document:existing[0]});
   const rows=await ctx.rest("professional_signed_documents","select="+META,{service:true,body:{org_id:c.org_id,case_id:c.id,attorney_id:ctx.user.id,sha256:sha,pdf_bytes:"\\x"+req.body.toString("hex"),page_count:2,attorney_signature_attested:true,signature_mode:mode,counsel_name:counsel?.full_name||null,counsel_bar_number:counsel?.ohio_bar_number||null}});
   return res.json({ok:true,document:rows[0],note:"Stored for private review; signature is attorney-attested, not independently authenticated."});
  }catch{return res.status(503).json({ok:false,error:"Private review upload unavailable. No filing or payment made."});}
 });
 app.get("/api/professional/signed-review/:id/preview/:page",async(req,res)=>{
  try{
   const ctx=await context(req,res);if(!ctx)return;
   const id=req.params.id,page=Number(req.params.page);if(!uuid(id)||![1,2].includes(page))return res.status(400).end();
   const [d]=await ctx.rest("professional_signed_documents","select="+META+"&id=eq."+id+"&attorney_id=eq."+ctx.user.id+"&limit=1");
   if(!d||!await ctx.ownedCase(d.case_id))return res.status(404).end();
   const [row]=await ctx.rest("professional_signed_documents","select=pdf_bytes,sha256&id=eq."+id+"&attorney_id=eq."+ctx.user.id+"&limit=1",{service:true});
   if(!row||typeof row.pdf_bytes!=="string"||!/^\\x[0-9a-f]+$/i.test(row.pdf_bytes))return res.status(503).end();
   const bytes=Buffer.from(row.pdf_bytes.slice(2),"hex");
   if(bytes.length>PROFESSIONAL_PDF_MAX||digest(bytes)!==d.sha256||row.sha256!==d.sha256||!await ctx.ownedCase(d.case_id))return res.status(403).end();
   const {renderWatermarkedPreviewPage}=await import("./packet-preview.js");
   const png=await renderWatermarkedPreviewPage(bytes,page,d.page_count,{professional:true});
   if(!await ctx.ownedCase(d.case_id))return res.status(403).end();
   res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");return res.type("image/png").send(png);
  }catch{return res.status(503).end();}
 });
 app.get("/api/professional/signed-review/:id",async(req,res)=>{
  try{
   const ctx=await context(req,res);if(!ctx)return;
   const id=req.params.id;if(!uuid(id))return res.status(400).end();
   const [d]=await ctx.rest("professional_signed_documents","select="+META+"&id=eq."+id+"&attorney_id=eq."+ctx.user.id+"&limit=1");
   if(!d||!await ctx.ownedCase(d.case_id))return res.status(404).end();
   const [row]=await ctx.rest("professional_signed_documents","select=pdf_bytes,sha256&id=eq."+id+"&attorney_id=eq."+ctx.user.id+"&limit=1",{service:true});
   if(!row||typeof row.pdf_bytes!=="string"||!/^\\x[0-9a-f]+$/i.test(row.pdf_bytes))return res.status(503).end();
   const bytes=Buffer.from(row.pdf_bytes.slice(2),"hex");
   if(bytes.length>PROFESSIONAL_PDF_MAX||digest(bytes)!==d.sha256||row.sha256!==d.sha256||!await ctx.ownedCase(d.case_id))return res.status(403).end();
   res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Content-Disposition",'attachment; filename="professional-signed-review.pdf"');return res.type("application/pdf").send(bytes);
  }catch{return res.status(503).end();}
 });
 return mailing?registerProfessionalMailing(app,{express,context,...mailing}):null;
}
