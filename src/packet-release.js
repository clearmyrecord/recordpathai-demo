import { createHash } from "node:crypto";
import { quotePacketPricing } from "./packet-pricing.js";
import { courtFilingPlan } from "./court-profiles.js";

const REQUIRED_REVIEWS = Object.freeze([
  "identity_verified","official_docket_verified","all_charges_verified",
  "final_discharge_verified","statutory_exclusions_reviewed",
  "filing_instructions_verified","exact_court_form_verified",
  "applicant_signature_verified","filing_authorization_verified"
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
export function validCaseId(value){return UUID.test(String(value||""));}
function stable(value) {
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
// Case fingerprint includes source metadata, charge rows and dates, but excludes
// mutable bookkeeping and contact data. Never return actual criminal record fields.
export function caseReviewFingerprint(savedCase,charges=[]) {
  if(!savedCase || !Array.isArray(charges)) return "";
  const keys=["id","user_id","case_number","case_state","county","court_name","court_type",
    "relief_type","primary_charge","offense_code","offense_level","outcome",
    "disposition_date","sentence_completion_date","probation_completed_date",
    "discharge_date","final_discharge_date","eligibility_status",
    "eligibility_date","metadata"];
  const row=Object.fromEntries(keys.map(k=>[k,savedCase[k]??null]));
  const counts=charges.map(c=>({
    id:c.id,charge_name:c.charge_name,offense_code:c.offense_code,
    offense_level:c.offense_level,offense_date:c.offense_date,
    flags:c.flags||{}
  })).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return createHash("sha256").update(JSON.stringify(stable({case:row,charges:counts}))).digest("hex");
}
export function evaluatePacketRelease({userId,caseId,savedCase,charges,review,now=new Date(),runtime={}}={}) {
  const missing=[];
  if(!validCaseId(caseId)||!validCaseId(userId)||!savedCase||
    savedCase.id!==caseId||savedCase.user_id!==userId)missing.push("Case must belong to the authenticated account.");
  if(!Array.isArray(charges)||!charges.length)missing.push("A reviewed charge inventory is required.");
  const profileInput={
    state:savedCase?.case_state,county:savedCase?.county,
    courtType:savedCase?.court_type,
    formType:review?.form_type
  };
  const quote=quotePacketPricing(profileInput);
  const filing=courtFilingPlan(profileInput);
  if(!filing.supported || quote.totalCents===null)missing.push("An exact mapped court and final form type are required.");
  if(!review||review.status!=="approved")missing.push("A court-specific reviewer release has not been approved.");
  if(review?.user_id!==userId || review?.case_id!==caseId)missing.push("Reviewer release is not bound to this saved case.");
  const fingerprint=caseReviewFingerprint(savedCase,charges);
  if(!SHA.test(review?.case_snapshot_sha256||"")||review.case_snapshot_sha256!==fingerprint)
    missing.push("Case details have changed or no verified case snapshot was approved.");
  if(!SHA.test(review?.signed_pdf_sha256||"") ||
    !/^private\/packets\/[0-9a-f-]+\/[A-Za-z0-9_-]+\.pdf$/.test(review?.signed_pdf_private_path||""))
    missing.push("An approved signed packet in private storage is required.");
  if(!review?.reviewer_id || !review?.reviewed_at ||
    !Number.isFinite(Date.parse(review.reviewed_at)) ||
    new Date(review.reviewed_at)>now ||
    now-new Date(review.reviewed_at)>30*86400*1000)
    missing.push("A dated, current reviewer decision is required.");
  for(const field of REQUIRED_REVIEWS)if(review?.[field]!==true)missing.push("Unverified court/reviewer requirement: "+field.replaceAll("_"," ")+".");
  let courtFeeCents=quote.courtFeeCents;
  if(review?.accepted_fee_waiver===true){
    if(!review?.fee_waiver_evidence)missing.push("Fee-waiver evidence is required.");
    courtFeeCents=0;
  }
  if(!Number.isSafeInteger(courtFeeCents)||courtFeeCents<0 ||
    review?.approved_court_fee_cents!==courtFeeCents)
    missing.push("The court filing amount has not been independently approved.");
  if(courtFeeCents>0){
    if(review?.fee_payment_method!=="lob_check" && review?.fee_payment_method!=="court_online")
      missing.push("A permitted court-fee payment method must be selected.");
    if(review?.fee_payment_method==="lob_check"){
      if(!review?.verified_check_payee)missing.push("The clerk's actual check payee has not been verified.");
      if(!review?.verified_filing_address)missing.push("The clerk's mailing destination has not been verified.");
      if(!runtime.lobLiveEnabled||!runtime.lobVerifiedBank)
        missing.push("Lob live check entitlement and verified funding bank are not available.");
    }
    if(review?.fee_payment_method==="court_online" &&
       !runtime.onlineCourtPaymentVerified)
      missing.push("The court's online payment route has not been verified.");
  }
  if(filing.filingMethod==="physical-only-pending-clerk-confirmation" &&
     review?.fee_payment_method==="court_online")
    missing.push("This court's sealing filings are not approved for electronic submission.");
  if(runtime.stripeLiveEnabled!==true)
    missing.push("Live Stripe checkout has not been explicitly enabled.");
  return {
    ready:missing.length===0,missing,
    quote:{...quote,courtFeeCents,totalCents:Number.isSafeInteger(courtFeeCents)?5000+courtFeeCents:null},
    profileId:filing.profileId,
    caseFingerprint:fingerprint,
    // The applicant's signature and private PDF never appear in this result.
    fulfillmentMode:review?.fee_payment_method||"not_approved"
  };
}
