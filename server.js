import express from "express";
import Stripe from "stripe";
import cors from "cors";
import path from "path";
import dns from "node:dns/promises";
import { RECORDWATCH_BILLING, recordwatchPlan, assertRecordwatchStripePrice, billingPeriod, verifyRecordwatchSubscription, paidRecordwatchCheckout, recordwatchEntitled } from "./src/recordwatch-billing.js";
import { verifiedPacketSession, verifiedRecordwatchSession, safeCheckoutRedirect, assertFixedPacketAmount, PACKET_PRICE_CENTS } from "./src/payment-security.js";
import { RECORDWATCH_LIFETIME_CENTS, RECORDWATCH_LIFETIME_PRICE_ENV, assertRecordwatchLifetimePrice, paidRecordwatchLifetimeCheckout, lifetimeCaseEntitled } from "./src/recordwatch-lifetime.js";
import { quotePacketPricing } from "./src/packet-pricing.js";
import { projectPacketFulfillment } from "./src/packet-fulfillment-tracking.js";
import { evaluatePacketRelease, caseReviewFingerprint, validCaseId } from "./src/packet-release.js";
import { AFFILIATE_COMMISSION_BPS, AFFILIATE_ATTRIBUTION_DAYS, AFFILIATE_HOLD_DAYS, normalizeAffiliateCode, newAffiliateCode, eligibleAffiliatePurchase, affiliateCommissionCents, commissionAvailableAfter } from "./src/affiliate-program.js";
import { affiliatePayoutAmount } from "./src/affiliate-payouts.js";
import { registerAffiliatePayoutRoutes } from "./src/affiliate-payout-service.js";
import { canonicalSmsPhone, validSmsPhone, validAlertEmail, reminderForDate, neutralAlertContent, isPremiumAlertAllowed, validTwilioWebhookSignature, STOP_WORDS } from "./src/recordwatch-alerts.js";
import { providerReadiness, sendPremiumEmail, sendPremiumSms } from "./src/recordwatch-alert-dispatch.js";
import { timingSafeEqual, createHash } from "node:crypto";
import { buildCourtCheckRequest, requireLobLiveDispatch } from "./src/lob-checks.js";
import { findCourtProfile } from "./src/court-profiles.js";
import { verifyLivePacketPaymentForLob } from "./src/lob-dispatch-payment-guard.js";
import { validateOfficialPdfSource, readBoundedPdfResponse } from "./src/pdf-source-security.js";
import { runJurisdictionSearch } from "./tools/court-search-core.js";

const app = express();
const port = process.env.PORT || 8080;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Separate RecordWatch subscription billing from court-packet payments.
// Sandbox prices can be tested without changing the packet-payment provider.
const recordwatchStripe = process.env.STRIPE_RECORDWATCH_SECRET_KEY
  ? new Stripe(process.env.STRIPE_RECORDWATCH_SECRET_KEY)
  : null;

app.use(cors({
  origin: [
    "https://clearmyrecord.github.io",
    "https://recordpathai.com",
    "https://www.recordpathai.com"
  ]
}));

// Private applicant PDF submission; store only to the server's non-public
// Supabase Storage bucket. This does not collect payment, file, or mail.
// Stripe requires the original raw body for signature verification.
// Payment completion creates a persistent paid-but-NOT-mailed job only.
// Dedicated RecordWatch Stripe Billing webhook. Sandbox and live endpoints
// sign with separate secrets and MUST never be mistaken for packet payments.
app.post("/api/recordwatch/stripe-webhook",express.raw({type:"application/json",limit:"256kb"}),async(req,res)=>{
  const secret=process.env.STRIPE_RECORDWATCH_WEBHOOK_SECRET||"";
  if(!recordwatchStripe||!secret||!packetDatabaseReady())
    return res.status(503).json({ok:false,error:"RecordWatch Stripe webhook is not ready."});
  let event;
  try {
    event=recordwatchStripe.webhooks.constructEvent(req.body,req.get("stripe-signature"),secret);
  }catch{
    return res.status(400).json({ok:false,error:"Invalid RecordWatch Stripe signature."});
  }
  try {
    // Refunds and disputes revoke only the affected Stripe-verified case purchase.
    if(["charge.refunded","charge.dispute.created"].includes(event.type)){
      const charge=event.type==="charge.refunded" ? event.data?.object : null;
      const dispute=event.type==="charge.dispute.created" ? event.data?.object : null;
      const piId=typeof (charge?.payment_intent||dispute?.payment_intent)==="string"
        ? (charge?.payment_intent||dispute?.payment_intent)
        : (charge?.payment_intent||dispute?.payment_intent)?.id;
      if(!piId?.startsWith("pi_"))return res.json({received:true});
      const rows=await supabaseRest("recordwatch_lifetime_cases",{
        query:"?stripe_payment_intent_id=eq."+encodeURIComponent(piId)+"&limit=1"
      });
      if(!Array.isArray(rows)||!rows[0])return res.json({received:true});
      await supabaseRest("recordwatch_lifetime_cases",{
        method:"PATCH",query:"?id=eq."+encodeURIComponent(rows[0].id),
        body:{status:dispute?"disputed":"refunded",revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()},
        prefer:"return=representation"
      });
      await voidAffiliateCommission(piId,dispute?"dispute":"refund");
      return res.json({received:true,product:"premium_recordwatch_lifetime",revoked:true});
    }
    if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
      const raw=event.data?.object;
      if(raw?.metadata?.product!=="premium_recordwatch")return res.json({received:true});
      const sub=event.type==="customer.subscription.deleted" ? raw : await recordwatchStripe.subscriptions.retrieve(raw.id);
      await syncVerifiedRecordwatchStripeSubscription(sub);
      return res.json({received:true,product:"premium_recordwatch"});
    }
    if(["invoice.paid","invoice.payment_failed"].includes(event.type)){
      const invoice=event.data?.object||{};
      const subId=typeof invoice.subscription==="string"?invoice.subscription:
        invoice.subscription?.id||invoice.parent?.subscription_details?.subscription||"";
      if(!subId)return res.json({received:true});
      const sub=await recordwatchStripe.subscriptions.retrieve(subId);
      if(sub?.metadata?.product!=="premium_recordwatch")return res.json({received:true});
      await syncVerifiedRecordwatchStripeSubscription(sub);
      return res.json({received:true,product:"premium_recordwatch"});
    }
    if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type))
      return res.json({received:true});
    const session=event.data?.object;
    if(session?.metadata?.product==="premium_recordwatch_lifetime"){
      const verified=await verifiedRecordwatchLifetimeSession(session.id,
        session.metadata.user_id,session.metadata.saved_case_id);
      const entitlement=await upsertRecordwatchLifetimeCase(verified);
      if(entitlement.stripe_checkout_session_id===verified.id && lifetimeCaseEntitled(entitlement,entitlement.saved_case_id)){
        await createRecordwatchLedgerEntryFromSession(verified.metadata.user_id,verified,"lifetime_case");
        await recordAffiliateCommission(verified,"recordwatch_lifetime",verified.metadata.user_id,RECORDWATCH_LIFETIME_CENTS);
      }
      return res.json({received:true,product:"premium_recordwatch_lifetime",case_id:entitlement.saved_case_id});
    }
    if(session?.metadata?.product!=="premium_recordwatch")return res.json({received:true});
    if(!paidRecordwatchCheckout(session,session.metadata.user_id))
      return res.status(400).json({ok:false,error:"RecordWatch payment is not verified."});
    const subId=typeof session.subscription==="string"?session.subscription:session.subscription?.id;
    const sub=await recordwatchStripe.subscriptions.retrieve(subId);
    const plan=verifyRecordwatchSubscription(sub,process.env,session.metadata.user_id);
    if(plan!==session.metadata.plan)
      return res.status(400).json({ok:false,error:"RecordWatch subscription plan mismatch."});
    await syncVerifiedRecordwatchStripeSubscription(sub,session.id);
    await createRecordwatchLedgerEntryFromSession(session.metadata.user_id,session,plan);
    return res.json({received:true,product:"premium_recordwatch"});
  }catch(error){
    console.warn("RecordWatch webhook reconciliation failed",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Could not reconcile Stripe event; delivery will retry."});
  }
});

// The original packet webhook remains independent, preserving paid-hold
// fulfillment for court packets and refusing RecordWatch subscription events.
app.post("/api/stripe/webhook",express.raw({type:"application/json",limit:"256kb"}),async(req,res)=>{
  const secret=process.env.STRIPE_WEBHOOK_SECRET||"";
  if(!stripe||!secret||!packetDatabaseReady())
    return res.status(503).json({ok:false,error:"Verified Stripe webhook persistence unavailable."});
  let event;
  try{
    event=stripe.webhooks.constructEvent(req.body,req.get("stripe-signature"),secret);
  }catch{return res.status(400).json({ok:false,error:"Invalid Stripe signature."});}
  if(["charge.refunded","charge.dispute.created"].includes(event.type)){
    const raw=event.data?.object||{};
    const pi=typeof raw.payment_intent==="string" ? raw.payment_intent : raw.payment_intent?.id;
    try { await voidAffiliateCommission(pi,event.type==="charge.refunded"?"refund":"dispute"); }
    catch { return res.status(503).json({received:false,error:"Affiliate refund reconciliation will retry."}); }
    return res.json({received:true});
  }
  if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type))
    return res.json({received:true});
  const session=event.data?.object;
  const owner=session?.metadata?.userId,caseId=session?.metadata?.saved_case_id;
  if(!validCaseId(owner)||!validCaseId(caseId)||
     !verifiedPacketSession(session,owner,caseId))
    return res.status(400).json({ok:false,error:"Session is not a verified paid court packet."});
  const fee=Number(session.metadata.courtFeeCents||0);
  const method=session.metadata.fulfillmentMode||"";
  if(!Number.isSafeInteger(fee)||fee<0||
     !["lob_check","court_online","no_fee"].includes(method))
    return res.status(400).json({ok:false,error:"Court-fee settlement metadata missing."});
  try{
    await supabaseRest("packet_fulfillment_jobs",{
      method:"POST",query:"?on_conflict=stripe_session_id",
      prefer:"resolution=ignore-duplicates,return=representation",
      body:{user_id:owner,case_id:caseId,stripe_session_id:session.id,
        status:"paid_hold",court_fee_cents:fee,payment_method:method}
    });
    // The court deposit is not RecordPathAI revenue and earns no commission.
    await recordAffiliateCommission(session,"packet_preparation",owner,PACKET_PRICE_CENTS);
    return res.json({received:true,status:"paid_hold"});
  }catch(error){
    console.warn("Stripe webhook store unavailable",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Payment recorded by Stripe, fulfillment queue unavailable. Retry requested."});
  }
});

app.post("/api/packet/private-upload",express.raw({type:"application/pdf",limit:"8mb"}),async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  const caseId=safe(req.get("x-recordpath-case-id"));
  if(!validCaseId(caseId))return res.status(400).json({ok:false,error:"Saved case ID required."});
  if(!packetDatabaseReady())return res.status(503).json({ok:false,error:"Private packet storage has not been configured."});
  const bytes=req.body;
  if(!Buffer.isBuffer(bytes)||bytes.length<500 || bytes.length>8388608 ||
     bytes.subarray(0,8).toString("ascii").indexOf("%PDF-")!==0 ||
     !bytes.subarray(Math.max(0,bytes.length-2048)).toString("latin1").includes("%%EOF"))
    return res.status(400).json({ok:false,error:"A valid PDF under 8 MB is required."});
  try {
    // Validate PDF structure and page count before accepting the signed review
    // copy. Lob checks support up to 6 PDF attachment pages.
    const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parser=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
    const document=await parser.promise;
    const pdfPages=document.numPages;
    if(!Number.isInteger(pdfPages)||pdfPages<1||pdfPages>6) {
      await document.destroy();
      return res.status(400).json({ok:false,error:"Signed court PDF must contain 1 to 6 pages for check attachment."});
    }
    const facts=await getSavedCaseReviewFacts(user.id,caseId);
    const woodCourt=findCourtProfile({state:facts.savedCase.case_state,
      county:facts.savedCase.county,courtType:facts.savedCase.court_type});
    if(woodCourt?.id==="oh-wood-common-pleas") {
      // The clerk's published PDF contains two eligibility-guide pages followed
      // by TWO required filing forms. Only the two forms may enter private review.
      if(pdfPages!==2) {
        await document.destroy();
        return res.status(400).json({ok:false,error:
          "Wood County filing PDF must contain exactly two completed form pages, without eligibility rules."});
      }
      const pageText=[];
      for(let i=1;i<=2;i++){
        const page=await document.getPage(i);
        const content=await page.getTextContent();
        pageText.push(content.items.map(item=>String(item.str||"")).join("")
          .replace(/[^A-Za-z]/g,"").toUpperCase());
      }
      await document.destroy();
      if(!pageText[0].includes("ADDRESSVERIFICATION") ||
         !pageText[1].includes("APPLICATIONTOSEALRECORD")) {
        return res.status(400).json({ok:false,error:
          "Wood County packet must contain address verification first and the signed sealing application second."});
      }
    } else await document.destroy();
    const sha=createHash("sha256").update(bytes).digest("hex");
    const objectPath="private/packets/"+caseId+"/"+sha+".pdf";
    const config=supabaseRestConfig();
    const response=await fetch(config.url+"/storage/v1/object/packet-documents/"+objectPath,{
      method:"POST",headers:{
        apikey:config.key,Authorization:"Bearer "+config.key,
        "Content-Type":"application/pdf","x-upsert":"true"
      },body:bytes,signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw new Error("Private PDF storage unavailable.");
    const snapshot=caseReviewFingerprint(facts.savedCase,facts.charges);
    await supabaseRest("packet_drafts",{
      method:"POST",query:"?on_conflict=case_id",
      prefer:"resolution=merge-duplicates,return=representation",
      body:{case_id:caseId,user_id:user.id,case_snapshot_sha256:snapshot,
        signed_pdf_sha256:sha,signed_pdf_private_path:objectPath,pdf_pages:pdfPages}
    });
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,storedFor:"private_review",case_id:caseId,
      signed_pdf_sha256:sha,case_snapshot_sha256:snapshot,
      note:"Review copy received. This is not a filing, payment, or mailing."});
  }catch(error){
    console.warn("Private packet upload failed",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Unable to save signed review PDF. No payment or mail was created."});
  }
});

app.use(express.json());

function publicSupabaseConfig() {
  // All three supported names must agree with supabaseRestConfig, otherwise
  // RecordWatch can have a connected backend but broken public sign-in.
  return {
    url: process.env.RECORDPATH_SUPABASE_URL || process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.RECORDPATH_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || ""
  };
}

// Public pricing information only; this endpoint accepts no names, signatures or case numbers.
app.get("/api/packet/quote", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const quote = quotePacketPricing({
    state: req.query.state,
    county: req.query.county,
    courtType: req.query.courtType,
    formType: req.query.formType
  });
  return res.json({ ok: true, quote });
});


// Case-owner only. Connects the real, server-verified packet/Stripe/Lob
// workflow to RecordWatch without disclosing applicant or charge details.
// GET only; NEVER issues a Stripe charge, check or mailing.
app.get("/api/packet/filing-status",async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  const caseId=safe(req.query?.case_id);
  if(!validCaseId(caseId))
    return res.status(400).json({ok:false,error:"Select a saved case to view filing progress."});
  if(!packetDatabaseReady())
    return res.status(503).json({ok:false,error:"Private filing status is temporarily unavailable."});
  try{
    await getSavedCaseReviewFacts(user.id,caseId);
    const identity="case_id=eq."+encodeURIComponent(caseId)+
      "&user_id=eq."+encodeURIComponent(user.id);
    const [drafts,reviews,jobs]=await Promise.all([
      supabaseRest("packet_drafts",{
        query:"?"+identity+"&select=signed_pdf_sha256,signed_pdf_private_path&limit=1"
      }),
      supabaseRest("packet_releases",{
        query:"?"+identity+"&select=status,signed_pdf_sha256,signed_pdf_private_path&limit=1"
      }),
      supabaseRest("packet_fulfillment_jobs",{
        query:"?"+identity+
        "&select=status,created_at,updated_at,court_fee_cents,payment_method,lob_check_id,mailed_at"+
        "&order=created_at.desc&limit=1"
      })
    ]);
    const latest=(rows)=>Array.isArray(rows)?rows[0]||null:null;
    const timeline=projectPacketFulfillment({
      draft:latest(drafts),review:latest(reviews),job:latest(jobs)
    });
    res.setHeader("Cache-Control","no-store, private");
    res.setHeader("X-Content-Type-Options","nosniff");
    return res.json({ok:true,case_id:caseId,source:"verified_private_records",
      ...timeline,note:"Lob mail delivery is not proof of court filing or sealing approval."});
  }catch(error){
    console.warn("Private packet filing status unavailable",error?.name||"unknown");
    return res.status(503).json({ok:false,
      error:"Filing status cannot be verified. No charge or mailing was created by this request."});
  }
});

app.get("/api/packet/checkout-readiness",async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  const caseId=safe(req.query.case_id);
  if(!validCaseId(caseId))return res.status(400).json({ok:false,error:"Saved case ID required."});
  const result=await packetReleaseStatus(user.id,caseId);
  res.setHeader("Cache-Control","no-store, private");
  return res.status(result.ready?200:409).json({
    ok:result.ready,ready:result.ready,
    missing:result.missing,quote:result.quote,
    profileId:result.profileId||null
  });
});
// This endpoint never returns applicant data and never creates a release.
// Operations key is server-only; it must not be placed in the browser.
app.get("/api/operator/packet/fingerprint",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  const userId=safe(req.query.user_id),caseId=safe(req.query.case_id);
  try{
    const facts=await getSavedCaseReviewFacts(userId,caseId);
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,userId,caseId,
      caseFingerprint:caseReviewFingerprint(facts.savedCase,facts.charges),
      chargeCount:facts.charges.length});
  }catch(error){return res.status(409).json({ok:false,error:"Saved case cannot be reviewed."});}
});
app.post("/api/operator/packet/release",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  const userId=safe(req.body?.user_id),caseId=safe(req.body?.case_id);
  if(!validCaseId(userId)||!validCaseId(caseId))
    return res.status(400).json({ok:false,error:"Valid saved case and owner identifiers required."});
  try {
    const facts=await getSavedCaseReviewFacts(userId,caseId);
    const source=req.body?.review || {};
    const allowed=[
      "status","form_type","case_snapshot_sha256","signed_pdf_sha256",
      "signed_pdf_private_path","reviewer_id","reviewed_at",
      "identity_verified","official_docket_verified","all_charges_verified",
      "final_discharge_verified","statutory_exclusions_reviewed",
      "filing_instructions_verified","exact_court_form_verified",
      "applicant_signature_verified","filing_authorization_verified",
      "accepted_fee_waiver","fee_waiver_evidence","approved_court_fee_cents",
      "fee_payment_method","verified_check_payee","verified_filing_address",
      "reviewer_evidence_links"
    ];
    const review={user_id:userId,case_id:caseId};
    for(const key of allowed)if(Object.prototype.hasOwnProperty.call(source,key))review[key]=source[key];
    if(review.status!=="approved"||
      !Array.isArray(review.reviewer_evidence_links)||!review.reviewer_evidence_links.length)
      return res.status(400).json({ok:false,error:"Approved review with evidence references required."});
    const drafts=await supabaseRest("packet_drafts",{
      query:"?case_id=eq."+encodeURIComponent(caseId)+"&user_id=eq."+encodeURIComponent(userId)+"&limit=1"
    });
    const draft=Array.isArray(drafts)?drafts[0]:null;
    const snapshot=caseReviewFingerprint(facts.savedCase,facts.charges);
    if(!draft || draft.case_snapshot_sha256!==snapshot ||
       draft.signed_pdf_sha256!==review.signed_pdf_sha256 ||
       draft.signed_pdf_private_path!==review.signed_pdf_private_path)
      return res.status(409).json({ok:false,error:"Approved signature must match the actual private applicant PDF and unchanged case snapshot."});
    const result=evaluatePacketRelease({
      userId,caseId,...facts,review,
      runtime:{stripeLiveEnabled:true,lobLiveEnabled:true,lobVerifiedBank:true,
        onlineCourtPaymentVerified:true}
    });
    if(result.missing.length)return res.status(409).json({ok:false,missing:result.missing});
    await supabaseRest("packet_releases",{
      method:"POST",query:"?on_conflict=case_id",body:review,
      prefer:"resolution=merge-duplicates,return=representation"
    });
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,status:"review_recorded",
      readyForPayment:false,
      note:"A recorded review does not enable live checkout until every runtime credential and court fulfillment check passes."});
  }catch(error){
    console.warn("Packet release update failed",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Unable to store private reviewer release."});
  }
});


// Stripe sandbox exercise for authorized operators only. It is intentionally
// isolated from customer cases, releases and Lob. It never sends real mail.
// Lob TEST environment only: synthetic addresses and a public blank form.
// Does not print, mail, issue live checks, or access applicant data.
app.post("/api/operator/lob-test-check",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  const key=process.env.LOB_TEST_API_KEY||"";
  const bank=process.env.LOB_TEST_BANK_ACCOUNT_ID||"";
  if(!key.startsWith("test_")||!/^bank_[A-Za-z0-9]+$/.test(bank))
    return res.status(503).json({ok:false,error:"Lob test API key and test bank are required."});
  const payload={
    bank_account:bank,amount:100,
    to:{name:"Test Court Recipient",address_line1:"One Courthouse Square",
      address_city:"Bowling Green",address_state:"OH",address_zip:"43402"},
    from:{name:"RecordPathAI TEST",address_line1:"210 King St",
      address_city:"San Francisco",address_state:"CA",address_zip:"94107"},
    message:"TEST ONLY - not a real court filing deposit",
    memo:"TEST ONLY",mail_type:"usps_first_class",use_type:"operational",
    attachment:"https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF"
  };
  try{
    const response=await fetch("https://api.lob.com/v1/checks",{
      method:"POST",headers:{
        Authorization:"Basic "+Buffer.from(key+":").toString("base64"),
        "Content-Type":"application/json",
        "Idempotency-Key":"recordpathai-sandbox-"+Date.now()
      },body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) {
      return res.status(502).json({ok:false,lobStatus:response.status,
        code:result?.error?.code||null,
        error:"Lob test check API denied the request. Verify checks entitlement and test funding setup with Lob support."});
    }
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,environment:"test",testCheckId:result.id||null,
      renderStatus:result.status||"processing",proofPdfUrl:result.url||null,
      note:"Lob test-mode creates no mailed check, court payment or filing."});
  }catch(error){
    console.warn("Lob test check transport failed",error?.name||"unknown");
    return res.status(502).json({ok:false,error:"Lob test check transport unavailable."});
  }
});

// Authorized test-only proof polling. Read only; never uses live credentials,
// applicant records, customer charges, or Lob creation endpoints.
app.get("/api/operator/lob-test-check-status",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  const key=process.env.LOB_TEST_API_KEY||"";
  if(!key.startsWith("test_"))
    return res.status(503).json({ok:false,error:"Lob sandbox key not configured."});
  const id=safe(req.query?.check_id);
  if(!/^chk_[A-Za-z0-9]+$/.test(id))
    return res.status(400).json({ok:false,error:"Valid test check ID required."});
  try {
    const response=await fetch("https://api.lob.com/v1/checks/"+id,{
      headers:{Authorization:"Basic "+Buffer.from(key+":").toString("base64")},
      signal:AbortSignal.timeout(20000)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)return res.status(502).json({ok:false,
      lobStatus:response.status,
      code:result?.error?.code||null,
      error:"Lob sandbox could not retrieve this check proof."});
    if(result.id!==id)throw new Error("Mismatch in retrieved check ID");
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,environment:"test",testCheckId:result.id,
      renderStatus:result.status||"processing",
      proofPdfUrl:result.url||null,
      note:"Sandbox proof only; no check is mailed, cashed or filed."});
  }catch(error){
    console.warn("Lob sandbox proof retrieval failed",error?.name||"unknown");
    return res.status(502).json({ok:false,
      error:"Lob sandbox proof retrieval unavailable."});
  }
});

app.post("/api/operator/stripe-test-checkout",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  const key=process.env.STRIPE_TEST_SECRET_KEY||"";
  if(!key.startsWith("sk_test_"))
    return res.status(503).json({ok:false,error:"RecordPathAI Stripe test key not configured."});
  try {
    const testStripe=new Stripe(key);
    const base=getBaseUrl(req);
    const session=await testStripe.checkout.sessions.create({
      mode:"payment",
      payment_method_types:["card"],
      ui_mode:"hosted",
      success_url:base+"/stripe-test-success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:base+"/stripe-test-success.html?cancelled=1",
      line_items:[
        {quantity:1,price_data:{currency:"usd",unit_amount:5000,
          product_data:{name:"TEST ONLY - RecordPathAI preparation"}}},
        {quantity:1,price_data:{currency:"usd",unit_amount:10000,
          product_data:{name:"TEST ONLY - simulated court deposit"}}}
      ],
      metadata:{productType:"packet-sandbox-simulation",sandboxOnly:"true"}
    });
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,livemode:false,totalCents:15000,
      note:"Stripe sandbox only. No real customer, court filing, check or mailing.",
      checkoutUrl:session.url});
  }catch(error){
    console.warn("Stripe sandbox setup error",error?.name||"unknown");
    return res.status(502).json({ok:false,error:"Unable to create Stripe test checkout session."});
  }
});

// Operators may inspect fulfillment status. No applicant or docket data returns.
app.get("/api/operator/packet/fulfillment-status",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  const sessionId=safe(req.query.session_id);
  if(!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId))
    return res.status(400).json({ok:false,error:"Valid Stripe session ID required."});
  try{
    const rows=await supabaseRest("packet_fulfillment_jobs",{
      query:"?stripe_session_id=eq."+encodeURIComponent(sessionId)+"&limit=1"
    });
    const job=Array.isArray(rows)?rows[0]:null;
    if(!job)return res.status(404).json({ok:false,error:"No payment fulfillment record found."});
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,status:job.status,courtFeeCents:job.court_fee_cents,
      method:job.payment_method,lobCheckId:job.lob_check_id||null});
  }catch{return res.status(503).json({ok:false,error:"Private fulfillment queue unavailable."});}
});

// Explicit operator action only. Webhooks NEVER send mail. Stripe paid session,
// unchanged case, approved private PDF and verified Lob bank are required.

// Read Lob's actual check status without inventing postal tracking or court
// acceptance. This is an operator check, not an automatic mail send.
app.get("/api/operator/packet/lob-check-status",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  const sessionId=safe(req.query.stripe_session_id);
  if(!/^cs_live_[A-Za-z0-9]+$/.test(sessionId))
    return res.status(400).json({ok:false,error:"Live paid Stripe session required."});
  if(!(process.env.LOB_LIVE_API_KEY||"").startsWith("live_"))
    return res.status(503).json({ok:false,error:"Lob live account is not configured."});
  try{
    const rows=await supabaseRest("packet_fulfillment_jobs",{
      query:"?stripe_session_id=eq."+encodeURIComponent(sessionId)+"&limit=1"
    });
    const job=Array.isArray(rows)?rows[0]:null;
    if(!job||!/^chk_[A-Za-z0-9]+$/.test(job.lob_check_id||""))
      return res.status(404).json({ok:false,error:"No Lob check has been submitted for this paid order."});
    const remote=await fetch("https://api.lob.com/v1/checks/"+job.lob_check_id,{
      headers:{Authorization:"Basic "+Buffer.from(process.env.LOB_LIVE_API_KEY+":").toString("base64")},
      signal:AbortSignal.timeout(15000)
    });
    if(!remote.ok)return res.status(502).json({ok:false,error:"Cannot confirm current Lob check status."});
    const result=await remote.json();
    const events=Array.isArray(result.tracking_events)?result.tracking_events:[];
    const eventNames=events.map(e=>String(e?.type||e?.event_type||e?.name||"").toLowerCase());
    const delivered=eventNames.some(x=>x.includes("delivered"));
    const mailed=eventNames.some(x=>x.includes("mailed")||x.includes("in_transit"));
    const failed=result.status==="failed" || eventNames.some(x=>x.includes("failed")||x.includes("returned_to_sender"));
    let status=failed?"failed":delivered?"delivered":mailed?"mailed":"processing";
    if(delivered||failed||mailed){
      const patch={};
      if(delivered)patch.status="delivered";
      if(failed)patch.status="failed";
      if(mailed&&!job.mailed_at)patch.mailed_at=new Date().toISOString();
      if(Object.keys(patch).length)await supabaseRest("packet_fulfillment_jobs",{
        method:"PATCH",query:"?stripe_session_id=eq."+encodeURIComponent(sessionId),body:patch
      });
    }
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,lobCheckId:job.lob_check_id,renderStatus:result.status||null,
      postalStatus:status,hasPostalTrackingNumber:Boolean(result.tracking_number),
      trackingNumber:result.tracking_number||null,
      note:"Delivery is not proof of court acceptance or granted record relief."});
  }catch(error){
    console.warn("Lob tracking verification unavailable",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Unable to verify the Lob check status."});
  }
});

app.post("/api/operator/packet/dispatch-lob",async(req,res)=>{
  if(!requireOperationsKey(req,res))return;
  if(!requireLobLiveDispatch(process.env))
    return res.status(503).json({ok:false,error:"Live Lob check dispatch not enabled or bank not configured."});
  const sessionId=safe(req.body?.stripe_session_id);
  if(!/^cs_live_[A-Za-z0-9]+$/.test(sessionId))
    return res.status(400).json({ok:false,error:"Verified live Stripe payment ID required."});
  if(!await lobBankVerified())
    return res.status(503).json({ok:false,error:"Lob bank is not verified or check API entitlement is unavailable."});
  try {
    const rows=await supabaseRest("packet_fulfillment_jobs",{
      query:"?stripe_session_id=eq."+encodeURIComponent(sessionId)+"&limit=1"
    });
    const job=Array.isArray(rows)?rows[0]:null;
    if(!job)return res.status(404).json({ok:false,error:"Paid order not in private fulfillment queue."});
    if(job.status==="submitted_to_lob"||job.lob_check_id)
      return res.json({ok:true,status:job.status,lobCheckId:job.lob_check_id,duplicate:true});
    if(job.status!=="paid_hold"||job.payment_method!=="lob_check"||
       !Number.isSafeInteger(job.court_fee_cents)||job.court_fee_cents<=0)
      return res.status(409).json({ok:false,error:"This order is not approved for a physical check."});
    const release=await packetReleaseStatus(job.user_id,job.case_id);
    if(!release.ready)return res.status(409).json({ok:false,missing:release.missing,
      error:"The saved case or live fulfillment requirements are no longer approved."});
    if(release.quote?.courtFeeCents!==job.court_fee_cents)
      return res.status(409).json({ok:false,error:"Paid court amount does not match the approved review."});
    const reviews=await supabaseRest("packet_releases",{
      query:"?case_id=eq."+encodeURIComponent(job.case_id)+"&user_id=eq."+encodeURIComponent(job.user_id)+"&limit=1"
    });
    const drafts=await supabaseRest("packet_drafts",{
      query:"?case_id=eq."+encodeURIComponent(job.case_id)+"&user_id=eq."+encodeURIComponent(job.user_id)+"&limit=1"
    });
    const review=Array.isArray(reviews)?reviews[0]:null;
    const draft=Array.isArray(drafts)?drafts[0]:null;
    if(!review||!draft || review.signed_pdf_sha256!==draft.signed_pdf_sha256 ||
       review.signed_pdf_private_path!==draft.signed_pdf_private_path)
      return res.status(409).json({ok:false,error:"Approved signed PDF differs from the private stored version."});
    const facts=await getSavedCaseReviewFacts(job.user_id,job.case_id);
    const config=supabaseRestConfig();
    const signed=await fetch(config.url+"/storage/v1/object/sign/packet-documents/"+draft.signed_pdf_private_path,{
      method:"POST",headers:{
        apikey:config.key,Authorization:"Bearer "+config.key,
        "Content-Type":"application/json"
      },body:JSON.stringify({expiresIn:259200}),signal:AbortSignal.timeout(15000)
    });
    if(!signed.ok)throw new Error("Private signed attachment URL unavailable");
    const signedResponse=await signed.json();
    const filePath=signedResponse.signedURL||signedResponse.signedUrl||"";
    const signedUrl=filePath.startsWith("https://")?filePath:config.url+
      (filePath.startsWith("/storage/v1")?filePath:"/storage/v1"+filePath);
    if(new URL(signedUrl).origin!==new URL(config.url).origin)
      throw new Error("Invalid private PDF origin");
    const from=JSON.parse(process.env.LOB_FROM_ADDRESS_JSON||"null");
    const checked=buildCourtCheckRequest({
      profileInput:{state:facts.savedCase.case_state,county:facts.savedCase.county,
        courtType:facts.savedCase.court_type},
      review,from,bankAccount:process.env.LOB_VERIFIED_BANK_ID,
      attachmentUrl:signedUrl,attachmentPages:draft.pdf_pages,
      caseReference:facts.savedCase.case_number,
      approvedCourtFeeCents:job.court_fee_cents
    });
    // A paid_hold row is not enough: reread the charge directly from Stripe
    // after reviewer, fee and PDF validation but before any bank-funded check.
    const liveSession=await stripe.checkout.sessions.retrieve(sessionId,{
      expand:["payment_intent.latest_charge"]
    });
    if(!verifyLivePacketPaymentForLob(liveSession,job).ok)
      return res.status(409).json({ok:false,error:
        "The live Stripe payment is not safely confirmed (or was refunded/disputed). No check was issued."});
    // Database claim occurs immediately before the irreversible provider call.
    // A network failure intentionally leaves ready_for_dispatch/attempted_at
    // set, blocking resends until the operator reconciles Lob.
    const claimed=await supabaseRest("rpc/reserve_packet_lob_dispatch",{
      method:"POST",body:{p_stripe_session_id:sessionId,p_case_id:job.case_id}
    });
    if(!Array.isArray(claimed)||claimed.length!==1)
      return res.status(409).json({ok:false,error:
        "Dispatch is already claimed or another order exists for this case. Check Lob before retrying."});
    const lob=await fetch("https://api.lob.com/v1/checks",{
      method:"POST",
      headers:{
        Authorization:"Basic "+Buffer.from(process.env.LOB_LIVE_API_KEY+":").toString("base64"),
        "Content-Type":"application/json",
        "Idempotency-Key":"recordpathai-"+sessionId
      },body:JSON.stringify(checked),signal:AbortSignal.timeout(30000)
    });
    if(!lob.ok) {
      console.warn("Lob check creation rejected",lob.status);
      return res.status(502).json({ok:false,error:"Lob rejected this check. No retry until account authorization and existing Lob orders are reviewed."});
    }
    const result=await lob.json();
    if(!/^chk_[A-Za-z0-9]+$/.test(result.id||""))
      throw new Error("Lob did not confirm a check ID");
    const saved=await supabaseRest("packet_fulfillment_jobs",{
      method:"PATCH",query:"?stripe_session_id=eq."+encodeURIComponent(sessionId)+"&status=eq.ready_for_dispatch",
      body:{status:"submitted_to_lob",lob_check_id:result.id}
    });
    if(!Array.isArray(saved)||saved.length!==1||saved[0].lob_check_id!==result.id)
      throw new Error("Lob order accepted but durable fulfillment confirmation failed");
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,status:"submitted_to_lob",lobCheckId:result.id,
      note:"Accepted by Lob for processing; this does not prove USPS mailing or court filing."});
  } catch(error) {
    console.warn("Lob dispatch prevented",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Lob dispatch could not be verified. Do not resubmit until the Lob dashboard is checked for duplicates."});
  }
});

app.get("/api/config/supabase", (req, res) => {
  const config = publicSupabaseConfig();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    url: config.url,
    anonKey: config.anonKey,
    configured: Boolean(config.url && config.anonKey)
  });
});

// Check project hostname reachability, not just the presence of a URL and key.
// A paused/deleted/misconfigured Supabase project can return NXDOMAIN while
// both public environment variables are still populated.
let authDnsCache = { hostname: "", expires: 0, resolves: false };
async function authHostnameResolves(rawUrl) {
  let hostname;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    hostname = url.hostname;
  } catch {
    return false;
  }
  const now = Date.now();
  if (authDnsCache.hostname === hostname && authDnsCache.expires > now) return authDnsCache.resolves;
  let timer;
  const resolves = await Promise.race([
    dns.lookup(hostname).then(() => true, () => false),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); })
  ]);
  clearTimeout(timer);
  authDnsCache = { hostname, expires: now + 30000, resolves };
  return resolves;
}

// Do not return keys, DNS addresses, or applicant data in readiness checks.
app.get("/api/auth/health", async (req, res) => {
  const config = publicSupabaseConfig();
  const configured = /^https:\/\//.test(config.url) && Boolean(config.anonKey);
  const reachable = configured && await authHostnameResolves(config.url);
  const ready = Boolean(configured && reachable);
  res.setHeader("Cache-Control", "no-store");
  return res.status(ready ? 200 : 503).json({
    ready,
    reason: ready ? "configured" : configured ? "project_hostname_unreachable" : "config_missing",
    emailPassword: ready ? "configured_in_app" : "unavailable",
    googleOAuth: ready ? "provider_must_be_verified_in_supabase" : "unavailable",
    message: ready
      ? "RecordPathAI authentication hostname resolves. Provider authentication must be tested separately."
      : configured
        ? "The RecordPathAI authentication project is unreachable. The Supabase project may be paused or its hostname may no longer exist. Please contact RecordPathAI support; your saved browser intake has not been deleted."
        : "RecordPathAI sign-in is temporarily unavailable because the public authentication configuration is missing."
  });
});


const recordwatchMemory = {
  subscriptions: [],
  events: [],
  notifications: [],
  preferences: [],
  courtStatuses: new Map(),
  jobRuns: []
};

const ledgerMemory = {
  entries: []
};

const RECORDWATCH_FROM_EMAIL = "matt@recordpathai.com";
const RECORDWATCH_PLANS = ["free", "premium"];
const RECORDWATCH_PROVIDER_MISSING = "skipped_provider_missing";
const RECORDWATCH_REMINDERS = [
  { days: 180, flag: "reminder_180_sent", type: "eligibility_180_day" },
  { days: 90, flag: "reminder_90_sent", type: "eligibility_90_day" },
  { days: 30, flag: "reminder_30_sent", type: "eligibility_30_day" },
  { days: 7, flag: "reminder_7_sent", type: "eligibility_7_day" },
  { days: 0, flag: "reminder_day_sent", type: "eligibility_reached" }
];
const PACKET_REMINDER_TYPES = {
  eligibility_record_details: { 3: "packet_incomplete_3_day", 7: "packet_incomplete_7_day", 14: "packet_incomplete_14_day" },
  record_details_unpaid: { 3: "packet_incomplete_3_day", 7: "packet_incomplete_7_day", 14: "packet_incomplete_14_day" },
  paid_not_generated: { 1: "packet_incomplete_3_day", 3: "packet_incomplete_3_day", 7: "packet_incomplete_7_day" }
};
const COURT_STATUS_VALUES = [
  "RECEIVED",
  "UNDER_REVIEW",
  "CORRECTION_REQUESTED",
  "ACCEPTED",
  "FILED",
  "HEARING_SCHEDULED",
  "GRANTED",
  "DENIED",
  "CLOSED"
];
const COURT_STATUS_NOTIFICATION_TYPES = {
  RECEIVED: "court_status_received",
  UNDER_REVIEW: "court_status_under_review",
  CORRECTION_REQUESTED: "court_status_correction_requested",
  ACCEPTED: "court_status_accepted",
  FILED: "court_status_filed",
  HEARING_SCHEDULED: "court_status_hearing_scheduled",
  GRANTED: "court_status_granted",
  DENIED: "court_status_denied",
  CLOSED: "court_status_closed"
};
const RECORDWATCH_NOTIFICATION_TYPES = [
  "eligibility_180_day",
  "eligibility_90_day",
  "eligibility_30_day",
  "eligibility_7_day",
  "eligibility_reached",
  "packet_incomplete_3_day",
  "packet_incomplete_7_day",
  "packet_incomplete_14_day",
  ...Object.values(COURT_STATUS_NOTIFICATION_TYPES)
];

function recordwatchId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function recordwatchDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function daysBetweenDates(from, to) {
  const start = new Date(`${recordwatchDateOnly(from || new Date())}T00:00:00.000Z`);
  const end = new Date(`${recordwatchDateOnly(to)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end - start) / 86400000);
}

function normalizeRecordwatchStatus(status) {
  return String(status || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizeRecordwatchPlan(payload = {}) {
  const plan = String(payload.plan_type || payload.planType || "free").trim().toLowerCase();
  return RECORDWATCH_PLANS.includes(plan) ? plan : "free";
}

function normalizePreferences(payload = {}) {
  return {
    eligibility_email: payload.eligibility_email !== false && payload.eligibilityEmail !== false,
    eligibility_sms: Boolean(payload.eligibility_sms || payload.eligibilitySms),
    court_status_updates: payload.court_status_updates !== false && payload.courtStatusUpdates !== false,
    packet_reminders: payload.packet_reminders !== false && payload.packetReminders !== false,
    marketing_emails: Boolean(payload.marketing_emails || payload.marketingEmails)
  };
}

function getMemoryPreferences(userId) {
  return recordwatchMemory.preferences.find((item) => item.user_id === userId) || {
    id: recordwatchId("rwp"),
    user_id: userId,
    eligibility_email: true,
    eligibility_sms: false,
    court_status_updates: true,
    packet_reminders: true,
    marketing_emails: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function upsertMemoryPreferences(payload = {}) {
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const existing = recordwatchMemory.preferences.find((item) => item.user_id === userId);
  const row = Object.assign(existing || { id: recordwatchId("rwp"), user_id: userId, created_at: new Date().toISOString() }, normalizePreferences(payload), { updated_at: new Date().toISOString() });
  if (!existing) recordwatchMemory.preferences.push(row);
  return row;
}

function shouldSendChannel({ channel, type, subscription, preferences, adminOverride = false }) {
  // Neither email nor SMS may ever be delivered for a free case, including
  // reminders, court updates, or requests carrying an admin_override flag.
  // premium_active is resolved from Stripe-backed server entitlements.
  if ((channel === "email" || channel === "sms") && subscription.premium_active !== true) return false;
  if (channel === "in_app") return true;
  if (channel === "email") {
    if (type.startsWith("eligibility_")) return preferences.eligibility_email !== false;
    if (type.startsWith("packet_incomplete")) return preferences.packet_reminders !== false;
    if (type.startsWith("court_status_")) return adminOverride || (subscription.premium_active && preferences.court_status_updates !== false);
    return true;
  }
  if (channel === "sms") {
    if (!subscription.premium_active || preferences.eligibility_sms !== true) return false;
    if (type.startsWith("court_status_")) return adminOverride || preferences.court_status_updates !== false;
    return type.startsWith("eligibility_") || type.startsWith("packet_incomplete");
  }
  return false;
}

function recordwatchSubject(type, context = {}) {
  if (type === "eligibility_reached") return "You May Now Be Eligible";
  if (type.startsWith("packet_incomplete")) return "Finish Your RecordPathAI Packet";
  if (type.startsWith("court_status_")) return "RecordPathAI Court Status Update";
  return "RecordPathAI Eligibility Reminder";
}

function recordwatchMessage(type, context = {}) {
  if (type === "eligibility_reached") return "Based on the information provided, your waiting period appears complete. Log in to RecordPathAI to verify eligibility and generate your packet.";
  if (type.startsWith("packet_incomplete")) return "Your eligibility review is complete. Finish your record details to generate your court packet.";
  if (type.startsWith("court_status_")) {
    const source = context.source === "verified_court" || context.source === "admin" ? "" : " This is a RecordWatch manual or system-test update, not a live court integration.";
    const hearing = context.hearing_date ? ` Hearing date: ${context.hearing_date}.` : "";
    return `Your court filing status changed to ${context.status || "updated"}.${hearing} Log in to RecordPathAI to view details.${source}`;
  }
  if (type === "eligibility_180_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 180 days.";
  if (type === "eligibility_90_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 90 days.";
  if (type === "eligibility_30_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 30 days.";
  if (type === "eligibility_7_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 7 days.";
  return "RecordWatch has an update about your eligibility timeline.";
}

function recordwatchSmsMessage(type) {
  if (type === "eligibility_reached") return "You may now be eligible to clear your record. Log in to RecordPathAI to continue.";
  if (type.startsWith("packet_incomplete")) return "Your court packet needs attention. Log in to RecordPathAI to continue.";
  if (type.startsWith("court_status_")) return "Your RecordPathAI court status changed. Log in to view details.";
  return "RecordPathAI eligibility reminder: log in to review your next step.";
}

function brandedEmailHtml({ subject, message, actionUrl }) {
  const safeSubject = String(subject || "RecordPathAI Notification").replace(/[<>]/g, "");
  const safeMessage = String(message || "").replace(/[<>]/g, "");
  const href = String(actionUrl || process.env.PUBLIC_APP_URL || "https://recordpathai.com/dashboard.html").replace(/"/g, "%22");
  return `<!doctype html><html><body style="margin:0;background:#eef4ff;font-family:Arial,sans-serif;color:#17345f;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;border:1px solid #dbe7fb;box-shadow:0 16px 44px rgba(32,63,112,.12);overflow:hidden;"><tr><td style="padding:28px 32px;background:linear-gradient(135deg,#143d8f,#6da7ff);color:#fff;"><div style="font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">RecordPathAI</div><h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${safeSubject}</h1></td></tr><tr><td style="padding:32px;"><p style="font-size:17px;line-height:1.7;margin:0 0 24px;">${safeMessage}</p><a href="${href}" style="display:inline-block;background:#143d8f;color:#fff;text-decoration:none;border-radius:999px;padding:14px 22px;font-weight:700;">Open RecordPathAI</a><p style="font-size:12px;color:#6a7894;line-height:1.6;margin:28px 0 0;">RecordWatch reminders are based on the information you provide. RecordPathAI is not a law firm and does not guarantee eligibility or court approval.</p></td></tr></table></td></tr></table></body></html>`;
}

async function sendRecordwatchEmail(to,subject,message){
  if(!providerReadiness(process.env).email_ready)
    return {status:RECORDWATCH_PROVIDER_MISSING};
  if(!validAlertEmail(to))return {status:"skipped"};
  // Legacy handlers use neutral content and the same approved provider adapter.
  const text=neutralAlertContent("legacy","email");
  const receipt=await sendPremiumEmail({to,subject:text.subject,message:text.message});
  return {status:"sent",detail:receipt.id};
}
async function sendRecordwatchSms(to,message){
  if(!providerReadiness(process.env).sms_ready)
    return {status:RECORDWATCH_PROVIDER_MISSING};
  if(!validSmsPhone(to))return {status:"skipped"};
  const text=neutralAlertContent("legacy","sms");
  const receipt=await sendPremiumSms({to,message:text.message});
  return {status:"sent",detail:receipt.id};
}

function supabaseRestConfig() {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseRest(table, { method = "GET", query = "", body, prefer = "return=representation" } = {}) {
  const config = supabaseRestConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: prefer
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error(`Supabase ${table} ${method} failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return [];
  return response.json();
}


function requireOperationsKey(req,res) {
  const secret=process.env.RECORDPATH_OPERATIONS_KEY || "";
  const supplied=req.get("x-recordpath-operations-key") || "";
  if(!secret || secret.length<32) {
    res.status(503).json({ok:false,error:"Operations authorization has not been configured."});
    return false;
  }
  const a=Buffer.from(supplied),b=Buffer.from(secret);
  if(a.length!==b.length || !timingSafeEqual(a,b)) {
    res.status(403).json({ok:false,error:"Operations access denied."});
    return false;
  }
  return true;
}
function packetDatabaseReady(){
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.SUPABASE_URL||process.env.PUBLIC_SUPABASE_URL));
}
async function getSavedCaseReviewFacts(userId,caseId) {
  if(!packetDatabaseReady())throw new Error("Private case review database not configured");
  if(!validCaseId(userId)||!validCaseId(caseId))throw new Error("Invalid case identifier");
  const rows=await supabaseRest("saved_cases",{
    query:"?id=eq."+encodeURIComponent(caseId)+"&user_id=eq."+encodeURIComponent(userId)+
      "&deleted_at=is.null&limit=1"
  });
  const savedCase=Array.isArray(rows)?rows[0]:null;
  if(!savedCase)throw new Error("Saved case not found for authenticated owner");
  const charges=await supabaseRest("case_charges",{
    query:"?case_id=eq."+encodeURIComponent(caseId)+"&user_id=eq."+encodeURIComponent(userId)
  });
  return {savedCase,charges:Array.isArray(charges)?charges:[]};
}
async function lobBankVerified() {
  const key=process.env.LOB_LIVE_API_KEY||"";
  const bank=process.env.LOB_VERIFIED_BANK_ID||"";
  if(process.env.LOB_LIVE_CHECKS_ENABLED!=="true" ||
     !key.startsWith("live_") || !/^bank_[a-zA-Z0-9]+$/.test(bank))return false;
  try {
    const response=await fetch("https://api.lob.com/v1/bank_accounts/"+bank,{
      headers:{Authorization:"Basic "+Buffer.from(key+":").toString("base64")},
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)return false;
    const result=await response.json();
    return result.id===bank && result.verified===true;
  } catch {return false;}
}
async function packetReleaseStatus(userId,caseId) {
  if(!packetDatabaseReady())return {
    ready:false,missing:["Private approval storage is not configured."],
    quote:null
  };
  try {
    const facts=await getSavedCaseReviewFacts(userId,caseId);
    const rows=await supabaseRest("packet_releases",{
      query:"?case_id=eq."+encodeURIComponent(caseId)+"&user_id=eq."+encodeURIComponent(userId)+"&limit=1"
    });
    const review=Array.isArray(rows)?rows[0]:null;
    const runtime={
      stripeLiveEnabled:process.env.RECORDPATH_LIVE_PACKET_CHECKOUT==="true" &&
        (process.env.STRIPE_SECRET_KEY||"").startsWith("sk_live_"),
      lobLiveEnabled:process.env.LOB_LIVE_CHECKS_ENABLED==="true" &&
        process.env.LOB_CHECK_ATTACHMENTS_APPROVED==="true",
      lobVerifiedBank:await lobBankVerified(),
      onlineCourtPaymentVerified:false
    };
    return evaluatePacketRelease({userId,caseId,...facts,review,runtime});
  } catch (error) {
    console.warn("Private packet release preflight unavailable",error?.name||"unknown");
    return {ready:false,missing:["Case approval or private review record is unavailable."],quote:null};
  }
}

function supabaseSafeCaseId(caseId) {
  return isUuid(caseId) ? caseId : null;
}

async function persistRecordwatchRow(table, row, conflictColumns) {
  try {
    const payload = Object.assign({}, row);
    if (!isUuid(payload.id)) delete payload.id;
    if ("case_id" in payload) payload.case_id = supabaseSafeCaseId(payload.case_id);
    const query = conflictColumns ? `?on_conflict=${encodeURIComponent(conflictColumns)}` : "";
    const data = await supabaseRest(table, { method: "POST", query, body: payload, prefer: "resolution=merge-duplicates,return=representation" });
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.warn(`RecordWatch Supabase persistence fallback for ${table}:`, error.message);
    return null;
  }
}

async function fetchRecordwatchRows(table, userId) {
  if (!userId) return [];
  try {
    const orderColumn = table === "recordwatch_notifications" ? "sent_at" : "created_at";
    const data = await supabaseRest(table, { query: `?user_id=eq.${encodeURIComponent(userId)}&order=${orderColumn}.desc` });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`RecordWatch Supabase fetch fallback for ${table}:`, error.message);
    return null;
  }
}

async function createRecordwatchNotification(subscription, type, context = {}) {
  if (!RECORDWATCH_NOTIFICATION_TYPES.includes(type)) type = "eligibility_30_day";
  if (notificationAlreadyExists(subscription.user_id, subscription.case_id, type, context.notification_date || recordwatchDateOnly(new Date()))) return [];
  let preferences = Object.assign(getMemoryPreferences(subscription.user_id), context.preferences || {});
  const remotePreferences = await fetchRecordwatchRows("user_notification_preferences", subscription.user_id);
  if (remotePreferences && remotePreferences[0]) preferences = Object.assign(preferences, remotePreferences[0]);
  // Notification delivery must read the server-verified entitlement for
  // this specific case, not the free subscription's client-writable flags.
  let authorizedPremium=false, casePremiumPreferences=null;
  if(packetDatabaseReady() && isUuid(subscription.user_id) && isUuid(subscription.case_id)){
    try{
      const [lifetime, existingSubscription, casePrefs]=await Promise.all([
        getRecordwatchLifetimeCase(subscription.user_id,subscription.case_id),
        getActiveRecordwatchSubscription(subscription.user_id),
        getRecordwatchPreferences(subscription.user_id,subscription.case_id)
      ]);
      authorizedPremium=lifetimeCaseEntitled(lifetime,subscription.case_id) || Boolean(existingSubscription);
      casePremiumPreferences=casePrefs;
    }catch(error){
      console.warn("RecordWatch paid notification verification unavailable",error?.name||"unknown");
    }
  }
  const caseSmsOptIn=Boolean(authorizedPremium && casePremiumPreferences?.sms_enabled === true &&
    casePremiumPreferences?.sms_consent_at && !casePremiumPreferences?.sms_opted_out_at);
  // Paid case-level email preferences take precedence over the free
  // enrollment row, whose notify_email flag is intentionally always false.
  // Existing recurring customers without case preferences retain their prior opt-in.
  const caseEmailOptIn=Boolean(authorizedPremium && casePremiumPreferences &&
    casePremiumPreferences.email_enabled===true &&
    casePremiumPreferences.email_opted_in_at);
  if(casePremiumPreferences)preferences.eligibility_email=caseEmailOptIn;
  const confirmedEmail=caseEmailOptIn ? await alertRecipientEmail(subscription.user_id) : "";
  const paidCaseSubscription={...subscription,premium_active:authorizedPremium,
    notify_email:caseEmailOptIn,
    notification_email:confirmedEmail||null,
    notify_sms:caseSmsOptIn,
    notification_phone:caseSmsOptIn ? casePremiumPreferences.phone_number : null};
  if(casePremiumPreferences)preferences.eligibility_sms=caseSmsOptIn;
  const subject = recordwatchSubject(type, context);
  const message = recordwatchMessage(type, context);
  const channels = [];
  // Customer-written court notes and synthetic statuses never generate
  // external messages claiming a court action, even with an admin_override.
  const externalAllowed=!type.startsWith("court_status_") ||
    context.source==="operator_verified";
  if (externalAllowed && authorizedPremium && paidCaseSubscription.notify_email &&
      paidCaseSubscription.notification_email) channels.push("email");
  if (externalAllowed && authorizedPremium && paidCaseSubscription.notify_sms && paidCaseSubscription.notification_phone) channels.push("sms");
  if (!channels.length) channels.push("in_app");

  const eligibleChannels = channels.filter((channel) => shouldSendChannel({ channel, type, subscription:paidCaseSubscription, preferences, adminOverride: context.admin_override === true }));
  if (!eligibleChannels.length) eligibleChannels.push("in_app");
  const sent = [];
  for (const channel of eligibleChannels) {
    const blockedAlert = channels.length > 0 && channel === "in_app" && type.startsWith("court_status_") && !paidCaseSubscription.premium_active && context.admin_override !== true;
    const row = {
      id: recordwatchId("rwn"),
      user_id: subscription.user_id,
      case_id: subscription.case_id,
      type,
      channel,
      subject,
      message: channel === "sms" ? recordwatchSmsMessage(type) : message,
      sent_at: new Date().toISOString(),
      status: blockedAlert ? "skipped" : "queued",
      source: context.source || "system_test",
      notification_date: context.notification_date || recordwatchDateOnly(new Date())
    };
    try {
      if (!blockedAlert && channel === "email") row.status = (await sendRecordwatchEmail(paidCaseSubscription.notification_email, subject, message)).status;
      if (!blockedAlert && channel === "sms") row.status = (await sendRecordwatchSms(paidCaseSubscription.notification_phone, row.message)).status;
      if (!blockedAlert && channel === "in_app") row.status = "logged";
    } catch (error) {
      row.status = "failed";
      row.error_message = error.message;
    }
    recordwatchMemory.notifications.push(row);
    await persistRecordwatchRow("recordwatch_notifications", row);
    sent.push(row);
  }
  return sent;
}

function notificationAlreadyExists(userId, caseId, type, notificationDate) {
  return recordwatchMemory.notifications.some((item) => item.user_id === userId && item.case_id === caseId && item.type === type && item.notification_date === notificationDate);
}

function upsertRecordwatchEvent(payload) {
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const existing = recordwatchMemory.events.find((item) => item.user_id === userId && item.case_id === caseId);
  const row = Object.assign(existing || {
    id: recordwatchId("rwe"),
    user_id: userId,
    case_id: caseId,
    reminder_180_sent: false,
    reminder_90_sent: false,
    reminder_30_sent: false,
    reminder_7_sent: false,
    reminder_day_sent: false,
    eligibility_notification_sent: false,
    created_at: new Date().toISOString()
  }, {
    eligibility_date: recordwatchDateOnly(payload.eligibility_date || payload.eligibilityDate),
    eligibility_reason: safe(payload.eligibility_reason || payload.eligibilityReason),
    waiting_period: safe(payload.waiting_period || payload.waitingPeriod),
    eligibility_confidence: safe(payload.eligibility_confidence || payload.eligibilityConfidence, "medium"),
    eligibility_confidence_reason: safe(payload.eligibility_confidence_reason || payload.eligibilityConfidenceReason),
    eligibility_completed_at: payload.eligibility_completed_at || payload.eligibilityCompletedAt || null,
    record_details_completed_at: payload.record_details_completed_at || payload.recordDetailsCompletedAt || null,
    paid_at: payload.paid_at || payload.paidAt || null,
    packet_generated_at: payload.packet_generated_at || payload.packetGeneratedAt || null,
    updated_at: new Date().toISOString()
  });
  if (!existing) recordwatchMemory.events.push(row);
  persistRecordwatchRow("recordwatch_eligibility_events", row, "user_id,case_id");
  return row;
}

function upsertRecordwatchSubscription(payload) {
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const existing = recordwatchMemory.subscriptions.find((item) => item.user_id === userId && item.case_id === caseId);
  // Public enrollment only saves the FREE case and on-screen countdown.
  // NO email or SMS reminders are included; only Stripe verifies paid access.
  const planType = "free";
  const expiresAt = null;
  const premiumActive = false;
  const row = Object.assign(existing || { id: recordwatchId("rws"), user_id: userId, case_id: caseId, created_at: new Date().toISOString() }, {
    notification_email: safe(payload.notification_email || payload.notificationEmail || payload.email),
    notification_phone: safe(payload.notification_phone || payload.notificationPhone || payload.phone),
    notify_email: false,
    notify_sms: false,
    plan_type: "free",
    premium_active: false,
    premium_started_at: null,
    premium_expires_at: null,
    status: "active"
  });
  if (!existing) recordwatchMemory.subscriptions.push(row);
  persistRecordwatchRow("recordwatch_subscriptions", row, "user_id,case_id");
  return row;
}

function createJobRun(jobType = "recordwatch_daily") {
  const row = { id: recordwatchId("rwj"), job_type: jobType, started_at: new Date().toISOString(), status: "running", processed_count: 0, sent_count: 0, failed_count: 0, error_message: "" };
  recordwatchMemory.jobRuns.push(row);
  return row;
}

async function finishJobRun(jobRun, updates = {}) {
  Object.assign(jobRun, updates, { finished_at: new Date().toISOString() });
  await persistRecordwatchRow("recordwatch_job_runs", jobRun);
  return jobRun;
}

function getSubscriptionForEvent(event) {
  return recordwatchMemory.subscriptions.find((item) => item.case_id === event.case_id && item.user_id === event.user_id && item.status === "active");
}

async function runRecordwatchDailyJob({ now = new Date() } = {}) {
  const jobRun = createJobRun();
  const results = { checked_at: now.toISOString(), eligibility_reminders: 0, packet_reminders: 0, court_status_alerts: 0, notifications: [] };
  try {
    for (const event of recordwatchMemory.events) {
      jobRun.processed_count += 1;
      const subscription = getSubscriptionForEvent(event);
      if (!subscription || !event.eligibility_date) continue;
      const days = daysBetweenDates(now, event.eligibility_date);
      for (const reminder of RECORDWATCH_REMINDERS) {
        const due = reminder.days === 0 ? days !== null && days <= 0 : days === reminder.days;
        if (due && !event[reminder.flag]) {
          const sent = await createRecordwatchNotification(subscription, reminder.type, { notification_date: event.eligibility_date });
          event[reminder.flag] = true;
          if (reminder.days === 0) event.eligibility_notification_sent = true;
          event.updated_at = new Date().toISOString();
          await persistRecordwatchRow("recordwatch_eligibility_events", event, "user_id,case_id");
          results.eligibility_reminders += 1;
          results.notifications.push(...sent);
        }
      }
      const packetNotifications = await runPacketReminderChecks(event, subscription, now);
      results.packet_reminders += packetNotifications.length;
      results.notifications.push(...packetNotifications);
    }
    jobRun.sent_count = results.notifications.filter((item) => item.status === "sent" || item.status === "queued" || item.status === "logged").length;
    jobRun.failed_count = results.notifications.filter((item) => item.status === "failed" || item.status === RECORDWATCH_PROVIDER_MISSING).length;
    await finishJobRun(jobRun, { status: "completed" });
    return results;
  } catch (error) {
    await finishJobRun(jobRun, { status: "failed", error_message: error.message });
    throw error;
  }
}

async function runPacketReminderChecks(event, subscription, now) {
  const sent = [];
  const checks = [
    { key: "eligibility_record_details", anchor: event.eligibility_completed_at || event.created_at, condition: event.eligibility_completed_at && !event.record_details_completed_at },
    { key: "record_details_unpaid", anchor: event.record_details_completed_at, condition: event.record_details_completed_at && !event.paid_at },
    { key: "paid_not_generated", anchor: event.paid_at, condition: event.paid_at && !event.packet_generated_at }
  ];
  for (const check of checks) {
    if (!check.condition) continue;
    const elapsed = daysBetweenDates(check.anchor, now);
    const type = PACKET_REMINDER_TYPES[check.key][elapsed];
    if (!type) continue;
    const notifications = await createRecordwatchNotification(subscription, type, { notification_date: `${event.case_id}:${check.key}:${elapsed}` });
    sent.push(...notifications);
  }
  return sent;
}

async function recordwatchAdminSummary() {
  const notifications = recordwatchMemory.notifications;
  return {
    total_subscribers: recordwatchMemory.subscriptions.length,
    free_subscribers: recordwatchMemory.subscriptions.filter((item) => item.plan_type !== "premium").length,
    premium_subscribers: recordwatchMemory.subscriptions.filter((item) => item.premium_active).length,
    upcoming_eligibility_events: recordwatchMemory.events.filter((item) => daysBetweenDates(new Date(), item.eligibility_date) >= 0).length,
    notifications_sent: notifications.filter((item) => ["sent", "queued", "logged"].includes(item.status)).length,
    failed_or_skipped_notifications: notifications.filter((item) => item.status === "failed" || item.status === RECORDWATCH_PROVIDER_MISSING || item.status === "skipped").length,
    provider_missing_warnings: notifications.filter((item) => item.status === RECORDWATCH_PROVIDER_MISSING).length,
    latest_job_runs: recordwatchMemory.jobRuns.slice(-5).reverse(),
    sms_usage: notifications.filter((item) => item.channel === "sms").length,
    email_usage: notifications.filter((item) => item.channel === "email").length
  };
}


function ledgerId() {
  return `led_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeLedgerStatus(status) {
  const value = String(status || "posted").trim().toLowerCase();
  return ["posted", "pending", "refunded", "reversed", "failed"].includes(value) ? value : "posted";
}

function normalizeLedgerEntryType(type) {
  const value = String(type || "adjustment").trim().toLowerCase();
  return ["packet_purchase", "recordwatch_subscription", "recordwatch_addon", "recordwatch_refund", "recordwatch_credit", "credit", "refund", "adjustment", "recordwatch_activity"].includes(value) ? value : "adjustment";
}

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const config = supabaseRestConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user && user.id ? user : null;
}

async function requireApiUser(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return null;
  }
  return user;
}

function ledgerMetadataIdempotency(metadata = {}) {
  return String((metadata && metadata.idempotency_key) || "").trim();
}

function normalizeLedgerPayload(payload = {}, userId) {
  const debit = Math.max(0, Number.parseInt(payload.debit_cents ?? payload.debitCents ?? 0, 10) || 0);
  const credit = Math.max(0, Number.parseInt(payload.credit_cents ?? payload.creditCents ?? 0, 10) || 0);
  const amount = Math.max(0, Number.parseInt(payload.amount_cents ?? payload.amountCents ?? Math.max(debit, credit), 10) || 0);
  const metadata = Object.assign({}, payload.metadata || {});
  return {
    id: isUuid(payload.id) ? payload.id : ledgerId(),
    user_id: userId || safe(payload.user_id || payload.userId),
    case_id: safe(payload.case_id || payload.caseId) || null,
    entry_type: normalizeLedgerEntryType(payload.entry_type || payload.entryType),
    description: safe(payload.description, "RecordPathAI ledger entry"),
    amount_cents: amount,
    currency: safe(payload.currency, "usd").toLowerCase(),
    debit_cents: debit,
    credit_cents: credit,
    balance_after_cents: payload.balance_after_cents ?? payload.balanceAfterCents ?? null,
    stripe_session_id: safe(payload.stripe_session_id || payload.stripeSessionId) || null,
    stripe_payment_intent_id: safe(payload.stripe_payment_intent_id || payload.stripePaymentIntentId) || null,
    stripe_customer_id: safe(payload.stripe_customer_id || payload.stripeCustomerId) || null,
    related_recordwatch_subscription_id: isUuid(payload.related_recordwatch_subscription_id || payload.relatedRecordwatchSubscriptionId) ? (payload.related_recordwatch_subscription_id || payload.relatedRecordwatchSubscriptionId) : null,
    related_packet_id: safe(payload.related_packet_id || payload.relatedPacketId) || null,
    status: normalizeLedgerStatus(payload.status),
    metadata,
    created_at: payload.created_at || payload.createdAt || new Date().toISOString()
  };
}

async function findExistingLedgerEntry(userId, { stripeSessionId, idempotencyKey } = {}) {
  const stripeValue = safe(stripeSessionId);
  const idemValue = safe(idempotencyKey);
  const memoryMatch = ledgerMemory.entries.find((entry) => entry.user_id === userId && ((stripeValue && entry.stripe_session_id === stripeValue) || (idemValue && ledgerMetadataIdempotency(entry.metadata) === idemValue)));
  if (memoryMatch) return memoryMatch;
  try {
    if (stripeValue) {
      const rows = await supabaseRest("user_ledger_entries", { query: `?user_id=eq.${encodeURIComponent(userId)}&stripe_session_id=eq.${encodeURIComponent(stripeValue)}&limit=1` });
      if (Array.isArray(rows) && rows[0]) return rows[0];
    }
    if (idemValue) {
      const rows = await supabaseRest("user_ledger_entries", { query: `?user_id=eq.${encodeURIComponent(userId)}&metadata->>idempotency_key=eq.${encodeURIComponent(idemValue)}&limit=1` });
      if (Array.isArray(rows) && rows[0]) return rows[0];
    }
  } catch (error) {
    console.warn("Ledger duplicate lookup fallback:", error.message);
  }
  return null;
}

async function calculateUserLedgerBalance(userId) {
  const entries = await getUserLedger(userId, { ascending: true });
  return entries.reduce((balance, entry) => balance + (Number(entry.debit_cents) || 0) - (Number(entry.credit_cents) || 0), 0);
}

async function createLedgerEntry(payload = {}, options = {}) {
  const entry = normalizeLedgerPayload(payload, options.userId || payload.user_id || payload.userId);
  if (!entry.user_id) throw new Error("user_id is required for ledger entries");
  const idempotencyKey = ledgerMetadataIdempotency(entry.metadata);
  const existing = await findExistingLedgerEntry(entry.user_id, { stripeSessionId: entry.stripe_session_id, idempotencyKey });
  if (existing) return Object.assign({ duplicate: true }, existing);
  if (entry.balance_after_cents === null || entry.balance_after_cents === undefined) {
    entry.balance_after_cents = await calculateUserLedgerBalance(entry.user_id) + entry.debit_cents - entry.credit_cents;
  }
  try {
    const persisted = await supabaseRest("user_ledger_entries", { method: "POST", body: entry, prefer: "return=representation" });
    const row = Array.isArray(persisted) && persisted[0] ? persisted[0] : entry;
    ledgerMemory.entries.push(row);
    return row;
  } catch (error) {
    console.warn("Ledger Supabase persistence fallback:", error.message);
    ledgerMemory.entries.push(entry);
    return entry;
  }
}

async function getUserLedger(userId, { limit = 100, ascending = false } = {}) {
  try {
    const order = ascending ? "created_at.asc" : "created_at.desc";
    const rows = await supabaseRest("user_ledger_entries", { query: `?user_id=eq.${encodeURIComponent(userId)}&order=${order}&limit=${encodeURIComponent(limit)}` });
    if (Array.isArray(rows)) return rows;
  } catch (error) {
    console.warn("Ledger Supabase fetch fallback:", error.message);
  }
  return ledgerMemory.entries.filter((entry) => entry.user_id === userId).sort((a, b) => ascending ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
}

async function getAllLedgerEntries({ limit = 100 } = {}) {
  try {
    const rows = await supabaseRest("user_ledger_entries", { query: `?order=created_at.desc&limit=${encodeURIComponent(limit)}` });
    if (Array.isArray(rows)) return rows;
  } catch (error) {
    console.warn("Admin ledger Supabase fetch fallback:", error.message);
  }
  return ledgerMemory.entries.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
}

async function getLedgerSummary(userId) {
  const entries = await getUserLedger(userId, { limit: 1000, ascending: false });
  return summarizeLedgerEntries(entries);
}

function summarizeLedgerEntries(entries = []) {
  const posted = entries.filter((entry) => entry.status === "posted" || entry.status === "refunded" || entry.status === "reversed");
  const totalDebits = posted.reduce((sum, entry) => sum + (Number(entry.debit_cents) || 0), 0);
  const totalCredits = posted.reduce((sum, entry) => sum + (Number(entry.credit_cents) || 0), 0);
  return {
    total_purchases_cents: totalDebits,
    total_credits_cents: totalCredits,
    current_balance_cents: totalDebits - totalCredits,
    last_transaction_at: entries[0] ? entries[0].created_at : null,
    entry_count: entries.length
  };
}

async function getAdminLedgerSummary() {
  const entries = await getAllLedgerEntries({ limit: 1000 });
  const posted = entries.filter((entry) => entry.status === "posted");
  const sumDebit = (items) => items.reduce((sum, entry) => sum + (Number(entry.debit_cents) || 0), 0);
  const sumCredit = (items) => items.reduce((sum, entry) => sum + (Number(entry.credit_cents) || 0), 0);
  return {
    total_revenue_cents: sumDebit(posted) - sumCredit(posted),
    packet_purchase_revenue_cents: sumDebit(posted.filter((entry) => entry.entry_type === "packet_purchase")),
    recordwatch_premium_revenue_cents: sumDebit(posted.filter((entry) => ["recordwatch_subscription","recordwatch_addon"].includes(entry.entry_type))),
    refunds_credits_cents: sumCredit(entries.filter((entry) => ["posted", "refunded", "reversed"].includes(entry.status))),
    failed_payments_cents: sumDebit(entries.filter((entry) => entry.status === "failed")),
    recent_entries: entries.slice(0, 25)
  };
}

function isAdminRequest(req) {
  const configuredKey = process.env.RECORDWATCH_ADMIN_KEY || "";
  if (configuredKey && req.get("x-recordpath-admin-key") === configuredKey) return true;
  // Demo-only admin bypass intentionally disabled.
  return false;
}

const OFFICIAL_PACKET_HINTS = [
  "application for sealing",
  "2953.32",
  "conviction",
  "dismissal",
  "expungement",
  "pdf",
  "forms"
];

const OFFICIAL_DOMAIN_HINTS = [
  ".gov",
  ".us",
  "clerk",
  "court",
  "municipal",
  "county",
  "commonpleas",
  "common-pleas",
  "co."
];


function slugify(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function suggestCourtType(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('municipal')) return 'municipal';
  if (t.includes('common pleas') || t.includes('common-pleas')) return 'common-pleas';
  if (t.includes('district')) return 'district';
  if (t.includes('superior')) return 'superior';
  if (t.includes('circuit')) return 'circuit';
  if (t.includes('county')) return 'county';
  return 'other';
}
function safe(value, fallback = "") {
  return (value ?? "").toString().trim() || fallback;
}

function getBaseUrl(req) {
  // Do not construct Stripe redirect links from untrusted Host/X-Forwarded headers.
  const configured = safe(process.env.PUBLIC_APP_URL);
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" && !url.username && !url.password)
        return url.origin;
    } catch {}
  }
  const host = safe(req.get("host"));
  if (/^(localhost|127\\.0\\.0\\.1)(:[0-9]{2,5})?$/i.test(host))
    return "http://" + host;
  return "https://recordpathai.com";
}

function normalizeCourtName(input) {
  return String(input || "").trim().replace(/\s+/g, " ");
}

function scoreResult(result, courtQuery) {
  const title = (result.title || "").toLowerCase();
  const url = (result.url || "").toLowerCase();
  const query = (courtQuery || "").toLowerCase();

  let score = 0;

  for (const hint of OFFICIAL_PACKET_HINTS) {
    if (title.includes(hint) || url.includes(hint.replace(/\./g, ""))) {
      score += 2;
    }
  }

  for (const hint of OFFICIAL_DOMAIN_HINTS) {
    if (url.includes(hint)) {
      score += 2;
    }
  }

  if (url.endsWith(".pdf") || url.includes("/view/")) score += 4;
  if (title.includes("application for sealing")) score += 5;
  if (title.includes("conviction")) score += 2;

  if (query && (title.includes(query) || url.includes(query.replace(/\s+/g, "-")))) {
    score += 4;
  }

  if (url.includes("law") && !url.includes("clerk") && !url.includes("court")) {
    score -= 4;
  }

  if (url.includes("blog")) {
    score -= 4;
  }

  return score;
}

function buildSearchQueries(court, state, type) {
  return [
    `${court} ${state} ${type} packet pdf`,
    `${court} clerk forms application for sealing pdf`,
    `${court} 2953.32 conviction pdf`
  ];
}

async function searchWeb(query) {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    throw new Error("Missing SERPAPI_KEY");
  }

  const url = new URL("https://serpapi.com/search.json");

  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", "10");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const json = await response.json();
  const results = Array.isArray(json.organic_results)
    ? json.organic_results
    : [];

  return results.map((result) => ({
    title: result.title || "",
    url: result.link || "",
    snippet: result.snippet || ""
  }));
}

function woodCountyShortcut(court) {
  const c = court.toLowerCase();

  if (!c.includes("wood")) {
    return null;
  }

  return {
    court: "Wood County Court of Common Pleas",
    packetTitle: "Application for Sealing 2953.32 (Conviction)",
    packetUrl: "https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF",
    source: "Wood County Clerk of Courts",
    confidence: 0.99
  };
}




app.post('/api/jurisdiction-search', async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await runJurisdictionSearch(payload);
    return res.json({ ...result, generatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ backendConfigured: false, queries: [], results: [], errors: [error.message], generatedAt: new Date().toISOString() });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "RecordPathAI"
  });
});



app.get("/api/ledger", async (req, res) => {
  try {
    const user = await requireApiUser(req, res);
    if (!user) return;
    const entries = await getUserLedger(user.id);
    res.json({ ok: true, entries });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/ledger/summary", async (req, res) => {
  try {
    const user = await requireApiUser(req, res);
    if (!user) return;
    const summary = await getLedgerSummary(user.id);
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Serve ONLY the exact approved private PDF after server-verified Stripe
// payment for this authenticated account and saved case. Never regenerate from
// browser-controlled fields after a sale.
app.post("/api/packet/download-approved",async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  if(!stripe||!packetDatabaseReady())
    return res.status(503).json({ok:false,error:"Paid packet download is temporarily unavailable."});
  const caseId=safe(req.body?.case_id),sessionId=safe(req.body?.session_id);
  if(!validCaseId(caseId)||!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId))
    return res.status(400).json({ok:false,error:"Saved case and verified payment session required."});
  try {
    const session=await stripe.checkout.sessions.retrieve(sessionId);
    if(!verifiedPacketSession(session,user.id,caseId))
      return res.status(403).json({ok:false,error:"Payment was not verified for this saved case."});
    const [reviews,drafts]=await Promise.all([
      supabaseRest("packet_releases",{query:"?case_id=eq."+encodeURIComponent(caseId)+
        "&user_id=eq."+encodeURIComponent(user.id)+"&limit=1"}),
      supabaseRest("packet_drafts",{query:"?case_id=eq."+encodeURIComponent(caseId)+
        "&user_id=eq."+encodeURIComponent(user.id)+"&limit=1"})
    ]);
    const review=Array.isArray(reviews)?reviews[0]:null;
    const draft=Array.isArray(drafts)?drafts[0]:null;
    if(!review||review.status!=="approved"||!draft||
       review.signed_pdf_sha256!==draft.signed_pdf_sha256||
       review.signed_pdf_private_path!==draft.signed_pdf_private_path)
      return res.status(409).json({ok:false,error:"The approved signed PDF is not available. Contact support; no additional payment is required."});
    const config=supabaseRestConfig();
    const response=await fetch(config.url+"/storage/v1/object/packet-documents/"+draft.signed_pdf_private_path,{
      headers:{apikey:config.key,Authorization:"Bearer "+config.key},
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw new Error("Private signed packet unavailable");
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<500||bytes.length>8388608 ||
       createHash("sha256").update(bytes).digest("hex")!==review.signed_pdf_sha256)
      throw new Error("Private signed packet digest mismatch");
    res.setHeader("Cache-Control","no-store, private");
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",'attachment; filename="recordpathai-approved-signed-packet.pdf"');
    res.setHeader("X-Content-Type-Options","nosniff");
    return res.status(200).send(bytes);
  }catch(error){
    console.warn("Approved packet download unavailable",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Unable to retrieve the signed paid packet. Do not pay again; contact support."});
  }
});

app.post("/api/packet/verify-payment", async (req, res) => {
  try {
    const user = await requireApiUser(req, res);
    if (!user) return;
    if (!stripe) return res.status(503).json({ ok: false, error: "Stripe verification is unavailable" });
    const sessionId = safe((req.body || {}).stripe_session_id || (req.body || {}).session_id);
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId))
      return res.status(400).json({ ok: false, error: "Valid Stripe checkout session required" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const requestedCaseId = safe((req.body || {}).case_id || (req.body || {}).saved_case_id);
    if (!verifiedPacketSession(session, user.id, requestedCaseId || null))
      return res.status(403).json({ ok: false, paid: false, error: "Payment not verified for this account" });
    res.setHeader("Cache-Control", "no-store, private");
    return res.json({ ok: true, paid: true, sessionId: session.id, caseId: session.metadata.saved_case_id || session.metadata.case_id || null });
  } catch (error) {
    console.error("Packet verification failed", error?.type || error?.name || "unknown");
    return res.status(502).json({ ok: false, paid: false, error: "Payment verification unavailable" });
  }
});

app.post("/api/ledger/packet-purchase", async (req, res) => {
  try {
    const user = await requireApiUser(req, res);
    if (!user) return;
    if (!stripe) return res.status(503).json({ ok: false, error: "Stripe verification is unavailable" });
    const sessionId = safe((req.body || {}).stripe_session_id || (req.body || {}).stripeSessionId);
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId))
      return res.status(400).json({ ok: false, error: "Stripe checkout session required" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!verifiedPacketSession(session, user.id))
      return res.status(403).json({ ok: false, error: "Payment not verified for this account" });
    const metadata = Object.assign({}, session.metadata, {
      product: "packet_generation", idempotency_key: "packet:" + session.id
    });
    const entry = await createLedgerEntry({
      user_id: user.id,
      case_id: session.metadata.saved_case_id || session.metadata.case_id || null,
      entry_type: "packet_purchase",
      description: "RecordPathAI packet unlock",
      amount_cents: PACKET_PRICE_CENTS,
      debit_cents: PACKET_PRICE_CENTS,
      credit_cents: 0,
      status: "posted",
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      stripe_customer_id: session.customer || null,
      related_packet_id: session.client_reference_id || null,
      metadata
    }, { userId: user.id });
    res.setHeader("Cache-Control", "no-store, private");
    return res.json({ ok: true, paid: true, entry, duplicate: entry.duplicate === true });
  } catch (error) {
    console.error("Packet ledger verification failed", error?.type || error?.name || "unknown");
    return res.status(502).json({ ok: false, error: "Payment verification unavailable" });
  }
});

app.post("/api/ledger/recordwatch-subscription", async (req, res) => {
  try {
    const user = await requireApiUser(req, res);
    if (!user) return;
    if (!stripe) return res.status(503).json({ ok: false, error: "Stripe verification unavailable" });
    const sessionId = safe((req.body || {}).stripe_session_id || (req.body || {}).stripeSessionId);
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId))
      return res.status(400).json({ ok: false, error: "Stripe checkout session required" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!verifiedRecordwatchSession(session, user.id))
      return res.status(403).json({ ok: false, error: "Payment not verified for this account" });
    const plan = session.metadata.plan;
    const amount = RECORDWATCH_PLAN_AMOUNTS[plan];
    const entry = await createLedgerEntry({
      user_id: user.id,
      case_id: session.metadata.saved_case_id || session.metadata.case_id || null,
      entry_type: "recordwatch_subscription",
      description: "RecordWatch Premium subscription",
      amount_cents: amount, debit_cents: amount, credit_cents: 0,
      status: "posted",
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      stripe_customer_id: session.customer || null,
      metadata: Object.assign({}, session.metadata, {
        product: "recordwatch_premium", idempotency_key: "recordwatch:" + session.id
      })
    }, { userId: user.id });
    return res.json({ ok: true, posted: true, entry, duplicate: entry.duplicate === true });
  } catch (error) {
    console.error("RecordWatch ledger verification failed", error?.type || error?.name || "unknown");
    return res.status(502).json({ ok: false, error: "Payment verification unavailable" });
  }
});

app.post("/api/admin/ledger-entry", async (req, res) => {
  try {
    if (!isAdminRequest(req)) return res.status(403).json({ ok: false, error: "Admin access required" });
    const entry = await createLedgerEntry(req.body || {});
    res.json({ ok: true, entry, duplicate: entry.duplicate === true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/admin/ledger-summary", async (req, res) => {
  try {
    if (!isAdminRequest(req)) return res.status(403).json({ ok: false, error: "Admin access required" });
    const summary = await getAdminLedgerSummary();
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});


const RECORDWATCH_PRICE_ENV = {
  monthly: "STRIPE_RECORDWATCH_MONTHLY_PRICE_ID",
  annual: "STRIPE_RECORDWATCH_ANNUAL_PRICE_ID",
  addon_12_month: "STRIPE_RECORDWATCH_ADDON_PRICE_ID"
};
const RECORDWATCH_PLAN_AMOUNTS = { monthly: 499, annual: 3900, addon_12_month: 1900, lifetime_case: RECORDWATCH_LIFETIME_CENTS };

function normalizePremiumRecordwatchPlan(plan) {
  const value = safe(plan).toLowerCase();
  return ["monthly", "annual", "addon_12_month"].includes(value) ? value : "";
}

function recordwatchPlanPeriod(plan) {
  const start = new Date();
  const end = new Date(start);
  if (plan === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function isActiveRecordwatchSubscription(row) {
  return recordwatchEntitled(row);
}

async function getRecordwatchBillingRow(userId) {
  if(!packetDatabaseReady()) throw new Error("Verified RecordWatch billing requires private database write access.");
  const rows=await supabaseRest("recordwatch_subscriptions",{
    query:"?user_id=eq."+encodeURIComponent(userId)+
      "&stripe_subscription_id=not.is.null&order=updated_at.desc&limit=1"
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getActiveRecordwatchSubscription(userId) {
  const row=await getRecordwatchBillingRow(userId);
  if(!isActiveRecordwatchSubscription(row) || !recordwatchStripe)return null;
  // Legacy sandbox purchases may still be stored in Supabase. They must NOT
  // grant entitlements or block purchases after switching to live Stripe.
  try{
    const current=await recordwatchStripe.subscriptions.retrieve(row.stripe_subscription_id);
    const verifiedPlan=verifyRecordwatchSubscription(current,process.env,userId);
    const period=billingPeriod(current);
    return verifiedPlan && ["active","trialing"].includes(current.status) &&
      period.end && new Date(period.end).getTime()>Date.now() ? row : null;
  }catch{
    return null;
  }
}
// Lifetime records are separate from legacy Stripe subscriptions. Ownership is
// scoped by saved_case_id. Never infer paid access from browser/local flags.
async function getRecordwatchLifetimeCase(userId,caseId){
  if(!isUuid(userId)||!isUuid(caseId))return null;
  const rows=await supabaseRest("recordwatch_lifetime_cases",{
    query:"?user_id=eq."+encodeURIComponent(userId)+"&saved_case_id=eq."+encodeURIComponent(caseId)+"&limit=1"
  });
  return Array.isArray(rows)?rows[0]||null:null;
}
function lifetimeAsSubscription(row){
  if(!row)return null;
  return {
    ...row,case_id:row.saved_case_id,plan:"lifetime_case",
    stripe_session_id:row.stripe_checkout_session_id,
    premium_active:lifetimeCaseEntitled(row,row.saved_case_id),
    current_period_end:null,cancel_at_period_end:false
  };
}
async function verifiedRecordwatchLifetimeSession(sessionId,userId,caseId){
  if(!recordwatchStripe || !isUuid(userId) || !isUuid(caseId) ||
     !/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId||"")))
    throw Object.assign(new Error("Invalid RecordWatch checkout identification."),{status:400});
  const priceId=process.env[RECORDWATCH_LIFETIME_PRICE_ENV];
  if(!priceId)throw Object.assign(new Error("Lifetime RecordWatch price not configured."),{status:503});
  const session=await recordwatchStripe.checkout.sessions.retrieve(sessionId);
  if(!paidRecordwatchLifetimeCheckout(session,userId,caseId,priceId))
    throw Object.assign(new Error("RecordWatch case payment was not verified."),{status:403});
  const lines=await recordwatchStripe.checkout.sessions.listLineItems(session.id,{limit:10});
  if(lines?.data?.length!==1 || lines.data[0]?.price?.id!==priceId ||
     lines.data[0]?.quantity!==1 || lines.data[0]?.amount_total!==RECORDWATCH_LIFETIME_CENTS)
    throw Object.assign(new Error("RecordWatch checkout price or quantity mismatch."),{status:403});
  // Catch refunded/disputed charges even when a Stripe refund event races the
  // completed-checkout event or a webhook delivery has not arrived yet.
  const intentId=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  const intent=await recordwatchStripe.paymentIntents.retrieve(intentId,{expand:["latest_charge"]});
  const charge=typeof intent.latest_charge==="string"
    ? await recordwatchStripe.charges.retrieve(intent.latest_charge) : intent.latest_charge;
  if(intent.status!=="succeeded" || intent.currency!=="usd" ||
     intent.amount_received!==RECORDWATCH_LIFETIME_CENTS ||
     intent.metadata?.product!=="premium_recordwatch_lifetime" ||
     intent.metadata?.user_id!==userId || intent.metadata?.saved_case_id!==caseId ||
     !charge || charge.refunded===true || Number(charge.amount_refunded||0)>0 ||
     charge.disputed===true)
    throw Object.assign(new Error("The RecordWatch charge is not an active, unreversed $39 payment."),{status:403});
  await getSavedCaseReviewFacts(userId,caseId); // Check real saved-case owner and deletion state.
  return session;
}
async function upsertRecordwatchLifetimeCase(session){
  const userId=session.metadata.user_id,caseId=session.metadata.saved_case_id;
  if(!isUuid(userId)||!isUuid(caseId))throw new Error("Valid lifetime case owner required.");
  const existing=await getRecordwatchLifetimeCase(userId,caseId);
  const paymentIntent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  const customer=typeof session.customer==="string"?session.customer:session.customer?.id||null;
  if(existing && lifetimeCaseEntitled(existing,caseId) &&
     existing.stripe_checkout_session_id!==session.id){
    // Rare parallel checkouts: return the second payment rather than double-selling a case.
    await recordwatchStripe.refunds.create({payment_intent:paymentIntent},{
      idempotencyKey:"recordwatch-duplicate:"+session.id
    });
    return existing;
  }
  // Ignore delayed old webhook events after a case is purchased again.
  if(existing?.stripe_checkout_session_id!==session.id &&
     existing?.status==="active")return existing;
  const row={
    user_id:userId,saved_case_id:caseId,plan:"lifetime_case",status:"active",
    amount_cents:RECORDWATCH_LIFETIME_CENTS,currency:"usd",
    stripe_checkout_session_id:session.id,stripe_payment_intent_id:paymentIntent,
    stripe_customer_id:customer,purchased_at:new Date((session.created||Math.floor(Date.now()/1000))*1000).toISOString(),
    revoked_at:null,updated_at:new Date().toISOString()
  };
  // Never resurrect a refunded/disputed session from a replayed event.
  if(existing?.stripe_checkout_session_id===session.id && existing.status!=="active")
    return existing;
  const saved=await supabaseRest("recordwatch_lifetime_cases",{
    method:existing?"PATCH":"POST",
    query:existing?"?id=eq."+encodeURIComponent(existing.id):"",
    body:row,prefer:"return=representation"
  });
  if(!Array.isArray(saved)||!saved[0])throw new Error("Lifetime entitlement persistence failed.");
  return saved[0];
}

// One verified Stripe subscription => one server-controlled database row.
// Never fall back to process memory when recording paid entitlements.
async function upsertPremiumRecordwatchSubscription(payload = {}) {
  if(!isUuid(payload.user_id) || !payload.stripe_subscription_id?.startsWith("sub_"))
    throw new Error("Verified Stripe subscription owner and ID required.");
  const row={
    user_id:payload.user_id,
    plan:recordwatchPlan(payload.plan),
    status:String(payload.status||"incomplete"),
    stripe_subscription_id:payload.stripe_subscription_id,
    stripe_customer_id:payload.stripe_customer_id||null,
    stripe_session_id:payload.stripe_session_id||null,
    current_period_start:payload.current_period_start||null,
    current_period_end:payload.current_period_end||null,
    cancel_at_period_end:Boolean(payload.cancel_at_period_end),
    updated_at:new Date().toISOString()
  };
  if(!row.plan)throw new Error("Verified RecordWatch plan required.");
  row.premium_active=recordwatchEntitled(row);
  row.plan_type="premium";
  row.premium_started_at=row.current_period_start;
  row.premium_expires_at=row.current_period_end;
  const matches=await supabaseRest("recordwatch_subscriptions",{
    query:"?stripe_subscription_id=eq."+encodeURIComponent(row.stripe_subscription_id)+"&limit=1"
  });
  const existing=Array.isArray(matches)?matches[0]:null;
  if(existing && existing.user_id!==row.user_id)throw new Error("Stripe subscription is already linked to another account.");
  if(existing){
    // Keep original Checkout reference during renewal and cancellation events.
    row.stripe_session_id=row.stripe_session_id||existing.stripe_session_id||null;
    const updated=await supabaseRest("recordwatch_subscriptions",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(existing.id),
      body:row,prefer:"return=representation"
    });
    if(!Array.isArray(updated)||!updated[0])throw new Error("RecordWatch billing update failed.");
    return updated[0];
  }
  const inserted=await supabaseRest("recordwatch_subscriptions",{
    method:"POST",body:row,prefer:"return=representation"
  });
  if(!Array.isArray(inserted)||!inserted[0])throw new Error("RecordWatch billing insert failed.");
  return inserted[0];
}

async function syncVerifiedRecordwatchStripeSubscription(subscription, sessionId = "") {
  const userId=subscription?.metadata?.user_id;
  if(!isUuid(userId))throw new Error("Stripe subscription has no valid RecordWatch owner.");
  const plan=verifyRecordwatchSubscription(subscription,process.env,userId);
  if(!plan)throw new Error("Stripe subscription is not a configured RecordWatch plan.");
  assertRecordwatchStripePrice(subscription.items.data[0].price,plan);
  const period=billingPeriod(subscription);
  if(["active","trialing"].includes(subscription.status) && !period.end)
    throw new Error("Stripe did not provide a verified subscription billing period.");
  const customer=typeof subscription.customer==="string" ? subscription.customer : subscription.customer?.id;
  return upsertPremiumRecordwatchSubscription({
    user_id:userId,plan,status:subscription.status,
    stripe_subscription_id:subscription.id,
    stripe_customer_id:customer,
    stripe_session_id:sessionId||null,
    current_period_start:period.start,
    current_period_end:period.end,
    cancel_at_period_end:subscription.cancel_at_period_end
  });
}

async function createRecordwatchLedgerEntryFromSession(userId, session, plan) {
  const amount = RECORDWATCH_PLAN_AMOUNTS[plan] || 0;
  if (!amount) return null;
  const entryType = plan === "addon_12_month" ? "recordwatch_addon" : "recordwatch_subscription"; // Lifetime is recorded as a one-time purchase (no renewal).
  return createLedgerEntry({
    user_id: userId,
    case_id: session.metadata && (session.metadata.saved_case_id || session.metadata.case_id),
    entry_type: entryType,
    description: plan === "lifetime_case" ? "RecordWatch Premium lifetime case purchase" :
      plan === "addon_12_month" ? "Premium RecordWatch 12-month packet add-on" : "Premium RecordWatch subscription",
    amount_cents: amount,
    debit_cents: amount,
    credit_cents: 0,
    status: "posted",
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_customer_id: session.customer || null,
    metadata: Object.assign({}, session.metadata || {}, { product: "premium_recordwatch", idempotency_key: `recordwatch:${session.id}` })
  }, { userId });
}

async function getRecordwatchPreferences(userId,caseId="") {
  try {
    const caseFilter=isUuid(caseId)?"&saved_case_id=eq."+encodeURIComponent(caseId):"&saved_case_id=is.null&case_id=is.null";
    const rows = await supabaseRest("recordwatch_notification_preferences", { query: `?user_id=eq.${encodeURIComponent(userId)}${caseFilter}&order=updated_at.desc&limit=1` });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  } catch (error) {
    console.warn("RecordWatch premium preference lookup fallback:", error.message);
  }
  return recordwatchMemory.preferences.find((item) => item.user_id === userId && (isUuid(caseId)?item.saved_case_id===caseId:!item.saved_case_id)) || null;
}

async function saveRecordwatchPreferences(userId,payload={}){
  const caseId=safe(payload.saved_case_id||payload.savedCaseId);
  if(!isUuid(caseId))throw Object.assign(new Error("Select an owned saved case to manage Premium alerts."),{status:400});
  if(!packetDatabaseReady())throw Object.assign(new Error("Private notification preferences are unavailable."),{status:503});
  const cases=await supabaseRest("saved_cases",{query:"?id=eq."+encodeURIComponent(caseId)+
    "&user_id=eq."+encodeURIComponent(userId)+"&select=id&limit=1"});
  if(!Array.isArray(cases)||!cases[0])
    throw Object.assign(new Error("Saved case not found for this account."),{status:404});
  const [lifetime,priorRows]=await Promise.all([
    getRecordwatchLifetimeCase(userId,caseId),
    supabaseRest("recordwatch_notification_preferences",{query:"?user_id=eq."+
      encodeURIComponent(userId)+"&saved_case_id=eq."+encodeURIComponent(caseId)+"&limit=1"})
  ]);
  // New $39 case purchases are authoritative. Legacy recurring accounts remain
  // grandfathered only if verified directly with their Stripe subscription.
  const subscribed=lifetimeCaseEntitled(lifetime,caseId) ||
    Boolean(await getActiveRecordwatchSubscription(userId));
  if(!subscribed)throw Object.assign(new Error("Paid RecordWatch Premium is required for this saved case."),{status:403});
  const previous=Array.isArray(priorRows)?priorRows[0]||null:null;
  const phone=canonicalSmsPhone(payload.phone_number||payload.phoneNumber||previous?.phone_number);
  const smsRequested=payload.sms_enabled===true||payload.smsEnabled===true;
  const smsConsent=payload.sms_consent===true||payload.smsConsent===true;
  const changedPhone=Boolean(previous?.phone_number && phone!==previous.phone_number);
  const newSmsEnrollment=smsRequested && (!previous?.sms_enabled ||
    !previous?.sms_consent_at || changedPhone);
  if(newSmsEnrollment && payload.sms_terms_acknowledged!==true)
    throw Object.assign(new Error("A separate Terms and Privacy acknowledgment is required to enroll in SMS."),{status:400});
  if(newSmsEnrollment && payload.sms_consent_disclosure_version!=="2026-11-web-form-v2")
    throw Object.assign(new Error("Please refresh the SMS consent form to review the current disclosure."),{status:400});
  const suppressed=phone?await supabaseRest("recordwatch_sms_suppressions",{
    query:"?phone_number=eq."+encodeURIComponent(phone)+"&select=phone_number&limit=1"
  }):[];
  if(smsRequested && (!phone||!smsConsent))
    throw Object.assign(new Error("Enter a valid US phone number and affirm optional SMS consent."),{status:400});
  if(smsRequested && changedPhone && !payload.sms_consent_reconfirmed)
    throw Object.assign(new Error("Confirm consent again for the new phone number."),{status:400});
  if(smsRequested && (previous?.sms_opted_out_at||Array.isArray(suppressed)&&suppressed.length))
    throw Object.assign(new Error("SMS remains opted out. Reply START to the sender and contact support before re-enabling."),{status:409});
  const emailEnabled=payload.email_enabled===true||payload.emailEnabled===true;
  const now=new Date().toISOString();
  const row={
    user_id:userId,saved_case_id:caseId,case_id:null,
    email_enabled:emailEnabled,
    email_opted_in_at:emailEnabled?(previous?.email_opted_in_at||now):null,
    sms_enabled:smsRequested,
    phone_number:phone||null,
    sms_consent_at:smsRequested?(newSmsEnrollment?now:previous?.sms_consent_at||now):null,
    sms_consent_source:smsRequested?"explicit_case_dashboard":previous?.sms_consent_source||null,
    sms_consent_disclosure_version:smsRequested?(newSmsEnrollment?"2026-11-web-form-v2":previous?.sms_consent_disclosure_version||"2026-11-web-form-v2"):previous?.sms_consent_disclosure_version||null,
    sms_opted_out_at:previous?.sms_opted_out_at||null,
    reminder_180_enabled:payload.reminder_180_enabled!==false,
    reminder_90_enabled:payload.reminder_90_enabled!==false,
    reminder_30_enabled:payload.reminder_30_enabled!==false,
    reminder_7_enabled:payload.reminder_7_enabled!==false,
    reminder_day_enabled:payload.reminder_day_enabled!==false,
    court_status_enabled:payload.court_status_enabled!==false,
    updated_at:now
  };
  let result;
  if(previous)result=await supabaseRest("recordwatch_notification_preferences",{
    method:"PATCH",query:"?id=eq."+encodeURIComponent(previous.id),
    body:row,prefer:"return=representation"
  });
  else result=await supabaseRest("recordwatch_notification_preferences",{
    method:"POST",body:row,prefer:"return=representation"
  });
  if(!Array.isArray(result)||!result[0])
    throw Object.assign(new Error("Preferences could not be stored."),{status:503});
  return result[0];
}

async function recordwatchAuthToken(req, res) {
  return requireApiUser(req, res);
}


// Public readiness check returns only booleans. It never exposes API keys,
// webhook signing secrets, or customer information.
async function recordwatchBillingReadiness() {
  const key=process.env.STRIPE_RECORDWATCH_SECRET_KEY||"";
  const mode=/^(sk|rk)_test_/.test(key)?"sandbox":/^(sk|rk)_live_/.test(key)?"live":"unconfigured";
  const priceId=process.env[RECORDWATCH_LIFETIME_PRICE_ENV]||"";
  const webhook=Boolean((process.env.STRIPE_RECORDWATCH_WEBHOOK_SECRET||"").startsWith("whsec_"));
  const persistence=packetDatabaseReady();
  const liveAllowed=mode!=="live"||process.env.RECORDWATCH_LIVE_BILLING_ENABLED==="true";
  // Confirm the configured price belongs to the SAME Stripe account as the
  // secret key, and is an active non-recurring USD $39 price, not just a string.
  let verifiedPrice=false;
  if(recordwatchStripe && /^price_/.test(priceId) && liveAllowed){
    try{
      const price=await recordwatchStripe.prices.retrieve(priceId);
      assertRecordwatchLifetimePrice(price);
      verifiedPrice=true;
    }catch(error){ console.warn("RecordWatch price validation unavailable",error?.type||error?.name||"unknown"); }
  }
  return {mode,prices_configured:verifiedPrice,webhook_configured:webhook,
    secure_database_configured:persistence,live_enabled:mode==="live"&&liveAllowed,
    ready:Boolean(recordwatchStripe&&verifiedPrice&&webhook&&persistence&&liveAllowed)};
}
// Only this server-side receipt (created by the security migration) can
// authorize Checkout. A configured service-role key alone is insufficient.
async function recordwatchBillingMigrationVerified() {
  if (!packetDatabaseReady()) return false;
  try {
    const rows=await supabaseRest("recordwatch_billing_migration_receipts",{
      query:"?id=in.(20261108010000_recordwatch_stripe_entitlements,20261108020000_recordwatch_lifetime_cases)&select=id"
    });
    return Array.isArray(rows) && rows.length===2;
  } catch {
    return false;
  }
}

// Affiliate beta: intentionally OFF until the owner applies the migration,
// reviews regulated-referral restrictions and explicitly enables the feature.
// No unreviewed auto-payouts. Court deposits are never commissionable.
function affiliateProgramEnabled() {
  return process.env.AFFILIATE_PROGRAM_ENABLED === "true";
}
async function affiliateMigrationReceiptVerified() {
  if (!packetDatabaseReady()) return false;
  try {
    const rows=await supabaseRest("affiliate_program_migrations",{
      query:"?id=eq.20261108030000_affiliate_referrals&select=id&limit=1"
    });
    return Array.isArray(rows) && rows.length===1;
  }catch{return false;}
}
async function affiliateProgramMigrationReady() {
  return affiliateProgramEnabled() && await affiliateMigrationReceiptVerified();
}
async function affiliatePartnerForCode(raw) {
  const code=normalizeAffiliateCode(raw);
  if(!code)return null;
  const rows=await supabaseRest("affiliate_partners",{
    query:"?code=eq."+encodeURIComponent(code)+"&status=eq.approved&compliance_approved_at=not.is.null&limit=1"
  });
  return Array.isArray(rows)?rows[0]||null:null;
}
async function claimAffiliateReferral(userId,rawCode) {
  if(!await affiliateProgramMigrationReady())return {claimed:false,reason:"not_enabled"};
  const code=normalizeAffiliateCode(rawCode);
  if(!code)return {claimed:false,reason:"invalid_code"};
  const partner=await affiliatePartnerForCode(code);
  if(!partner || partner.user_id===userId)return {claimed:false,reason:"not_eligible"};
  const previous=await supabaseRest("affiliate_referrals",{
    query:"?referred_user_id=eq."+encodeURIComponent(userId)+"&limit=1"
  });
  if(Array.isArray(previous)&&previous[0])
    return {claimed:previous[0].partner_id===partner.id,reason:"already_attributed"};
  // No retroactive credit for customers who bought lifetime Premium before referral.
  const purchases=await supabaseRest("recordwatch_lifetime_cases",{
    query:"?user_id=eq."+encodeURIComponent(userId)+"&select=id&limit=1"
  });
  if(Array.isArray(purchases)&&purchases.length)return {claimed:false,reason:"existing_customer"};
  await supabaseRest("affiliate_referrals",{
    method:"POST",query:"?on_conflict=referred_user_id",
    prefer:"resolution=ignore-duplicates,return=representation",
    body:{partner_id:partner.id,referred_user_id:userId,source:"partner_link"}
  });
  return {claimed:true};
}
async function recordAffiliateCommission(session,product,referredUserId,serviceFeeCents) {
  if(!affiliateProgramEnabled())return null;
  if(!await affiliateProgramMigrationReady())throw new Error("Affiliate tables not ready");
  const pi=typeof session?.payment_intent==="string" ? session.payment_intent : session?.payment_intent?.id;
  if(session?.payment_status!=="paid" || session?.status!=="complete" ||
     session?.mode!=="payment" || session?.currency!=="usd" ||
     !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session?.id||"") ||
     !/^pi_[a-zA-Z0-9]+$/.test(pi||"") || !isUuid(referredUserId))
    return null;
  const referrals=await supabaseRest("affiliate_referrals",{
    query:"?referred_user_id=eq."+encodeURIComponent(referredUserId)+"&limit=1"
  });
  const ref=Array.isArray(referrals)?referrals[0]:null;
  if(!ref)return null;
  const partners=await supabaseRest("affiliate_partners",{
    query:"?id=eq."+encodeURIComponent(ref.partner_id)+
      "&status=eq.approved&compliance_approved_at=not.is.null&limit=1"
  });
  const partner=Array.isArray(partners)?partners[0]:null;
  const paidAt=new Date(Number(session.created)*1000).toISOString();
  if(!partner||partner.user_id===referredUserId||
     !eligibleAffiliatePurchase(ref.attributed_at,paidAt,AFFILIATE_ATTRIBUTION_DAYS))
    return null;
  const cents=affiliateCommissionCents(product,serviceFeeCents,partner.commission_bps);
  if(cents<1)return null;
  const rows=await supabaseRest("affiliate_commissions",{
    method:"POST",query:"?on_conflict=stripe_checkout_session_id",
    prefer:"resolution=ignore-duplicates,return=representation",
    body:{
      partner_id:partner.id,referral_id:ref.id,
      stripe_checkout_session_id:session.id,stripe_payment_intent_id:pi,
      product,service_fee_cents:serviceFeeCents,commission_bps:partner.commission_bps,
      commission_cents:cents,currency:"usd",status:"pending",earned_at:paidAt,
      available_after:commissionAvailableAfter(paidAt,AFFILIATE_HOLD_DAYS)
    }
  });
  return Array.isArray(rows)?rows[0]||null:null;
}
async function voidAffiliateCommission(paymentIntent,reason) {
  if(!affiliateProgramEnabled()||!await affiliateProgramMigrationReady())return;
  if(!/^pi_[a-zA-Z0-9]+$/.test(paymentIntent||""))return;
  await supabaseRest("affiliate_commissions",{
    method:"PATCH",
    query:"?stripe_payment_intent_id=eq."+encodeURIComponent(paymentIntent)+
      "&status=in.(pending,approved)",
    body:{status:"void",voided_at:new Date().toISOString(),void_reason:reason}
  });
}
function affiliateApi(handler){
  return (req,res)=>Promise.resolve(handler(req,res)).catch(error=>{
    console.warn("Affiliate endpoint unavailable",error?.name||"unknown");
    if(!res.headersSent)res.status(503).json({ok:false,error:"Partner service unavailable. Please retry later."});
  });
}
app.get("/api/affiliates/readiness",affiliateApi(async(req,res)=>{
  const configured=affiliateProgramEnabled();
  const migrationVerified=await affiliateMigrationReceiptVerified();
  const ready=configured && migrationVerified;
  res.setHeader("Cache-Control","no-store");
  return res.json({applications_open:ready,referral_tracking_enabled:ready,
    automatic_payouts_enabled:false,commission_percent:20,
    paid_service_only:true,requires_partner_approval:true,
    configuration_enabled:configured,migration_verified:migrationVerified,
    blocker:ready?null:!configured?"Cloud Run flag AFFILIATE_PROGRAM_ENABLED is not true":
      "Private affiliate migration receipt is not accessible"});
}));
app.get("/api/affiliates/me",affiliateApi(async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  if(!await affiliateProgramMigrationReady())
    return res.status(503).json({ok:false,error:"Partner enrollment is not yet open."});
  const partners=await supabaseRest("affiliate_partners",{
    query:"?user_id=eq."+encodeURIComponent(user.id)+"&limit=1"
  });
  const partner=Array.isArray(partners)?partners[0]:null;
  let totals={pending_cents:0,approved_cents:0,paid_cents:0,void_cents:0,referrals:0,eligible_cents:0};
  if(partner){
    const [commissions,referrals]=await Promise.all([
      supabaseRest("affiliate_commissions",{query:"?partner_id=eq."+encodeURIComponent(partner.id)+
        "&select=commission_cents,status,available_after,payout_batch_id"}),
      supabaseRest("affiliate_referrals",{query:"?partner_id=eq."+encodeURIComponent(partner.id)+"&select=id"})
    ]);
    totals.referrals=Array.isArray(referrals)?referrals.length:0;
    totals.eligible_cents=affiliatePayoutAmount(commissions);
    for(const row of Array.isArray(commissions)?commissions:[]){
      const key=({pending:"pending_cents",approved:"approved_cents",paid:"paid_cents",void:"void_cents"})[row.status];
      if(key)totals[key]+=Number(row.commission_cents)||0;
    }
  }
  res.setHeader("Cache-Control","no-store, private");
  return res.json({ok:true,partner:partner?{
    display_name:partner.display_name,code:partner.status==="approved"?partner.code:null,
    status:partner.status,commission_percent:partner.commission_bps/100,
    payout_onboarding_started:Boolean(partner.stripe_recipient_account_id),
    payouts_paused:partner.payouts_paused!==false,
    referral_link:partner.status==="approved"?
      "https://recordpathai.com/?ref="+encodeURIComponent(partner.code):null
  }:null,totals});
}));
app.post("/api/affiliates/apply",affiliateApi(async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  if(!await affiliateProgramMigrationReady())
    return res.status(503).json({ok:false,error:"Partner enrollment is not yet open."});
  if(req.body?.accept_disclosures!==true)
    return res.status(400).json({ok:false,error:"Partner disclosures and terms must be accepted."});
  const name=safe(req.body?.display_name).slice(0,120);
  const type=safe(req.body?.partner_type);
  const types=["creator","publisher","community_business","nonprofit","other"];
  const audience=safe(req.body?.audience_description).slice(0,800);
  const rawWebsite=safe(req.body?.website);
  let website=null;
  if(rawWebsite){
    try {
      const u=new URL(rawWebsite);
      if(u.protocol!=="https:"||u.username||u.password||rawWebsite.length>250)
        throw Error("Invalid partner website");
      website=u.origin+u.pathname;
    }catch{return res.status(400).json({ok:false,error:"Enter a valid HTTPS website or leave it blank."});}
  }
  if(name.length<2||!types.includes(type)||audience.length<12)
    return res.status(400).json({ok:false,error:"Enter your partner name, type and audience description."});
  const current=await supabaseRest("affiliate_partners",{
    query:"?user_id=eq."+encodeURIComponent(user.id)+"&limit=1"
  });
  if(Array.isArray(current)&&current[0])
    return res.status(409).json({ok:false,error:"An application already exists for this account."});
  const rows=await supabaseRest("affiliate_partners",{
    method:"POST",
    body:{user_id:user.id,code:newAffiliateCode(user.id),display_name:name,
      partner_type:type,website,audience_description:audience,status:"pending",
      commission_bps:AFFILIATE_COMMISSION_BPS},
    prefer:"return=representation"
  });
  return res.status(201).json({ok:true,status:"pending",partner_id:rows?.[0]?.id,
    note:"Manual compliance review is required before a referral link becomes active."});
}));
app.post("/api/affiliates/claim",affiliateApi(async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  if(!await affiliateProgramMigrationReady())
    return res.status(503).json({ok:false,error:"Referral attribution is not enabled."});
  const result=await claimAffiliateReferral(user.id,req.body?.referral_code);
  return res.status(result.claimed?200:409).json({ok:result.claimed,...result});
}));
// Secure affiliate recipient onboarding and owner-reviewed payouts.
registerAffiliatePayoutRoutes(app,{
  requireApiUser,requireOperationsKey,supabaseRest,
  affiliateApi,affiliateProgramMigrationReady,packetDatabaseReady,isUuid,
  stripe,recordwatchStripe,affiliateCommissionCents
});
app.get("/api/recordwatch/database-readiness",async(req,res)=>{
  const migration_verified=await recordwatchBillingMigrationVerified();
  res.setHeader("Cache-Control","no-store");
  return res.status(migration_verified?200:503).json({
    migration_verified,ready:migration_verified
  });
});

app.get("/api/recordwatch/billing-readiness",async(req,res)=>{
  const status=await recordwatchBillingReadiness();
  res.setHeader("Cache-Control","no-store");
  return res.status(status.ready?200:503).json(status);
});

app.post("/api/recordwatch/checkout", async (req, res) => {
  try {
    const user=await recordwatchAuthToken(req,res);
    if(!user)return;
    if(!(await recordwatchBillingReadiness()).ready || !await recordwatchBillingMigrationVerified())
      return res.status(503).json({ok:false,error:"RecordWatch lifetime checkout is not configured. No charge was created."});
    if(req.body?.plan && req.body.plan!=="lifetime_case")
      return res.status(400).json({ok:false,error:"RecordWatch Premium is $39 once per saved case; subscriptions are no longer sold."});
    const savedCaseId=safe(req.body?.saved_case_id||req.body?.savedCaseId);
    if(!isUuid(savedCaseId))return res.status(400).json({ok:false,error:"Save and select a case before purchasing lifetime RecordWatch."});
    await getSavedCaseReviewFacts(user.id,savedCaseId);
    const current=await getRecordwatchLifetimeCase(user.id,savedCaseId);
    if(lifetimeCaseEntitled(current,savedCaseId))
      return res.status(409).json({ok:false,error:"Lifetime RecordWatch is already paid for this case. No additional purchase needed.",alreadyPurchased:true});
    const legacy=await getActiveRecordwatchSubscription(user.id);
    if(legacy)return res.status(409).json({ok:false,error:"Your existing RecordWatch subscription is still active. Manage that subscription before buying lifetime monitoring.",manageBilling:true});
    if(affiliateProgramEnabled() && normalizeAffiliateCode(req.body?.referral_code))
      await claimAffiliateReferral(user.id,req.body.referral_code);
    const priceId=process.env[RECORDWATCH_LIFETIME_PRICE_ENV];
    assertRecordwatchLifetimePrice(await recordwatchStripe.prices.retrieve(priceId));
    const base=getBaseUrl(req);
    const metadata={product:"premium_recordwatch_lifetime",plan:"lifetime_case",
      user_id:user.id,saved_case_id:savedCaseId,price_id:priceId};
    const checkout={
      mode:"payment",ui_mode:"hosted",
      client_reference_id:user.id,
      success_url:base+"/recordwatch-dashboard.html?caseId="+encodeURIComponent(savedCaseId)+"&recordwatch=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:base+"/recordwatch-dashboard.html?caseId="+encodeURIComponent(savedCaseId)+"&recordwatch=cancelled",
      line_items:[{price:priceId,quantity:1}],metadata,
      payment_intent_data:{metadata}
    };
    if(current?.stripe_customer_id)checkout.customer=current.stripe_customer_id;
    else checkout.customer_email=user.email||undefined;
    const bucket=Math.floor(Date.now()/300000);
    const idempotencyKey=createHash("sha256").update("recordwatch-lifetime:"+user.id+":"+savedCaseId+":"+bucket).digest("hex");
    const session=await recordwatchStripe.checkout.sessions.create(checkout,{idempotencyKey});
    if(!session.url||!session.id)return res.status(502).json({ok:false,error:"Stripe did not create a checkout link."});
    return res.json({ok:true,url:session.url,sessionId:session.id});
  }catch(error){
    console.warn("RecordWatch lifetime checkout unavailable",error?.type||error?.name||"unknown");
    return res.status(error.status||503).json({ok:false,error:error.status===503?error.message:"Unable to start secure lifetime checkout. Please confirm your saved case."});
  }
});

app.post("/api/recordwatch/verify-checkout", async (req, res) => {
  try {
    const user=await recordwatchAuthToken(req,res);
    if(!user)return;
    if(!await recordwatchBillingMigrationVerified())
      return res.status(503).json({ok:false,error:"Lifetime database migration is not applied."});
    const caseId=safe(req.body?.saved_case_id||req.body?.case_id);
    const sessionId=safe(req.body?.session_id||req.body?.sessionId);
    const session=await verifiedRecordwatchLifetimeSession(sessionId,user.id,caseId);
    const result=await upsertRecordwatchLifetimeCase(session);
    const matchingPayment=result.stripe_checkout_session_id===session.id && lifetimeCaseEntitled(result,caseId);
    const ledgerEntry=matchingPayment
      ? await createRecordwatchLedgerEntryFromSession(user.id,session,"lifetime_case") : null;
    if(matchingPayment)await recordAffiliateCommission(session,"recordwatch_lifetime",user.id,RECORDWATCH_LIFETIME_CENTS);
    return res.json({ok:true,subscription:lifetimeAsSubscription(result),
      premium:lifetimeCaseEntitled(result,caseId),ledgerEntry,duplicate:ledgerEntry?.duplicate===true});
  }catch(error){
    console.warn("RecordWatch lifetime verification unavailable",error?.type||error?.name||"unknown");
    return res.status(error.status||503).json({ok:false,error:"Payment verification is unavailable. Do not repurchase; please retry verification."});
  }
});

app.get("/api/recordwatch/subscription", async (req, res) => {
  try {
    const user=await recordwatchAuthToken(req,res);
    if(!user)return;
    const caseId=safe(req.query?.saved_case_id||req.query?.case_id);
    if(caseId && !isUuid(caseId))return res.status(400).json({ok:false,error:"Valid saved case required."});
    const lifetime=caseId ? await getRecordwatchLifetimeCase(user.id,caseId) : null;
    const legacy=await getActiveRecordwatchSubscription(user.id);
    const subscription=lifetimeCaseEntitled(lifetime,caseId)
      ? lifetimeAsSubscription(lifetime) : legacy;
    res.setHeader("Cache-Control","no-store, private");
    return res.json({ok:true,premium:Boolean(subscription),subscription:subscription||null,
      plan:subscription?.plan||"free",status:subscription?.status||"free",
      saved_case_id:caseId||null,current_period_end:subscription?.current_period_end||null});
  }catch{
    return res.status(503).json({ok:false,error:"RecordWatch billing status is temporarily unavailable."});
  }
});

// Stripe Customer Portal handles payment-method changes, invoices and cancellation.
app.post("/api/recordwatch/billing-portal", async (req, res) => {
  try {
    const user=await recordwatchAuthToken(req,res);
    if(!user)return;
    if(!recordwatchStripe)return res.status(503).json({ok:false,error:"Stripe billing is not configured."});
    const current=await getRecordwatchBillingRow(user.id);
    if(!current?.stripe_customer_id||!current?.stripe_subscription_id)
      return res.status(404).json({ok:false,error:"No RecordWatch billing account was found."});
    const session=await recordwatchStripe.billingPortal.sessions.create({
      customer:current.stripe_customer_id,
      return_url:getBaseUrl(req)+"/recordwatch-dashboard.html"
    });
    return res.json({ok:true,url:session.url});
  }catch(error){
    console.warn("RecordWatch billing portal unavailable",error?.type||error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Unable to open the secure billing portal."});
  }
});

app.post("/api/recordwatch/cancel", async (req, res) => {
  try {
    const user=await recordwatchAuthToken(req,res);
    if(!user)return;
    if(!recordwatchStripe)return res.status(503).json({ok:false,error:"Stripe billing is not configured."});
    const current=await getActiveRecordwatchSubscription(user.id);
    if(!current?.stripe_subscription_id)
      return res.status(404).json({ok:false,error:"No active Premium subscription found."});
    const updated=await recordwatchStripe.subscriptions.update(current.stripe_subscription_id,{cancel_at_period_end:true});
    const subscription=await syncVerifiedRecordwatchStripeSubscription(updated);
    return res.json({ok:true,subscription});
  }catch(error){
    return res.status(503).json({ok:false,error:"Could not cancel the subscription at Stripe. No change has been confirmed."});
  }
});

// Alert delivery is never enabled merely because Stripe Premium is active.
// The operator applies the opt-in migration, verifies each provider and
// schedules an authenticated daily job before setting LIVE_ENABLED=true.
async function recordwatchAlertMigrationReady(){
  if(!packetDatabaseReady())return false;
  try{
    const rows=await supabaseRest("recordwatch_alert_migration_receipts",{
      query:"?id=eq.20261108040000_recordwatch_premium_delivery&select=id&limit=1"
    });
    return Array.isArray(rows)&&rows.length===1;
  }catch{return false;}
}
function alertsLiveReady(r,db){
  return Boolean(r.enabled && db && (r.email_ready||r.sms_ready));
}
app.get("/api/recordwatch/alerts/readiness",async(req,res)=>{
  const providers=providerReadiness(process.env);
  const migration_verified=await recordwatchAlertMigrationReady();
  res.setHeader("Cache-Control","no-store");
  return res.json({...providers,migration_verified,
    ready:alertsLiveReady(providers,migration_verified),
    daily_scheduler_configured:Boolean((process.env.RECORDWATCH_ALERTS_SCHEDULER_KEY||"").length>=32),
    preview_only:!alertsLiveReady(providers,migration_verified)});
});
async function alertRecipientEmail(userId){
  const config=supabaseRestConfig();
  if(!config||!process.env.SUPABASE_SERVICE_ROLE_KEY)return "";
  const response=await fetch(config.url+"/auth/v1/admin/users/"+encodeURIComponent(userId),{
    headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error("Recipient's authenticated email unavailable");
  const json=await response.json();
  return json.email_confirmed_at && validAlertEmail(json.email)?json.email:"";
}
async function verifyPremiumAlertPayment(row){
  if(!recordwatchStripe||!row||row.status!=="active"||row.revoked_at)return false;
  try{
    const intent=await recordwatchStripe.paymentIntents.retrieve(
      row.stripe_payment_intent_id,{expand:["latest_charge"]});
    const charge=typeof intent.latest_charge==="string"
      ?await recordwatchStripe.charges.retrieve(intent.latest_charge):intent.latest_charge;
    return intent.status==="succeeded" && intent.currency==="usd" &&
      intent.amount_received===RECORDWATCH_LIFETIME_CENTS &&
      !charge?.refunded && !charge?.disputed && Number(charge?.amount_refunded||0)===0 &&
      intent.metadata?.product==="premium_recordwatch_lifetime" &&
      intent.metadata?.user_id===row.user_id &&
      intent.metadata?.saved_case_id===row.saved_case_id;
  }catch(error){
    console.warn("RecordWatch alert payment verification unavailable",error?.type||error?.name||"unknown");
    return false;
  }
}
async function sendCasePremiumAlert({userId,caseId,kind,date,channel,today}){
  const r=providerReadiness(process.env);
  if(!(await recordwatchAlertMigrationReady())||
    !(channel==="email"?r.email_ready:r.sms_ready))return {status:"provider_unavailable"};
  const [lifetime,preferences]=await Promise.all([
    getRecordwatchLifetimeCase(userId,caseId),
    supabaseRest("recordwatch_notification_preferences",{query:"?user_id=eq."+
      encodeURIComponent(userId)+"&saved_case_id=eq."+encodeURIComponent(caseId)+"&limit=1"})
  ]);
  const prefs=Array.isArray(preferences)?preferences[0]||null:null;
  const suppressed=channel==="sms" && prefs?.phone_number
    ?await supabaseRest("recordwatch_sms_suppressions",{
      query:"?phone_number=eq."+encodeURIComponent(prefs.phone_number)+"&limit=1"
    }):[];
  if(!isPremiumAlertAllowed({lifetime,caseId,prefs,channel,
      phoneSuppressed:Array.isArray(suppressed)&&suppressed.length>0}))
    return {status:"not_consented_or_not_paid"};
  if(!await verifyPremiumAlertPayment(lifetime))return {status:"payment_not_verified"};
  const recipient=channel==="email"?await alertRecipientEmail(userId):prefs.phone_number;
  if(!(channel==="email"?validAlertEmail(recipient):validSmsPhone(recipient)))
    return {status:"recipient_unverified"};
  const reservation=await supabaseRest("recordwatch_alert_deliveries",{
    method:"POST",
    query:"?on_conflict=saved_case_id,kind,channel,eligibility_date,reminder_on",
    prefer:"resolution=ignore-duplicates,return=representation",
    body:{user_id:userId,saved_case_id:caseId,kind,channel,
      eligibility_date:date,reminder_on:today,
      provider:channel==="email"?"resend":"twilio",status:"reserved"}
  });
  const entry=Array.isArray(reservation)?reservation[0]:null;
  if(!entry)return {status:"already_reserved"};
  try{
    const text=neutralAlertContent(kind,channel);
    const receipt=channel==="email"
      ?await sendPremiumEmail({to:recipient,subject:text.subject,message:text.message})
      :await sendPremiumSms({to:recipient,message:text.message});
    await supabaseRest("recordwatch_alert_deliveries",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(entry.id),
      body:{status:"provider_accepted",provider_message_id:receipt.id,
        updated_at:new Date().toISOString()}
    });
    return {status:"provider_accepted"};
  }catch(error){
    // Do not auto-retry ambiguous provider results: they can send duplicates.
    await supabaseRest("recordwatch_alert_deliveries",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(entry.id),
      body:{status:"failed_review",updated_at:new Date().toISOString()}
    }).catch(()=>{});
    console.warn("Premium message needs delivery review",error?.name||"unknown");
    return {status:"failed_review"};
  }
}
async function runPaidRecordwatchAlerts(){
  const providers=providerReadiness(process.env);
  if(!alertsLiveReady(providers,await recordwatchAlertMigrationReady()))
    throw new Error("Premium alerts not activated");
  const now=new Date().toISOString(),today=now.slice(0,10);
  const paidCases=await supabaseRest("recordwatch_lifetime_cases",{
    query:"?status=eq.active&revoked_at=is.null&select=user_id,saved_case_id,status,revoked_at,amount_cents,currency,stripe_checkout_session_id,stripe_payment_intent_id&limit=1000"
  });
  const totals={cases_checked:0,provider_accepted:0,already_reserved:0,skipped:0,
    failed_review:0,more_cases_possible:paidCases.length===1000};
  for(const entitlement of paidCases){
    totals.cases_checked++;
    const caseRows=await supabaseRest("saved_cases",{
      query:"?id=eq."+encodeURIComponent(entitlement.saved_case_id)+
        "&user_id=eq."+encodeURIComponent(entitlement.user_id)+
        "&select=id,eligibility_date&limit=1"
    });
    const date=Array.isArray(caseRows)?caseRows[0]?.eligibility_date:null;
    const reminder=reminderForDate(date,today);
    if(!reminder){totals.skipped++;continue;}
    for(const channel of ["email","sms"]){
      const outcome=await sendCasePremiumAlert({
        userId:entitlement.user_id,caseId:entitlement.saved_case_id,
        kind:reminder.kind,date:String(date).slice(0,10),channel,today
      });
      if(outcome.status==="provider_accepted")totals.provider_accepted++;
      else if(outcome.status==="already_reserved")totals.already_reserved++;
      else if(outcome.status==="failed_review")totals.failed_review++;
      else totals.skipped++;
    }
  }
  return totals;
}
app.post("/api/operator/recordwatch/run-alerts",async(req,res)=>{
  const expected=process.env.RECORDWATCH_ALERTS_SCHEDULER_KEY||"";
  const supplied=req.get("x-recordwatch-alerts-key")||"";
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  if(expected.length<32||a.length!==b.length||!timingSafeEqual(a,b))
    return res.status(403).json({ok:false,error:"Authorized alert scheduler only."});
  if(!await recordwatchAlertMigrationReady())
    return res.status(503).json({ok:false,error:"Premium alert migration is not verified."});
  if(!providerReadiness(process.env).enabled)
    return res.status(503).json({ok:false,error:"Premium alert dispatch is disabled."});
  try{
    const result=await runPaidRecordwatchAlerts();
    return res.json({ok:true,...result});
  }catch(error){
    console.warn("RecordWatch premium alert scheduler failure",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Alert run requires operator review."});
  }
});

// Account-owner-initiated delivery test. Uses only their verified account
// email or expressly consented phone; never accepts arbitrary destinations.
app.post("/api/recordwatch/alerts/test",async(req,res)=>{
  const user=await requireApiUser(req,res);
  if(!user)return;
  const caseId=safe(req.body?.case_id);
  const channel=safe(req.body?.channel);
  if(!isUuid(caseId)||!["email","sms"].includes(channel))
    return res.status(400).json({ok:false,error:"Select a saved case and email or SMS."});
  const config=providerReadiness(process.env);
  if(!await recordwatchAlertMigrationReady()||
     !(channel==="email"?config.email_ready:config.sms_ready))
    return res.status(503).json({ok:false,
      error:"This alert provider is not approved and activated yet."});
  try{
    const owner=await supabaseRest("saved_cases",{query:"?id=eq."+
      encodeURIComponent(caseId)+"&user_id=eq."+encodeURIComponent(user.id)+
      "&select=id,eligibility_date&limit=1"});
    if(!Array.isArray(owner)||!owner[0])
      return res.status(404).json({ok:false,error:"Saved case not found."});
    const today=new Date().toISOString().slice(0,10);
    const date=String(owner[0].eligibility_date||today).slice(0,10);
    const result=await sendCasePremiumAlert({userId:user.id,caseId,
      kind:"test",date,channel,today});
    res.setHeader("Cache-Control","no-store, private");
    return res.status(result.status==="provider_accepted"?200:409)
      .json({ok:result.status==="provider_accepted",
        status:result.status,message:result.status==="provider_accepted"
          ?"Provider accepted a test message. Check the destination; this is not confirmed delivery."
          :"No message was sent. Confirm paid case, consent and provider status."});
  }catch(error){
    console.warn("Premium test alert unavailable",error?.name||"unknown");
    return res.status(503).json({ok:false,error:"Test delivery could not be verified."});
  }
});

app.get("/api/recordwatch/premium-preferences", async (req, res) => {
  try {
    const user = await recordwatchAuthToken(req, res);
    if (!user) return;
    const preferences = await getRecordwatchPreferences(user.id,safe(req.query?.saved_case_id));
    res.json({ ok: true, preferences });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/recordwatch/premium-preferences", async (req, res) => {
  try {
    const user = await recordwatchAuthToken(req, res);
    if (!user) return;
    const caseId=safe(req.body?.saved_case_id||req.body?.savedCaseId);
    if(caseId && !isUuid(caseId))return res.status(400).json({ok:false,error:"Valid saved case is required."});
    const preferences = await saveRecordwatchPreferences(user.id, req.body || {});
    res.setHeader("Cache-Control","no-store, private");
    res.json({ ok: true, preferences });
  } catch (error) {
    res.status(error?.status||503).json({ ok: false, error: error.message });
  }
});

// Twilio's inbound opt-out webhooks MUST be signed. The public endpoint cannot
// let arbitrary callers disable someone's SMS alerts.
app.post("/api/recordwatch/inbound-sms",
  express.urlencoded({extended:false,limit:"16kb"}),async(req,res)=>{
  const token=process.env.TWILIO_AUTH_TOKEN||"";
  const canonical=process.env.TWILIO_WEBHOOK_URL||
    "https://recordpathai.com/api/recordwatch/inbound-sms";
  const signature=req.get("X-Twilio-Signature")||"";
  if(!token||!validTwilioWebhookSignature({
    url:canonical,params:req.body,signature,authToken:token
  }))return res.status(403).json({ok:false,error:"Invalid provider signature."});
  const payload=req.body||{};
  if(payload.AccountSid!==process.env.TWILIO_ACCOUNT_SID)
    return res.status(403).json({ok:false,error:"Wrong provider account."});
  const phone=canonicalSmsPhone(payload.From);
  const body=safe(payload.Body).trim().toUpperCase();
  if(!phone || (!STOP_WORDS.has(body) && body!=="START" && body!=="UNSTOP"))
    return res.status(200).type("text/xml").send("<Response/>");
  if(!packetDatabaseReady())return res.status(503).send("Messaging preference database unavailable.");
  const now=new Date().toISOString();
  try{
    if(STOP_WORDS.has(body)){
      await supabaseRest("recordwatch_sms_suppressions",{
        method:"POST",query:"?on_conflict=phone_number",
        prefer:"resolution=merge-duplicates,return=representation",
        body:{phone_number:phone,opted_out_at:now,source:"twilio_signed_stop"}
      });
      await supabaseRest("recordwatch_notification_preferences",{
        method:"PATCH",query:"?phone_number=eq."+encodeURIComponent(phone),
        body:{sms_enabled:false,sms_opted_out_at:now,sms_consent_at:null,updated_at:now}
      });
    }else{
      // Replying START removes the global provider-level block. Preferences
      // remain OFF until the customer actively reconsents on the dashboard.
      await supabaseRest("recordwatch_sms_suppressions",{
        method:"DELETE",query:"?phone_number=eq."+encodeURIComponent(phone)
      });
      await supabaseRest("recordwatch_notification_preferences",{
        method:"PATCH",query:"?phone_number=eq."+encodeURIComponent(phone),
        body:{sms_enabled:false,sms_opted_out_at:null,sms_consent_at:null,updated_at:now}
      });
    }
    for(const pref of recordwatchMemory.preferences){
      if(canonicalSmsPhone(pref.phone_number||pref.notification_phone)===phone){
        pref.sms_enabled=false;pref.sms_consent_at=null;
        pref.sms_opted_out_at=STOP_WORDS.has(body)?now:null;
      }
    }
    return res.status(200).type("text/xml").send("<Response/>");
  }catch(error){
    console.warn("Signed Twilio opt-out persistence unavailable",error?.name||"unknown");
    return res.status(503).send("Preference update could not be confirmed.");
  }
});

app.post("/api/recordwatch/subscribe", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  try {
    const subscription = upsertRecordwatchSubscription(req.body || {});
    let event = null;
    if ((req.body || {}).eligibility_date || (req.body || {}).eligibilityDate) event = upsertRecordwatchEvent(Object.assign({}, req.body, { user_id: subscription.user_id, case_id: subscription.case_id }));
    res.json({ ok: true, persistence: supabaseRestConfig() ? "supabase" : "memory", subscription, event });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/recordwatch/subscriptions", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("recordwatch_subscriptions", userId);
  const rows = supabaseRows || recordwatchMemory.subscriptions.filter((item) => item.user_id === userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", subscriptions: rows });
});

app.post("/api/recordwatch/eligibility-event", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  try {
    const event = upsertRecordwatchEvent(req.body || {});
    res.json({ ok: true, persistence: supabaseRestConfig() ? "supabase" : "memory", event });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/recordwatch/events", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("recordwatch_eligibility_events", userId);
  const rows = supabaseRows || recordwatchMemory.events.filter((item) => item.user_id === userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", events: rows });
});

app.get("/api/recordwatch/notifications", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("recordwatch_notifications", userId);
  const rows = supabaseRows || recordwatchMemory.notifications.filter((item) => item.user_id === userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", notifications: rows });
});

app.get("/api/recordwatch/preferences", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("user_notification_preferences", userId);
  const preference = supabaseRows && supabaseRows[0] ? supabaseRows[0] : getMemoryPreferences(userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", preferences: preference });
});

app.post("/api/recordwatch/preferences", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  try {
    const preferences = upsertMemoryPreferences(req.body || {});
    await persistRecordwatchRow("user_notification_preferences", preferences, "user_id");
    res.json({ ok: true, persistence: supabaseRestConfig() ? "supabase" : "memory", preferences });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/recordwatch/court-status", async (req, res) => {
  const authorizedUser = await requireApiUser(req, res);
  if (!authorizedUser) return;
  if (req.method === "GET") req.query.user_id = authorizedUser.id;
  else req.body = { ...(req.body || {}), user_id: authorizedUser.id, userId: authorizedUser.id };
  try {
    const payload = req.body || {};
    const status = normalizeRecordwatchStatus(payload.status);
    if (!COURT_STATUS_VALUES.includes(status)) return res.status(400).json({ ok: false, error: "Unsupported court status" });
    const userId = safe(payload.user_id || payload.userId, "demo-user");
    const caseId = safe(payload.case_id || payload.caseId, "demo-case");
    // Browser users cannot label their own status as an official court event.
    const source = "manual";
    const previous = recordwatchMemory.courtStatuses.get(`${userId}:${caseId}`);
    recordwatchMemory.courtStatuses.set(`${userId}:${caseId}`, status);
    const subscription = recordwatchMemory.subscriptions.find((item) => item.user_id === userId && item.case_id === caseId && item.status === "active") || {
      user_id: userId,
      case_id: caseId,
      notification_email: payload.notification_email,
      notification_phone: payload.notification_phone,
      notify_email: true,
      notify_sms: false,
      plan_type: "free",
      premium_active: false
    };
    const type = COURT_STATUS_NOTIFICATION_TYPES[status];
    const notifications = await createRecordwatchNotification(subscription, type, {
      status,
      note: payload.note,
      court_id: payload.court_id || payload.courtId,
      hearing_date: payload.hearing_date || payload.hearingDate,
      source,
      admin_override: false,
      notification_date: `${caseId}:${status}:${recordwatchDateOnly(new Date())}`
    });
    res.json({ ok: true, previous_status: previous || null, status, source, notifications });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/recordwatch/run-daily", async (req, res) => {
  if(process.env.RECORDWATCH_ALERTS_LIVE_ENABLED==="true")
    return res.status(409).json({ok:false,error:"Legacy demo scheduler is disabled for live alerts."});
  if (!isAdminRequest(req)) return res.status(403).json({ ok: false, error: "Admin access required" });
  try {
    res.json({ ok: true, result: await runRecordwatchDailyJob() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/recordwatch/admin-summary", async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ ok: false, error: "Admin access required" });
  res.json({ ok: true, summary: await recordwatchAdminSummary() });
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const checkoutUser = await requireApiUser(req, res);
    if (!checkoutUser) return;
    if (!stripe) {
      return res.status(503).json({ error: "Stripe checkout is not configured" });
    }

    const {
      amount = 5000,
      currency = "usd",
      productType = "record-sealing-packet",
      applicant = {},
      caseInfo = {},
      eligibility = {},
      recordwatchAddon = false,
      successUrl,
      cancelUrl
    } = req.body || {};

    try { assertFixedPacketAmount(amount, currency); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const numericAmount = PACKET_PRICE_CENTS;
    // The applicant's browser may suggest a fee category, but never approve
    // a court-fee remittance, eligibility, or a mailing instruction.
    let quote = quotePacketPricing({
      state: caseInfo.caseState || caseInfo.state,
      county: caseInfo.county,
      courtType: caseInfo.courtType || caseInfo.court_type,
      formType: caseInfo.formType || caseInfo.form_type
    });
    // Server-owned case, reviewer release and fee are checked after UUID validation.
    // Browser claims of eligibility or fee cannot authorize a Stripe charge.

    const baseUrl = getBaseUrl(req);

    let finalSuccessUrl, finalCancelUrl;
    try {
      const rawSuccessUrl = safeCheckoutRedirect(successUrl, baseUrl, "/payment-success.html");
      finalSuccessUrl = rawSuccessUrl.includes("session_id=") ? rawSuccessUrl : `${rawSuccessUrl}${rawSuccessUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
      finalCancelUrl = safeCheckoutRedirect(cancelUrl, baseUrl, "/packet.html?payment=cancelled");
    } catch (error) { return res.status(400).json({ error: error.message }); }
    const savedCaseId = safe((req.body || {}).saved_case_id || (req.body || {}).savedCaseId || caseInfo.saved_case_id || caseInfo.savedCaseId);
    const checkoutCaseId = safe((req.body || {}).case_id || (req.body || {}).caseId || caseInfo.case_id || caseInfo.caseId || savedCaseId || caseInfo.caseNumber);
    if (!isUuid(savedCaseId)) {
      return res.status(400).json({ error: "Save your case to your account before checkout" });
    }
    const release=await packetReleaseStatus(checkoutUser.id,savedCaseId);
    if(!release.ready){
      return res.status(409).json({
        error:"Packet checkout is pending verified case review and court-fee setup. No payment has been taken.",
        missing:release.missing,
        quote:release.quote||quote
      });
    }
    quote={...release.quote,canCollect:true};
    // A paid filing already held or sent for the same saved case must not be
    // charged again. A refund/dispute or failed mail needs support review first.
    const priorOrders=await supabaseRest("packet_fulfillment_jobs",{
      query:"?user_id=eq."+encodeURIComponent(checkoutUser.id)+
        "&case_id=eq."+encodeURIComponent(savedCaseId)+
        "&select=status&order=created_at.desc&limit=10"
    });
    if(Array.isArray(priorOrders) && priorOrders.some(order=>
      ["paid_hold","ready_for_dispatch","submitted_to_lob","manual_filing","delivered"].includes(order.status)))
      return res.status(409).json({ok:false,alreadyPurchased:true,
        error:"A verified packet payment already exists for this saved case. Open RecordWatch to check filing progress; do not pay again."});
    // Repeat clicks within the same 5-minute window reuse a single Stripe
    // Checkout Session with exactly matching metadata and redirect URLs.
    const checkoutBucket=Math.floor(Date.now()/300000);
    const checkoutKey=createHash("sha256").update([
      "packet-checkout",checkoutUser.id,savedCaseId,release.caseFingerprint,
      quote.totalCents,finalSuccessUrl,finalCancelUrl,checkoutBucket
    ].join(":")).digest("hex");
    const internalOrderId="packet_"+checkoutKey.slice(0,24);
    const checkoutCaseNumber = safe((req.body || {}).case_number || (req.body || {}).caseNumber || caseInfo.case_number || caseInfo.caseNumber);
    const wantsRecordwatchAddon = recordwatchAddon === true || recordwatchAddon === "true" || (req.body || {}).recordwatch_addon === true || (req.body || {}).recordwatchAddon === true;
    if(wantsRecordwatchAddon)return res.status(400).json({error:"The 12-month RecordWatch add-on has been retired. Purchase $39 lifetime monitoring separately for your saved case."});
    const lineItems = [
      {
        quantity: 1,
        price_data: {
          currency: safe(currency, "usd").toLowerCase(),
          unit_amount: numericAmount,
          product_data: {
            name: "RecordPathAI Packet Preparation",
            description: "Court-ready sealing / expungement packet preparation"
          }
        }
      }
    ];
    // Court fee is an earmarked pass-through line item, not preparation revenue.
    // The review-only Ohio guard above prevents collecting the $100 until the
    // actual filing and disbursement workflow is verified and approved.
    if (quote.courtFeeCents > 0 && quote.canCollect === true) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: quote.courtFeeCents,
          product_data: {
            name: "Court filing deposit",
            description: "Amount payable to filing court; separate from RecordPathAI preparation"
          }
        }
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      ui_mode: "hosted",
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      client_reference_id: internalOrderId,
      customer_email: checkoutUser.email || undefined,
      line_items: lineItems,
      metadata: {
        productType: "record-sealing-packet",
        orderId: internalOrderId,
        serviceFeeCents: String(PACKET_PRICE_CENTS),
        courtFeeCents: String(quote.canCollect && quote.courtFeeCents > 0 ? quote.courtFeeCents : 0),
        courtProfileId:String(release.profileId||""),
        fulfillmentMode:String(release.fulfillmentMode||"") ,
        userId: checkoutUser.id,
        saved_case_id: isUuid(savedCaseId) ? savedCaseId : "",
        case_id: isUuid(checkoutCaseId) ? checkoutCaseId : ""
        // Do not send criminal charges, case numbers, dates or addresses to Stripe metadata.

      }
    },{idempotencyKey:checkoutKey});

    return res.json({
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);

    return res.status(500).json({
      error: error?.message || "Failed to create Stripe checkout session"
    });
  }
});

app.get("/api/find-packet", async (req, res) => {
  try {
    const court = normalizeCourtName(req.query.court);
    const state = normalizeCourtName(req.query.state || "Ohio");
    const type = normalizeCourtName(req.query.type || "sealing");

    if (!court) {
      return res.status(400).json({
        error: "Missing court"
      });
    }

    const shortcut = woodCountyShortcut(court);

    if (shortcut) {
      return res.json(shortcut);
    }

    const queries = buildSearchQueries(court, state, type);
    const allResults = [];

    for (const query of queries) {
      const results = await searchWeb(query);
      allResults.push(...results);
    }

    const deduped = [];
    const seen = new Set();

    for (const result of allResults) {
      if (!result.url || seen.has(result.url)) continue;

      seen.add(result.url);
      deduped.push(result);
    }

    const ranked = deduped
      .map((result) => ({
        ...result,
        _score: scoreResult(result, court)
      }))
      .sort((a, b) => b._score - a._score);

    const best = ranked[0];

    if (!best || best._score < 4) {
      return res.json({
        court,
        packetTitle: "",
        packetUrl: "",
        source: "",
        confidence: 0
      });
    }

    let source = "Official court source";

    try {
      source = new URL(best.url).hostname;
    } catch {}

    return res.json({
      court,
      packetTitle: best.title,
      packetUrl: best.url,
      source,
      confidence: Math.min(0.98, 0.5 + best._score / 20)
    });
  } catch (error) {
    console.error("Packet search error:", error);

    return res.status(500).json({
      error: error?.message || "Could not search for packet"
    });
  }
});

app.get("/api/fetch-pdf", async (req, res) => {
  try {
    const sourceUrl = await validateOfficialPdfSource(req.query.url);
    // Never follow redirects: an official domain might redirect to a private host.
    const pdfResponse = await fetch(sourceUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "application/pdf" }
    });
    const pdf = await readBoundedPdfResponse(pdfResponse);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", "attachment; filename=\"official-court-form.pdf\"");
    return res.send(pdf);
  } catch (error) {
    console.warn("Court PDF proxy request denied:", error?.message || "unknown error");
    return res.status(400).json({
      ok: false,
      error: "Could not fetch this court PDF safely. Open the original official court link instead."
    });
  }
});

// API routes are registered first so the source-file firewall cannot block /api/*.
// Unknown API paths and sensitive directories still fall through to the protected static layer.
// Never expose server source, deployment configuration, tests or internal tooling as public files.
app.use((req, res, next) => {
  const pathname = decodeURIComponent(req.path).toLowerCase();
  const segments = pathname.split("/").filter(Boolean);
  const blockedDirs = new Set([".git", ".github", "node_modules", "supabase", "tools", "tests", "src", "api"]);
  const blockedFiles = new Set(["server.js", "package.json", "package-lock.json", ".env", ".gitignore"]);
  if (segments.some(s => s.startsWith(".") || blockedDirs.has(s)) ||
      segments.some(s => blockedFiles.has(s)) ||
      /\\.(?:js\\.map|ts|sql|yaml|yml|log|bak|key|pem)$/i.test(pathname)) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(process.cwd(), { dotfiles: "deny" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

function scheduleRecordwatchNightlyJob() {
  // The old in-memory loop is NOT reliable on Cloud Run or safe for customer
  // messaging. Run the authenticated database-backed daily worker instead.
  if (process.env.RECORDWATCH_LEGACY_NIGHTLY_ENABLED !== "true") return;
  if (process.env.RECORDWATCH_DISABLE_SCHEDULER === "true") return;
  setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 7) {
      runRecordwatchDailyJob().then((result) => console.log("RecordWatch daily job", result)).catch((error) => console.error("RecordWatch daily job failed", error));
    }
  }, 60 * 60 * 1000);
}

app.listen(port, () => {
  console.log(`RecordPathAI server listening on port ${port}`);
  scheduleRecordwatchNightlyJob();
});
