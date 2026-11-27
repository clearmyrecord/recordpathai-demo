import {createHash} from "node:crypto";
import {buildCourtCheckRequest,requireLobLiveDispatch} from "./lob-checks.js";
import {findCourtProfile} from "./court-profiles.js";
import {verifiedLiveSubscription} from "./professional-live-billing.js";
export const PROFESSIONAL_MAIL_SERVICE_CENTS=1000;
export const PROFESSIONAL_MAIL_COURT_CENTS=10000;
export const PROFESSIONAL_MAIL_PRODUCT="recordpathai-professional-conviction-mail";
const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const sha=v=>/^[a-f0-9]{64}$/.test(v||"");
const sessionId=v=>/^cs_live_[A-Za-z0-9]+$/.test(v||"");
const eventId=v=>/^evt_[A-Za-z0-9]+$/.test(v||"");
const profileInput={state:"OH",county:"Wood",courtType:"court-of-common-pleas"};
const back="https://recordpathai.com/professional-practice.html";
const digest=b=>createHash("sha256").update(b).digest("hex");
const recent=v=>Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.now()&&Date.parse(v)>Date.now()-30*86400000;
const REQUIRED_REVIEW=["identity","docket","charges","discharge","exclusions","form","signature","authorization","court_fee_and_address"];
const reviewed=o=>recent(o.reviewed_at)&&REQUIRED_REVIEW.every(k=>o.review_checks?.[k]===true);
const metadata=o=>({productType:PROFESSIONAL_MAIL_PRODUCT,userId:o.user_id,caseId:o.case_id,orgId:o.org_id,documentId:o.document_id,signedPdfSha:o.signed_sha,serviceFeeCents:"1000",courtFeeCents:"10000"});
const matches=(s,o)=>Object.entries(metadata(o)).every(([k,v])=>s?.metadata?.[k]===v);
export function verifiedProfessionalMailPayment(s,o){
 const pi=s?.payment_intent,c=pi?.latest_charge;
 return Boolean(o&&sessionId(s?.id)&&s.id===o.stripe_session_id&&s.livemode===true&&s.mode==="payment"&&s.status==="complete"&&s.payment_status==="paid"&&s.currency==="usd"&&s.amount_subtotal===11000&&Number.isSafeInteger(s.amount_total)&&s.amount_total>=11000&&matches(s,o)&&pi?.livemode===true&&pi.status==="succeeded"&&pi.currency==="usd"&&pi.amount===s.amount_total&&pi.amount_received===s.amount_total&&c?.livemode===true&&c.paid===true&&c.status==="succeeded"&&c.payment_intent===pi.id&&c.currency==="usd"&&c.amount===s.amount_total&&c.amount_captured===s.amount_total&&c.amount_refunded===0&&c.refunded===false&&c.disputed===false);
}
export function registerProfessionalMailing(app,{express,context,rest,config,stripe,requireOperationsKey,lobBankVerified,env=process.env,network=fetch}){
 const table="professional_mail_orders";
 const get=async(t,q)=>(await rest(t,{query:"?"+q}))[0]||null;
 const order=caseId=>get(table,"case_id=eq."+caseId+"&limit=1");
 const change=async(o,filter,body)=>await rest(table,{method:"PATCH",query:"?case_id=eq."+o.case_id+"&"+filter,body});
 const send=(res,code,error)=>res.status(code).json({ok:false,error});
 const enabled=async()=>Boolean(stripe&&env.STRIPE_SECRET_KEY?.startsWith("sk_live_")&&env.SUPABASE_SERVICE_ROLE_KEY&&config()?.url==="https://pfyxjhdlqgpzzzdssqpk.supabase.co"&&env.RECORDPATH_PROFESSIONAL_MAILING_ENABLED==="true"&&requireLobLiveDispatch(env)&&findCourtProfile(profileInput)?.lobChecksAuthorized&& (await get("packet_dispatch_controls","id=eq.true&select=live_dispatch_enabled"))?.live_dispatch_enabled===true&&await lobBankVerified());
 async function facts(caseId,docId){
  if(!uuid(caseId)||!uuid(docId))throw Error("Invalid case or document");
  const c=await get("professional_cases","id=eq."+caseId+"&select=id,org_id,attorney_id,client_id,court_id,outcome,case_number&limit=1");
  if(!c||c.court_id!=="oh-wood-common-pleas"||c.outcome!=="conviction"||!c.case_number)throw Error("Unsupported case");
  const [d,r,decision,client]=await Promise.all([
   get("professional_signed_documents","id=eq."+docId+"&case_id=eq."+caseId+"&select=id,case_id,org_id,attorney_id,sha256,page_count,signature_mode,attorney_signature_attested&limit=1"),
   get("professional_signed_reviews","document_id=eq."+docId+"&case_id=eq."+caseId+"&select=*&limit=1"),
   get("professional_case_decisions","case_id=eq."+caseId+"&select=*&limit=1"),
   get("professional_clients","id=eq."+c.client_id+"&select=id,org_id,attorney_id,authorization_confirmed&limit=1")]);
  if(!d||!sha(d.sha256)||d.page_count!==2||d.signature_mode!=="applicant_external"||d.attorney_signature_attested!==true||d.org_id!==c.org_id||d.attorney_id!==c.attorney_id||!r||r.exact_document_reviewed!==true||r.org_id!==c.org_id||r.attorney_id!==c.attorney_id||!decision||decision.decision!=="approved_for_unsigned_draft"||decision.entire_case_reviewed!==true||decision.org_id!==c.org_id||decision.attorney_id!==c.attorney_id||!client||client.authorization_confirmed!==true||client.org_id!==c.org_id||client.attorney_id!==c.attorney_id)throw Error("Exact signed and reviewed client case required");
  return {c,d};
 }
 async function paidCustomer(o){
  const b=await get("professional_live_billing","org_id=eq."+o.org_id+"&authorized_user=eq."+o.user_id+"&approved=eq.true&limit=1");
  if(!b||!["solo","firm"].includes(b.plan))throw Error("Paid account required");
  const customer=await stripe.customers.retrieve(b.stripe_customer_id);
  if(customer.deleted||customer.livemode!==true||customer.metadata?.authorized_user!==o.user_id||customer.metadata?.product_family!=="recordpathai_professional")throw Error("Customer mismatch");
  const list=await stripe.subscriptions.list({customer:customer.id,status:"all",limit:100,expand:["data.latest_invoice"]});
  if(list.has_more)throw Error("Subscription history requires review");
  const outstanding=list.data.filter(s=>!["canceled","incomplete_expired"].includes(s.status));
  if(outstanding.length!==1)throw Error("Active subscription required");
  const s=outstanding[0];if(typeof s.latest_invoice?.charge==="string")s.latest_invoice.charge=await stripe.charges.retrieve(s.latest_invoice.charge);
  if(!verifiedLiveSubscription(s,b))throw Error("Active subscription payment required");
  return customer.id;
 }
 async function owned(req,res,caseId){
  const ctx=await context(req,res);if(!ctx)return null;
  if(ctx.mode!=="production"||!ctx.user.email_confirmed_at||!uuid(caseId)){send(res,403,"Verified professional account required.");return null;}
  const [c]=await ctx.rest("professional_cases","id=eq."+caseId+"&attorney_id=eq."+ctx.user.id+"&select=id,org_id,attorney_id,outcome,court_id&limit=1");
  if(!c||c.outcome!=="conviction"||c.court_id!=="oh-wood-common-pleas"){send(res,403,"Supported assigned conviction required.");return null;}
  return c;
 }
 // Private review tools reuse the existing operations-key boundary. Never expose
 // applicant identity, signed bytes, or court details in public order status.
 app.get("/api/operator/professional-mail/review-queue",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;res.setHeader("Cache-Control","no-store, private");
  try{
   const reviewed=await rest("professional_signed_reviews",{query:"?exact_document_reviewed=eq.true&select=case_id,document_id,org_id,created_at&order=created_at.asc&limit=100"});
   const pending=[];
   for(const r of reviewed){try{if(await order(r.case_id))continue;const {c,d}=await facts(r.case_id,r.document_id);pending.push({caseId:c.id,documentId:d.id,signedSha:d.sha256,reviewedAt:r.created_at});}catch{}}
   return res.json({ok:true,pending});
  }catch{return send(res,503,"Private review queue unavailable.");}
 });
 app.get("/api/operator/professional-mail/review/:caseId/:documentId",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;res.setHeader("Cache-Control","no-store, private");
  try{
   const {c,d}=await facts(req.params.caseId,req.params.documentId);
   const [caseDetails,client]=await Promise.all([get("professional_cases","id=eq."+c.id+"&select=*&limit=1"),get("professional_clients","id=eq."+c.client_id+"&select=*&limit=1")]);
   return res.json({ok:true,case:caseDetails,client,document:d,orderStatus:(await order(c.id))?.status||"awaiting_independent_review"});
  }catch{return send(res,404,"Reviewed conviction not available.");}
 });
 app.get("/api/operator/professional-mail/review-pdf/:caseId/:documentId",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;res.setHeader("Cache-Control","no-store, private");
  try{
   const {d}=await facts(req.params.caseId,req.params.documentId);
   const row=await get("professional_signed_documents","id=eq."+d.id+"&select=pdf_bytes,sha256&limit=1");
   if(typeof row?.pdf_bytes!=="string"||!/^\\\\x[0-9a-f]+$/i.test(row.pdf_bytes)||row.pdf_bytes.length>4194306)return send(res,409,"Exact signed document unavailable.");
   const bytes=Buffer.from(row.pdf_bytes.slice(2),"hex");
   if(bytes.length<500||digest(bytes)!==d.sha256||row.sha256!==d.sha256)return send(res,409,"Exact signed document mismatch.");
   res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Content-Disposition",'attachment; filename="professional-signed-application.pdf"');
   return res.type("application/pdf").send(bytes);
  }catch{return send(res,503,"Private document unavailable.");}
 });
 app.post("/api/operator/professional-mail/approve",express.json({limit:"16kb"}),async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  try{
   const {case_id,document_id,reviewer_reference,independent_review_confirmed,review_checks}=req.body||{};
   if(independent_review_confirmed!==true||!REQUIRED_REVIEW.every(k=>review_checks?.[k]===true)||typeof reviewer_reference!=="string"||reviewer_reference.trim().length<12||reviewer_reference.length>500)return send(res,400,"Actual independent review evidence required.");
   const {c,d}=await facts(case_id,document_id);
   if(await order(c.id))return send(res,409,"Existing order requires operator reconciliation.");
   const o={case_id:c.id,org_id:c.org_id,user_id:c.attorney_id,document_id:d.id,signed_sha:d.sha256,reviewer_reference:reviewer_reference.trim(),review_checks:Object.fromEntries(REQUIRED_REVIEW.map(k=>[k,true]))};
   const rows=await rest(table,{method:"POST",body:o});
   if(rows.length!==1)return send(res,503,"Approval not persisted.");
   return res.json({ok:true,status:"approved"});
  }catch{return send(res,409,"Independent review or private order unavailable.");}
 });
 app.get("/api/professional/mail/:caseId",async(req,res)=>{
  try{
   const c=await owned(req,res,req.params.caseId);if(!c)return;
   const o=await order(c.id);
   if(o&&(o.user_id!==c.attorney_id||o.org_id!==c.org_id))return send(res,403,"Order ownership mismatch.");
   let ready=false;try{ready=Boolean(o?.status==="approved"&&reviewed(o)&&await enabled());}catch{}
   const result={ok:true,status:o?.status||"awaiting_independent_review",checkoutReady:ready,serviceFeeCents:1000,courtFeeCents:10000,lobCheckId:o?.lob_check_id||null};
   if(o?.lob_check_id&&env.LOB_LIVE_API_KEY?.startsWith("live_")){
    try{const r=await network("https://api.lob.com/v1/checks/"+o.lob_check_id,{headers:{Authorization:"Basic "+Buffer.from(env.LOB_LIVE_API_KEY+":").toString("base64")},signal:AbortSignal.timeout(10000)});if(r.ok){const data=await r.json();if(data.id===o.lob_check_id){result.expectedDeliveryDate=data.expected_delivery_date||null;result.providerEvents=Array.isArray(data.tracking_events)?data.tracking_events.slice(-10).map(e=>({name:e.name,time:e.time})):[];}}}catch{}
   }
   return res.json(result);
  }catch{return send(res,503,"Mailing status unavailable. Do not pay again.");}
 });
 app.post("/api/professional/mail/:caseId/checkout",async(req,res)=>{
  try{
   const c=await owned(req,res,req.params.caseId);if(!c)return;
   if(req.get("x-professional-mail-consent")!=="yes")return send(res,400,"Explicit mailing and payment consent required.");
   if(!await enabled())return send(res,503,"Professional mailing is not enabled.");
   const o=await order(c.id);
   if(!o||o.user_id!==c.attorney_id||o.org_id!==c.org_id||o.status!=="approved"||!reviewed(o))return send(res,409,"Independent signed-packet approval required; check existing orders.");
   const {d}=await facts(o.case_id,o.document_id);if(d.sha256!==o.signed_sha)return send(res,409,"Approved document changed.");
   const customer=await paidCustomer(o);
   let s;
   if(o.stripe_session_id){s=await stripe.checkout.sessions.retrieve(o.stripe_session_id);}
   else {
    s=await stripe.checkout.sessions.create({mode:"payment",customer,customer_update:{address:"auto"},automatic_tax:{enabled:true},success_url:back,cancel_url:back,metadata:metadata(o),payment_intent_data:{metadata:metadata(o)},line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:1000,tax_behavior:"exclusive",product_data:{name:"RecordPathAI professional mailing service",tax_code:"txcd_20030000"}}},{quantity:1,price_data:{currency:"usd",unit_amount:10000,tax_behavior:"inclusive",product_data:{name:"Court filing deposit",tax_code:"txcd_00000000"}}}]},{idempotencyKey:"rpai-pro-mail-"+o.case_id});
    if(!sessionId(s.id)||!matches(s,o)||s.customer!==customer||s.livemode!==true)throw Error("Checkout mismatch");
    const saved=await change(o,"status=eq.approved&stripe_session_id=is.null",{stripe_session_id:s.id});
    if(saved.length!==1&&(await order(o.case_id))?.stripe_session_id!==s.id)throw Error("Checkout persistence failed");
   }
   if(!sessionId(s.id)||!matches(s,o)||s.customer!==customer||s.status!=="open"||s.livemode!==true||new URL(s.url).origin!=="https://checkout.stripe.com")return send(res,409,"Existing checkout requires review. Do not pay twice.");
   return res.json({ok:true,url:s.url});
  }catch{return send(res,503,"Checkout unavailable. No duplicate payment should be attempted.");}
 });
 async function reconcile(session,res,event){
  try{
   if(!eventId(event?.id)||event.livemode!==true||!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)||event.data?.object?.id!==session?.id||!sessionId(session?.id))return send(res,400,"Verified live Stripe event required.");
   if(session.payment_status!=="paid")return res.json({received:true,pending:true});
   const o=await get(table,"stripe_session_id=eq."+session.id+"&limit=1");
   if(!o)return send(res,503,"Order not yet persisted; retry.");
   const current=await stripe.checkout.sessions.retrieve(session.id,{expand:["payment_intent.latest_charge"]});
   if(!verifiedProfessionalMailPayment(current,o))return send(res,409,"Professional mailing payment not verified.");
   if(o.status==="approved"){const saved=await change(o,"status=eq.approved",{status:"paid_hold",stripe_event_id:event.id});if(saved.length!==1&&(await order(o.case_id))?.status==="approved")throw Error("Hold not persisted");}
   return res.json({received:true,product:PROFESSIONAL_MAIL_PRODUCT});
  }catch{return send(res,503,"Professional payment reconciliation unavailable; retry.");}
 }
 async function dispatch(o){
  if(!await enabled()||o.status!=="paid_hold"||!eventId(o.stripe_event_id)||!reviewed(o)||o.attempted_at)return false;
  const {c,d}=await facts(o.case_id,o.document_id);if(d.sha256!==o.signed_sha||c.org_id!==o.org_id||c.attorney_id!==o.user_id)return false;
  const live=await stripe.checkout.sessions.retrieve(o.stripe_session_id,{expand:["payment_intent.latest_charge"]});if(!verifiedProfessionalMailPayment(live,o))return false;
  const row=await get("professional_signed_documents","id=eq."+d.id+"&select=pdf_bytes,sha256&limit=1");
  const hex=row?.pdf_bytes;if(typeof hex!=="string"||!hex.startsWith("\\x")||hex.length>4194306)return false;
  const bytes=Buffer.from(hex.slice(2),"hex");if(bytes.length<500||digest(bytes)!==o.signed_sha||row.sha256!==o.signed_sha)return false;
  const cfg=config(),headers={apikey:cfg.key,Authorization:"Bearer "+cfg.key};
  const bucket=await network(cfg.url+"/storage/v1/bucket/packet-documents",{headers,signal:AbortSignal.timeout(12000)});
  if(!bucket.ok||(await bucket.json()).public!==false)return false;
  const path="private/professional-mail/"+o.case_id+"/"+o.signed_sha+".pdf";
  const stored=await network(cfg.url+"/storage/v1/object/packet-documents/"+path,{method:"POST",headers:{...headers,"Content-Type":"application/pdf","x-upsert":"true"},body:bytes,signal:AbortSignal.timeout(15000)});
  if(!stored.ok)return false;
  const sign=await network(cfg.url+"/storage/v1/object/sign/packet-documents/"+path,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:259200}),signal:AbortSignal.timeout(15000)});
  if(!sign.ok)return false;const result=await sign.json(),p=result.signedURL||result.signedUrl||"";
  if(!p)return false;const url=p.startsWith("https://")?p:cfg.url+(p.startsWith("/storage/v1")?p:"/storage/v1"+p);
  if(new URL(url).origin!==new URL(cfg.url).origin)return false;
  const profile=findCourtProfile(profileInput);
  const request=buildCourtCheckRequest({profileInput,review:{status:"approved",fee_payment_method:"lob_check",verified_check_payee:profile.courtFeePayee,verified_filing_address:profile.postalAddress,approved_court_fee_cents:10000,form_type:"sealing-conviction"},from:JSON.parse(env.LOB_FROM_ADDRESS_JSON||"null"),bankAccount:env.LOB_VERIFIED_BANK_ID,attachmentUrl:url,attachmentPages:2,caseReference:c.case_number,approvedCourtFeeCents:10000});
  // Recheck charge just before the atomic claim; never retry a claimed order automatically.
  if(!await enabled()||!verifiedProfessionalMailPayment(await stripe.checkout.sessions.retrieve(o.stripe_session_id,{expand:["payment_intent.latest_charge"]}),o))return false;
  const claimed=await change(o,"status=eq.paid_hold&attempted_at=is.null",{status:"dispatch_claimed",attempted_at:new Date().toISOString()});
  if(claimed.length!==1)return false;
  const lob=await network("https://api.lob.com/v1/checks",{method:"POST",headers:{Authorization:"Basic "+Buffer.from(env.LOB_LIVE_API_KEY+":").toString("base64"),"Content-Type":"application/json","Idempotency-Key":"rpai-pro-"+o.stripe_session_id},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
  if(!lob.ok)return false;
  const check=await lob.json();if(!/^chk_[A-Za-z0-9]+$/.test(check.id||""))return false;
  const saved=await change(o,"status=eq.dispatch_claimed",{status:"submitted_to_lob",lob_check_id:check.id});
  return saved.length===1&&saved[0].lob_check_id===check.id;
 }
 async function fulfill(){
  const counts={submitted:0,held:0};
  if(!await enabled())return counts;
  const jobs=await rest(table,{query:"?status=eq.paid_hold&attempted_at=is.null&order=created_at.asc&limit=3"});
  for(const o of jobs){try{if(await dispatch(o))counts.submitted++;else counts.held++;}catch{counts.held++;}}
  return counts;
 }
 app.post("/api/operator/professional-mail/fulfill-paid",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  if(env.RECORDPATH_ENABLE_AUTOMATIC_FULFILLMENT!=="true")return send(res,503,"Automatic fulfillment disabled.");
  try{return res.json({ok:true,...await fulfill()});}catch{return send(res,503,"Professional fulfillment unavailable.");}
 });
 return {reconcile,fulfill};
}
