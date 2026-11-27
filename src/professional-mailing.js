import {createHash} from "node:crypto";
import {buildCourtCheckRequest,buildCourtLetterRequest,requireLobLiveDispatch} from "./lob-checks.js";
import {findCourtProfile} from "./court-profiles.js";
import {providerReadiness,sendPremiumEmail,sendPremiumSms} from "./recordwatch-alert-dispatch.js";
import {canonicalSmsPhone,validAlertEmail} from "./recordwatch-alerts.js";
import {verifiedLiveSubscription} from "./professional-live-billing.js";
export const PROFESSIONAL_MAIL_SERVICE_CENTS=1000;
export const PROFESSIONAL_MAIL_COURT_CENTS=10000;
const supportedOutcome=v=>["conviction","dismissal","not_guilty"].includes(v);
const feeForOutcome=v=>v==="conviction"?10000:supportedOutcome(v)?0:null;
const courtFee=o=>o.court_fee_cents??10000;
const subtotal=o=>PROFESSIONAL_MAIL_SERVICE_CENTS+courtFee(o);
export const PROFESSIONAL_MAIL_PRODUCT="recordpathai-professional-conviction-mail";
const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const sha=v=>/^[a-f0-9]{64}$/.test(v||"");
const sessionId=v=>/^cs_live_[A-Za-z0-9]+$/.test(v||"");
const eventId=v=>/^evt_[A-Za-z0-9]+$/.test(v||"");
const profileInput={state:"OH",county:"Wood",courtType:"court-of-common-pleas"};
const back=o=>"https://recordpathai.com/professional-packet.html?"+new URLSearchParams({caseId:o.case_id,org:o.org_id});
const digest=b=>createHash("sha256").update(b).digest("hex");
const recent=v=>Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.now()&&Date.parse(v)>Date.now()-30*86400000;
const REQUIRED_REVIEW=["identity","docket","charges","discharge","exclusions","form","signature","authorization","court_fee_and_address"];
const reviewed=o=>recent(o.reviewed_at)&&REQUIRED_REVIEW.every(k=>o.review_checks?.[k]===true);
const metadata=o=>({productType:PROFESSIONAL_MAIL_PRODUCT,userId:o.user_id,caseId:o.case_id,orgId:o.org_id,documentId:o.document_id,signedPdfSha:o.signed_sha,serviceFeeCents:String(PROFESSIONAL_MAIL_SERVICE_CENTS),courtFeeCents:String(courtFee(o))});
const matches=(s,o)=>Object.entries(metadata(o)).every(([k,v])=>s?.metadata?.[k]===v);
export function verifiedProfessionalMailPayment(s,o){
 const pi=s?.payment_intent,c=pi?.latest_charge;
 return Boolean(o&&sessionId(s?.id)&&s.id===o.stripe_session_id&&s.livemode===true&&s.mode==="payment"&&s.status==="complete"&&s.payment_status==="paid"&&s.currency==="usd"&&s.amount_subtotal===subtotal(o)&&Number.isSafeInteger(s.amount_total)&&s.amount_total>=subtotal(o)&&matches(s,o)&&pi?.livemode===true&&pi.status==="succeeded"&&pi.currency==="usd"&&pi.amount===s.amount_total&&pi.amount_received===s.amount_total&&c?.livemode===true&&c.paid===true&&c.status==="succeeded"&&c.payment_intent===pi.id&&c.currency==="usd"&&c.amount===s.amount_total&&c.amount_captured===s.amount_total&&c.amount_refunded===0&&c.refunded===false&&c.disputed===false);
}
export async function professionalVerifiedEventKeys(rest,o,consentAt){
 const keys=[];
 let eventCursor=null;
 while(true){
  const events=await rest("professional_verified_court_events",{query:"?case_id=eq."+o.case_id+"&org_id=eq."+o.org_id+"&attorney_id=eq."+o.user_id+"&verified_at=gte."+encodeURIComponent(consentAt)+"&select=id&order=id.asc&limit=30"+(eventCursor?"&id=gt."+encodeURIComponent(eventCursor):"")});
  if(!Array.isArray(events)||events.some(e=>!uuid(e.id)))throw Error("Invalid verified event page");
  for(const e of events){if(eventCursor&&e.id<=eventCursor)throw Error("Invalid verified event cursor");keys.push("court:"+e.id);eventCursor=e.id;}
  if(events.length<30)break;
 }
 return keys;
}
export function registerProfessionalMailing(app,{express,context,rest,config,stripe,requireOperationsKey,lobBankVerified,env=process.env,network=fetch}){
 const table="professional_mail_orders";
 const get=async(t,q)=>(await rest(t,{query:"?"+q}))[0]||null;
 const order=caseId=>get(table,"case_id=eq."+caseId+"&limit=1");
 const change=async(o,filter,body)=>await rest(table,{method:"PATCH",query:"?case_id=eq."+o.case_id+"&"+filter,body});
 const send=(res,code,error)=>res.status(code).json({ok:false,error});
 const prefTable="professional_mail_alert_preferences",ledger="professional_mail_alert_deliveries";
 const alertsReady=()=>env.RECORDPATH_PROFESSIONAL_ALERTS_ENABLED==="true"&&providerReadiness(env).email_ready&&providerReadiness(env).sms_ready;
 const preferences=o=>get(prefTable,"case_id=eq."+o.case_id+"&user_id=eq."+o.user_id+"&org_id=eq."+o.org_id+"&limit=1");
 async function verifiedRecipient(userId){
  const cfg=config();
  const response=await network(cfg.url+"/auth/v1/admin/users/"+userId,{headers:{apikey:cfg.key,Authorization:"Bearer "+cfg.key},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error("Recipient verification unavailable");
  const u=await response.json();
  if(u.id!==userId)throw Error("Recipient mismatch");
  return {email:u.email_confirmed_at&&validAlertEmail(u.email)?u.email:null,phone:u.phone_confirmed_at?canonicalSmsPhone(u.phone)||null:null};
 }
 const suppressed=phone=>get("recordwatch_sms_suppressions","phone_number=eq."+encodeURIComponent(phone)+"&limit=1");
 async function alertStorageReady(){
  if(!alertsReady())return false;
  try{await rest(prefTable,{query:"?select=case_id&limit=1"});await rest(ledger,{query:"?select=case_id&limit=1"});return true;}catch{return false;}
 }
 const enabled=async(o={court_fee_cents:10000})=>Boolean(stripe&&env.STRIPE_SECRET_KEY?.startsWith("sk_live_")&&env.SUPABASE_SERVICE_ROLE_KEY&&config()?.url==="https://pfyxjhdlqgpzzzdssqpk.supabase.co"&&env.RECORDPATH_PROFESSIONAL_MAILING_ENABLED==="true"&&env.RECORDPATH_ENABLE_AUTOMATIC_FULFILLMENT==="true"&&Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"))&& (await get("packet_dispatch_controls","id=eq.true&select=live_dispatch_enabled"))?.live_dispatch_enabled===true&& (courtFee(o)===10000?requireLobLiveDispatch(env)&&findCourtProfile(profileInput)?.lobChecksAuthorized&&await lobBankVerified():courtFee(o)===0&&env.RECORDPATH_ENABLE_LIVE_DISPATCH==="true"&&env.LOB_LIVE_LETTERS_ENABLED==="true"&&env.LOB_LIVE_API_KEY?.startsWith("live_")&&findCourtProfile(profileInput)?.dismissalMailingAccepted));
 async function facts(caseId,docId){
  if(!uuid(caseId)||!uuid(docId))throw Error("Invalid case or document");
  const c=await get("professional_cases","id=eq."+caseId+"&select=id,org_id,attorney_id,client_id,court_id,outcome,case_number&limit=1");
  if(!c||c.court_id!=="oh-wood-common-pleas"||!supportedOutcome(c.outcome)||!c.case_number)throw Error("Unsupported case");
  const [d,r,decision,client]=await Promise.all([
   get("professional_signed_documents","id=eq."+docId+"&case_id=eq."+caseId+"&select=id,case_id,org_id,attorney_id,sha256,page_count,signature_mode,attorney_signature_attested&limit=1"),
   get("professional_signed_reviews","document_id=eq."+docId+"&case_id=eq."+caseId+"&select=*&limit=1"),
   get("professional_case_decisions","case_id=eq."+caseId+"&select=*&limit=1"),
   get("professional_clients","id=eq."+c.client_id+"&select=id,org_id,attorney_id,authorization_confirmed&limit=1")]);
  if(!d||!sha(d.sha256)||d.page_count!==2||d.signature_mode!=="applicant_external"||d.attorney_signature_attested!==true||d.org_id!==c.org_id||d.attorney_id!==c.attorney_id||!r||r.exact_document_reviewed!==true||r.org_id!==c.org_id||r.attorney_id!==c.attorney_id||!decision||decision.decision!=="approved_for_unsigned_draft"||decision.entire_case_reviewed!==true||decision.org_id!==c.org_id||decision.attorney_id!==c.attorney_id||!client||client.authorization_confirmed!==true||client.org_id!==c.org_id||client.attorney_id!==c.attorney_id)throw Error("Exact signed and reviewed client case required");
  const latest=await get("professional_signed_documents","case_id=eq."+caseId+"&org_id=eq."+c.org_id+"&attorney_id=eq."+c.attorney_id+"&select=id&order=created_at.desc,id.desc&limit=1");
  if(latest?.id!==d.id)throw Error("A newer signed application requires independent review.");
  return {c,d};
 }
 async function ownerMailGrant(o){
  // Separate service-managed production grant; ordinary test access is insufficient.
  const grant=await get("professional_owner_mail_access","org_id=eq."+o.org_id+"&user_id=eq."+o.user_id+"&revoked_at=is.null&limit=1");
  if(!grant||grant.org_id!==o.org_id||grant.user_id!==o.user_id||!Number.isFinite(Date.parse(grant.expires_at))||Date.parse(grant.expires_at)<=Date.now())return false;
  const [workspace,member,test]=await Promise.all([
   get("professional_pilot_orgs","id=eq."+o.org_id+"&active=eq.true&access_kind=eq.paid&limit=1"),
   get("professional_pilot_members","org_id=eq."+o.org_id+"&user_id=eq."+o.user_id+"&active=eq.true&limit=1"),
   get("professional_test_access","org_id=eq."+o.org_id+"&user_id=eq."+o.user_id+"&revoked_at=is.null&limit=1")
  ]);
  return Boolean(workspace?.id===o.org_id&&workspace.active===true&&workspace.access_kind==="paid"&&member?.org_id===o.org_id&&member.user_id===o.user_id&&member.active===true&&test?.org_id===o.org_id&&test.user_id===o.user_id&&!test.revoked_at&&Date.parse(test.expires_at)>Date.now());
 }
 async function paidCustomer(o){
  const b=await get("professional_live_billing","org_id=eq."+o.org_id+"&authorized_user=eq."+o.user_id+"&approved=eq.true&limit=1");
  if(!b||!["solo","firm"].includes(b.plan))throw Error("Paid account required");
  const customer=await stripe.customers.retrieve(b.stripe_customer_id);
  if(customer.deleted||customer.livemode!==true||customer.metadata?.authorized_user!==o.user_id||customer.metadata?.product_family!=="recordpathai_professional")throw Error("Customer mismatch");
  const list=await stripe.subscriptions.list({customer:customer.id,status:"all",limit:100,expand:["data.latest_invoice"]});
  if(list.has_more)throw Error("Subscription history requires review");
  const outstanding=list.data.filter(s=>!["canceled","incomplete_expired"].includes(s.status));
  if(outstanding.length===0&&await ownerMailGrant(o))return customer.id;
  if(outstanding.length!==1)throw Error("Active subscription or approved owner filing access required");
  const s=outstanding[0];if(typeof s.latest_invoice?.charge==="string")s.latest_invoice.charge=await stripe.charges.retrieve(s.latest_invoice.charge);
  if(!verifiedLiveSubscription(s,b))throw Error("Active subscription payment required");
  return customer.id;
 }
 async function owned(req,res,caseId){
  const ctx=await context(req,res);if(!ctx)return null;
  if(ctx.mode!=="production"||!ctx.user.email_confirmed_at||!uuid(caseId)){send(res,403,"Verified professional account required.");return null;}
  const [c]=await ctx.rest("professional_cases","id=eq."+caseId+"&attorney_id=eq."+ctx.user.id+"&select=id,org_id,attorney_id,outcome,court_id&limit=1");
  if(!c||!supportedOutcome(c.outcome)||c.court_id!=="oh-wood-common-pleas"){send(res,403,"Supported assigned case required.");return null;}
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
  }catch{return send(res,404,"Reviewed case not available.");}
 });
 app.get("/api/operator/professional-mail/review-pdf/:caseId/:documentId",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;res.setHeader("Cache-Control","no-store, private");
  try{
   const {d}=await facts(req.params.caseId,req.params.documentId);
   const row=await get("professional_signed_documents","id=eq."+d.id+"&select=pdf_bytes,sha256&limit=1");
   if(typeof row?.pdf_bytes!=="string"||!row.pdf_bytes.startsWith("\\x")||!/^[0-9a-f]+$/i.test(row.pdf_bytes.slice(2))||row.pdf_bytes.length>4194306)return send(res,409,"Exact signed document unavailable.");
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
   const o={case_id:c.id,org_id:c.org_id,user_id:c.attorney_id,document_id:d.id,signed_sha:d.sha256,court_fee_cents:feeForOutcome(c.outcome),reviewer_reference:reviewer_reference.trim(),review_checks:Object.fromEntries(REQUIRED_REVIEW.map(k=>[k,true]))};
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
   let ready=false,checkoutBlocker=null;
   if(!o)checkoutBlocker="independent_review_required";
   else if(o.status!=="approved")checkoutBlocker="existing_order";
   else if(!reviewed(o)||courtFee(o)!==feeForOutcome(c.outcome))checkoutBlocker="independent_review_required";
   else try{
    const {d}=await facts(o.case_id,o.document_id);
    if(d.sha256!==o.signed_sha)checkoutBlocker="independent_review_required";
    else if(!await enabled(o))checkoutBlocker="mailing_not_enabled";
    else if(!await alertStorageReady())checkoutBlocker="alerts_not_ready";
    else {try{await paidCustomer(o);ready=true;}catch{checkoutBlocker="billing_access_required";}}
   }catch{checkoutBlocker="review_or_service_unavailable";}
   const result={ok:true,status:o?.status||"awaiting_independent_review",checkoutReady:ready,checkoutBlocker,serviceFeeCents:PROFESSIONAL_MAIL_SERVICE_CENTS,courtFeeCents:feeForOutcome(c.outcome),lobCheckId:o?.lob_check_id||null,lobLetterId:o?.lob_letter_id||null};
   if((o?.lob_check_id||o?.lob_letter_id)&&env.LOB_LIVE_API_KEY?.startsWith("live_")){
    try{const r=await network("https://api.lob.com/v1/"+(o.lob_letter_id?"letters/"+o.lob_letter_id:"checks/"+o.lob_check_id),{headers:{Authorization:"Basic "+Buffer.from(env.LOB_LIVE_API_KEY+":").toString("base64")},signal:AbortSignal.timeout(10000)});if(r.ok){const data=await r.json();if(data.id===(o.lob_letter_id||o.lob_check_id)){result.expectedDeliveryDate=data.expected_delivery_date||null;result.providerEvents=Array.isArray(data.tracking_events)?data.tracking_events.slice(-10).map(e=>({name:e.name,time:e.time})):[];}}}catch{}
   }
   return res.json(result);
  }catch{return send(res,503,"Mailing status unavailable. Do not pay again.");}
 });
 app.get("/api/professional/mail/:caseId/alerts",async(req,res)=>{
  res.setHeader("Cache-Control","no-store, private");
  try{
   const c=await owned(req,res,req.params.caseId);if(!c)return;
   const o=await order(c.id);if(!o||o.user_id!==c.attorney_id||o.org_id!==c.org_id)return send(res,409,"Approved order required.");
   const [recipient,p]=await Promise.all([verifiedRecipient(o.user_id),preferences(o)]);
   return res.json({ok:true,emailAvailable:Boolean(recipient.email),smsAvailable:Boolean(recipient.phone&&!await suppressed(recipient.phone)),emailEnabled:p?.email_enabled===true,smsEnabled:p?.sms_enabled===true});
  }catch{return send(res,503,"Alert preferences unavailable.");}
 });
 app.post("/api/professional/mail/:caseId/alerts",express.json({limit:"4kb"}),async(req,res)=>{
  res.setHeader("Cache-Control","no-store, private");
  try{
   const c=await owned(req,res,req.params.caseId);if(!c)return;
   const o=await order(c.id);if(!o||o.user_id!==c.attorney_id||o.org_id!==c.org_id)return send(res,409,"Approved order required.");
   const {emailEnabled,smsEnabled,consentConfirmed}=req.body||{};
   if(typeof emailEnabled!=="boolean"||typeof smsEnabled!=="boolean"||((emailEnabled||smsEnabled)&&consentConfirmed!==true))return send(res,400,"Explicit notification consent required.");
   const recipient=await verifiedRecipient(o.user_id);
   if(emailEnabled&&!recipient.email||smsEnabled&&(!recipient.phone||await suppressed(recipient.phone)))return send(res,409,"Verified account contact and active SMS consent required.");
   const rows=await rest(prefTable,{method:"POST",query:"?on_conflict=case_id",prefer:"resolution=merge-duplicates,return=representation",body:{case_id:o.case_id,user_id:o.user_id,org_id:o.org_id,email:emailEnabled?recipient.email:null,phone:smsEnabled?recipient.phone:null,email_enabled:emailEnabled,sms_enabled:smsEnabled,consent_at:new Date().toISOString(),updated_at:new Date().toISOString()}});
   if(rows.length!==1)return send(res,503,"Preferences not saved.");
   return res.json({ok:true,emailEnabled,smsEnabled});
  }catch{return send(res,503,"Unable to save alert preferences.");}
 });
 app.post("/api/professional/mail/:caseId/checkout",async(req,res)=>{
  try{
   const c=await owned(req,res,req.params.caseId);if(!c)return;
   if(req.get("x-professional-mail-consent")!=="yes")return send(res,400,"Explicit mailing and payment consent required.");
   if(!await enabled({court_fee_cents:feeForOutcome(c.outcome)}))return send(res,503,"Professional mailing is not enabled.");
   const o=await order(c.id);
   if(!o||o.user_id!==c.attorney_id||o.org_id!==c.org_id||o.status!=="approved"||!reviewed(o)||courtFee(o)!==feeForOutcome(c.outcome))return send(res,409,"Independent signed-packet approval required; check existing orders.");
   const {d}=await facts(o.case_id,o.document_id);if(d.sha256!==o.signed_sha)return send(res,409,"Approved document changed.");
   if(!await alertStorageReady())return send(res,503,"Mailing and alert bundle is not ready.");
   const customer=await paidCustomer(o);
   let s;
   if(o.stripe_session_id){s=await stripe.checkout.sessions.retrieve(o.stripe_session_id);}
   else {
    s=await stripe.checkout.sessions.create({mode:"payment",customer,customer_update:{address:"auto"},automatic_tax:{enabled:true},success_url:back(o),cancel_url:back(o),metadata:metadata(o),payment_intent_data:{metadata:metadata(o)},line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:PROFESSIONAL_MAIL_SERVICE_CENTS,tax_behavior:"exclusive",product_data:{name:"RecordPathAI professional mailing and case alerts",tax_code:"txcd_20030000"}}},...(courtFee(o)>0?[{quantity:1,price_data:{currency:"usd",unit_amount:courtFee(o),tax_behavior:"inclusive",product_data:{name:"Court filing deposit",tax_code:"txcd_00000000"}}}]:[])]},{idempotencyKey:"rpai-pro-mail-"+o.case_id});
    if(!sessionId(s.id)||!matches(s,o)||s.customer!==customer||s.livemode!==true||s.amount_subtotal!==subtotal(o)||!Number.isSafeInteger(s.amount_total)||s.amount_total<subtotal(o))throw Error("Checkout mismatch");
    const saved=await change(o,"status=eq.approved&stripe_session_id=is.null",{stripe_session_id:s.id});
    if(saved.length!==1&&(await order(o.case_id))?.stripe_session_id!==s.id)throw Error("Checkout persistence failed");
   }
   if(!sessionId(s.id)||!matches(s,o)||s.customer!==customer||s.status!=="open"||s.livemode!==true||s.amount_subtotal!==subtotal(o)||!Number.isSafeInteger(s.amount_total)||s.amount_total<subtotal(o)||new URL(s.url).origin!=="https://checkout.stripe.com")return send(res,409,"Existing checkout requires review. Do not pay twice.");
   return res.json({ok:true,url:s.url,totalCents:s.amount_total});
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
  if(!await enabled(o)||o.status!=="paid_hold"||!eventId(o.stripe_event_id)||!reviewed(o)||o.attempted_at)return false;
  const {c,d}=await facts(o.case_id,o.document_id);if(d.sha256!==o.signed_sha||c.org_id!==o.org_id||c.attorney_id!==o.user_id||courtFee(o)!==feeForOutcome(c.outcome))return false;
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
  const request=courtFee(o)===0?buildCourtLetterRequest({profileInput,review:{status:"approved",fee_payment_method:"no_fee",verified_filing_address:profile.postalAddress,approved_court_fee_cents:0,accepted_fee_waiver:false,form_type:"sealing-dismissal"},from:JSON.parse(env.LOB_FROM_ADDRESS_JSON||"null"),attachmentUrl:url,attachmentPages:2}):buildCourtCheckRequest({profileInput,review:{status:"approved",fee_payment_method:"lob_check",verified_check_payee:profile.courtFeePayee,verified_filing_address:profile.postalAddress,approved_court_fee_cents:10000,form_type:"sealing-conviction"},from:JSON.parse(env.LOB_FROM_ADDRESS_JSON||"null"),bankAccount:env.LOB_VERIFIED_BANK_ID,attachmentUrl:url,attachmentPages:2,caseReference:c.case_number,approvedCourtFeeCents:10000});
  // Recheck charge just before the atomic claim; never retry a claimed order automatically.
  if(!await enabled(o)||!verifiedProfessionalMailPayment(await stripe.checkout.sessions.retrieve(o.stripe_session_id,{expand:["payment_intent.latest_charge"]}),o))return false;
  const claimed=await change(o,"status=eq.paid_hold&attempted_at=is.null",{status:"dispatch_claimed",attempted_at:new Date().toISOString()});
  if(claimed.length!==1)return false;
  const letter=courtFee(o)===0;
  const lob=await network("https://api.lob.com/v1/"+(letter?"letters":"checks"),{method:"POST",headers:{Authorization:"Basic "+Buffer.from(env.LOB_LIVE_API_KEY+":").toString("base64"),"Content-Type":"application/json","Idempotency-Key":"rpai-pro-"+o.stripe_session_id},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
  if(!lob.ok)return false;
  const receipt=await lob.json();if(!(letter?/^ltr_[A-Za-z0-9]+$/:/^chk_[A-Za-z0-9]+$/).test(receipt.id||""))return false;
  const key=letter?"lob_letter_id":"lob_check_id";
  const saved=await change(o,"status=eq.dispatch_claimed",{status:"submitted_to_lob",[key]:receipt.id});
  return saved.length===1&&saved[0][key]===receipt.id;
 }
 async function deliverAlerts(){
  if(!await alertStorageReady())return;
  let cursor=null;
  while(true){
  const paid=await rest(table,{query:"?status=in.(paid_hold,submitted_to_lob)&order=case_id.asc&limit=100"+(cursor?"&case_id=gt."+encodeURIComponent(cursor):"")});
  if(!paid.length)break;
  for(const o of paid){
   try{
    if(!eventId(o.stripe_event_id)||!verifiedProfessionalMailPayment(await stripe.checkout.sessions.retrieve(o.stripe_session_id,{expand:["payment_intent.latest_charge"]}),o))continue;
    const p=await preferences(o);if(!p||!p.email_enabled&&!p.sms_enabled)continue;
    const recipient=await verifiedRecipient(o.user_id);
    const keys=["payment_confirmed",...(o.status==="submitted_to_lob"?["mail_submitted"]:[])];
    keys.push(...await professionalVerifiedEventKeys(rest,o,p.consent_at));
    for(const key of keys)for(const channel of ["email","sms"]){
     const current=await preferences(o);
     if(!current||channel==="email"&&(!current.email_enabled||!recipient.email||current.email!==recipient.email)||channel==="sms"&&(!current.sms_enabled||!recipient.phone||current.phone!==recipient.phone||await suppressed(recipient.phone)))continue;
     let claimed;try{claimed=await rest(ledger,{method:"POST",query:"?on_conflict=case_id,event_key,channel",prefer:"resolution=ignore-duplicates,return=representation",body:{case_id:o.case_id,event_key:key,channel}});}catch{continue;}
     if(claimed.length!==1)continue;
     let receipt=null;
     try{
      if(!verifiedProfessionalMailPayment(await stripe.checkout.sessions.retrieve(o.stripe_session_id,{expand:["payment_intent.latest_charge"]}),o))throw Error("Payment revoked");
      const latest=await preferences(o);
      if(!latest||channel==="email"&&(!latest.email_enabled||latest.email!==recipient.email)||channel==="sms"&&(!latest.sms_enabled||latest.phone!==recipient.phone||await suppressed(recipient.phone)))throw Error("Consent revoked");
      const message="A RecordWatch Professional filing update is available. Sign in to view your workspace.";
      receipt=channel==="email"?await sendPremiumEmail({to:recipient.email,subject:"RecordWatch Professional update",message,env,fetchFn:network,professional:true}):await sendPremiumSms({to:recipient.phone,message:message+" Reply STOP to opt out; HELP for help. Msg & data rates may apply.",env,fetchFn:network});
     }catch{/* Never retry an ambiguous provider response automatically. */}
     await rest(ledger,{method:"PATCH",query:"?case_id=eq."+o.case_id+"&event_key=eq."+encodeURIComponent(key)+"&channel=eq."+channel+"&status=eq.claimed",body:{status:receipt?"provider_accepted":"held",provider_id:receipt?.id||null}});
    }
   }catch{/* Isolate a failed case; no unverified send. */}
  }
  if(paid.length<100)break;
  const next=paid.at(-1)?.case_id;if(!uuid(next)||next===cursor)break;cursor=next;
  }
 }
 async function fulfill(){
  const counts={submitted:0,held:0};
  if(!await enabled({court_fee_cents:10000})&&!await enabled({court_fee_cents:0}))return counts;
  const jobs=await rest(table,{query:"?status=eq.paid_hold&attempted_at=is.null&order=created_at.asc&limit=3"});
  for(const o of jobs){try{if(await dispatch(o))counts.submitted++;else counts.held++;}catch{counts.held++;}}
  try{await deliverAlerts();}catch{/* Delivery ledger preserves claimed sends. */}
  return counts;
 }
 app.post("/api/operator/professional-mail/fulfill-paid",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  if(env.RECORDPATH_ENABLE_AUTOMATIC_FULFILLMENT!=="true")return send(res,503,"Automatic fulfillment disabled.");
  try{return res.json({ok:true,...await fulfill()});}catch{return send(res,503,"Professional fulfillment unavailable.");}
 });
 return {reconcile,fulfill};
}
