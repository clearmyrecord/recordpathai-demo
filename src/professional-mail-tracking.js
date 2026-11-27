import {verifiedProfessionalMailPayment} from "./professional-mailing.js";
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const statuses=new Set(["approved","paid_hold","dispatch_claimed","submitted_to_lob"]);
const events=new Set(["Mailed","In Transit","In Local Area","Processed for Delivery","Delivered","Re-Routed","Returned to Sender","International Exit"]);
const time=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))?v:null;
const date=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&time(v)?v:null;
const supported=c=>c.court_id==="oh-wood-common-pleas"&&["conviction","dismissal","not_guilty"].includes(c.outcome);
export function projectProfessionalTracking(c,o){
 if(!o)return {caseId:c.id,status:supported(c)?"not_started":"unsupported",payment:"not_recorded",lobReference:null};
 if(o.case_id!==c.id||o.org_id!==c.org_id||o.user_id!==c.attorney_id||!statuses.has(o.status))throw Error("Order mismatch");
 const receipt=o.court_fee_cents===0?o.lob_letter_id:o.lob_check_id;
 const reference=(o.court_fee_cents===0?/^ltr_[A-Za-z0-9]+$/:/^chk_[A-Za-z0-9]+$/).test(receipt||"")?receipt:null;
 if(o.status==="submitted_to_lob"&&!reference)throw Error("Missing provider receipt");
 return {caseId:c.id,status:o.status,payment:o.status==="approved"?(o.stripe_session_id?"checkout_created":"not_recorded"):"verified_recorded",lobReference:o.status==="submitted_to_lob"?reference:null,reviewedAt:time(o.reviewed_at),attemptedAt:time(o.attempted_at),expectedDeliveryDate:null,providerEvents:[],providerStatus:"not_checked"};
}
export async function enrichProfessionalTracking(result,o,{stripe,env,network}){
 if(!o)return result;
 if(o.stripe_session_id&&/^cs_live_[A-Za-z0-9]+$/.test(o.stripe_session_id)){
  result.paymentCheck="unavailable";
  if(stripe)try{
   const session=await stripe.checkout.sessions.retrieve(o.stripe_session_id,{expand:["payment_intent.latest_charge"]});
   result.paymentCheck=verifiedProfessionalMailPayment(session,o)?"verified":"not_verified";
  }catch{}
 }
 if(!result.lobReference)return result;
 result.providerStatus="unavailable";
 if(!env.LOB_LIVE_API_KEY?.startsWith("live_"))return result;
 try{
  const type=result.lobReference.startsWith("ltr_")?"letters":"checks";
  const r=await network("https://api.lob.com/v1/"+type+"/"+result.lobReference,{headers:{Authorization:"Basic "+Buffer.from(env.LOB_LIVE_API_KEY+":").toString("base64")},signal:AbortSignal.timeout(10000)});
  if(!r.ok)return result;
  const data=await r.json();if(data.id!==result.lobReference||data.deleted===true)return result;
  result.providerStatus="checked";result.expectedDeliveryDate=date(data.expected_delivery_date);
  result.renderStatus=["processed","rendered","failed"].includes(data.status)?data.status:null;
  result.providerEvents=(Array.isArray(data.tracking_events)?data.tracking_events:[]).filter(e=>events.has(e.name)&&time(e.time)).map(e=>({name:e.name,time:e.time})).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(-50);
  result.latestEvent=result.providerEvents.at(-1)||null;
 }catch{}
 return result;
}
export function registerProfessionalMailTracking(app,{context,stripe,env=process.env,network=fetch}){
 const reject=(res,status,error)=>res.status(status).json({ok:false,error});
 async function authorized(req,res){
  res.setHeader("Cache-Control","no-store, private");
  const ctx=await context(req,res);if(!ctx)return null;
  if(ctx.mode!=="production"||!ctx.user.email_confirmed_at||!uuid(ctx.user.id)){reject(res,403,"Verified professional account required.");return null;}
  return ctx;
 }
 async function records(ctx,org,ids){
  const filter="org_id=eq."+org+"&attorney_id=eq."+ctx.user.id+"&id=in.("+ids.join(",")+")";
  // Parent reads must use the caller's JWT and RLS, never service role.
  const cases=await ctx.rest("professional_cases","select=id,org_id,attorney_id,court_id,outcome&"+filter);
  if(!Array.isArray(cases)||cases.length!==ids.length||cases.some(c=>!ids.includes(c.id)||c.org_id!==org||c.attorney_id!==ctx.user.id))return null;
  const orders=await ctx.rest("professional_mail_orders","select=case_id,org_id,user_id,document_id,signed_sha,reviewed_at,status,stripe_session_id,stripe_event_id,attempted_at,lob_check_id,lob_letter_id,court_fee_cents&org_id=eq."+org+"&user_id=eq."+ctx.user.id+"&case_id=in.("+ids.join(",")+")",{service:true});
  if(!Array.isArray(orders)||orders.some(o=>!ids.includes(o.case_id)||o.org_id!==org||o.user_id!==ctx.user.id))throw Error("Order mismatch");
  return cases.map(c=>({c,o:orders.find(o=>o.case_id===c.id)||null}));
 }
 app.get("/api/professional/mail-tracking",async(req,res)=>{
  try{
   const ctx=await authorized(req,res);if(!ctx)return;
   const org=req.query?.org,raw=req.query?.ids;
   const ids=typeof raw==="string"&&raw.length<=3700?[...new Set(raw.split(","))]:[];
   if(!uuid(org)||!ids.length||ids.length>100||ids.some(id=>!uuid(id)))return reject(res,400,"Invalid case selection.");
   const rows=await records(ctx,org,ids);if(!rows)return reject(res,403,"Assigned cases required.");
   return res.json({ok:true,cases:rows.map(({c,o})=>projectProfessionalTracking(c,o))});
  }catch{return reject(res,503,"Mailing status could not be verified.");}
 });
 app.get("/api/professional/mail-tracking/:caseId",async(req,res)=>{
  try{
   const ctx=await authorized(req,res);if(!ctx)return;
   const org=req.query?.org,caseId=req.params.caseId;
   if(!uuid(org)||!uuid(caseId))return reject(res,400,"Invalid case selection.");
   const rows=await records(ctx,org,[caseId]);if(!rows)return reject(res,403,"Assigned case required.");
   const {c,o}=rows[0];const result=await enrichProfessionalTracking(projectProfessionalTracking(c,o),o,{stripe,env,network});
   // Recheck the current authenticated scope after the provider reads.
   const check=await ctx.rest("professional_cases","select=id,org_id,attorney_id&org_id=eq."+org+"&attorney_id=eq."+ctx.user.id+"&id=eq."+caseId);
   if(check.length!==1||check[0].id!==caseId||check[0].org_id!==org||check[0].attorney_id!==ctx.user.id)return reject(res,403,"Assigned case required.");
   return res.json({ok:true,case:result});
  }catch{return reject(res,503,"Mailing status could not be verified.");}
 });
}
