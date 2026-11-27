import {registerProfessionalBillingRoutes} from "./professional-billing-sandbox.js";
import {createHash} from "node:crypto";
import {isOfficialWoodConvictionFormPair,isOfficialWoodDismissalFormPair,normalizeWoodFormHeading} from "./wood-form-pages.js";
const HOST="ckrqmlnckhagskpumjbh.supabase.co";
const PRODUCTION_HOST="pfyxjhdlqgpzzzdssqpk.supabase.co";
const META="id,org_id,case_id,attorney_id,sha256,page_count,attorney_signature_attested,created_at,signature_mode,counsel_name,counsel_bar_number";
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
async function parsePdf(bytes){
 const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
 const doc=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}).promise;
 try{if(doc.numPages!==2)throw Error("Two pages required");const out=[];for(let i=1;i<=2;i++){const page=await doc.getPage(i);const t=await page.getTextContent();out.push(t.items.map(x=>String(x.str||"")).join(" "));}return out;}finally{await doc.destroy();}
}
export function registerProfessionalReviewRoutes(app,{express,publicSupabaseConfig,supabaseRestConfig,requireApiUser,getBearerToken,parse=parsePdf}){
 async function context(req,res){
  res.setHeader("Cache-Control","no-store, private");
  const config=supabaseRestConfig(),pub=publicSupabaseConfig();
  const mode=professionalStagingReady(config,pub)?"staging":professionalProductionReady(config,pub)?"production":null;
  if(!mode){res.status(503).json({ok:false,error:"Professional review configuration unavailable."});return null;}
  const user=await requireApiUser(req,res);if(!user)return null;
  const token=getBearerToken(req);if(!uuid(user.id)||!token){res.status(401).end();return null;}
  async function rest(table,query,{service=false,body}={}){
   const key=service?config.key:pub.anonKey;
   const r=await fetch(config.url.replace(/\/+$/,"")+"/rest/v1/"+table+"?"+query,{method:body?"POST":"GET",headers:{apikey:key,Authorization:"Bearer "+(service?config.key:token),"Content-Type":"application/json",Prefer:"return=representation"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
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
 registerProfessionalBillingRoutes(app,{context:async(req,res)=>{
  const ctx=await context(req,res);if(!ctx)return null;
  if(ctx.mode!=="staging"){res.status(503).json({ok:false,error:"Sandbox subscription routes are staging-only."});return null;}
  return ctx;
 }});
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
}
