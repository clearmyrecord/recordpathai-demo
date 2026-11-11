import { findCourtProfile } from "./court-profiles.js";

const HTTPS=/^https:\/\/[a-zA-Z0-9.-]+(?::443)?\//;
const BANK=/^bank_[a-zA-Z0-9]+$/;
export function buildCourtCheckRequest({profileInput,review,from,bankAccount,attachmentUrl,attachmentPages,caseReference,approvedCourtFeeCents}={}){
  const profile=findCourtProfile(profileInput);
  if(!profile)throw new Error("Exact court shipping profile is not verified.");
  if(review?.status!=="approved"||review?.fee_payment_method!=="lob_check"||
     !review?.verified_check_payee || !review?.verified_filing_address)
    throw new Error("Human-verified filing check payee and address are required.");
  const amount=Number(approvedCourtFeeCents);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>50000)
    throw new Error("Court check amount is not approved.");
  if(!BANK.test(bankAccount||""))throw new Error("Verified Lob bank account ID required.");
  if(!HTTPS.test(attachmentUrl||"")||new URL(attachmentUrl).username||new URL(attachmentUrl).password)
    throw new Error("Private signed court PDF needs a temporary HTTPS attachment URL.");
  if(!Number.isInteger(attachmentPages)||attachmentPages<1||attachmentPages>profile.maxAttachmentPages)
    throw new Error("Lob check attachments cannot exceed the verified PDF page limit.");
  const fields=["name","address_line1","address_city","address_state","address_zip"];
  if(!from || fields.some(k=>!String(from[k]||"").trim()))
    throw new Error("Verified RecordPathAI return mailing address is required.");
  return {
    bank_account:bankAccount,
    amount:amount/100,
    to:{...profile.postalAddress,name:review.verified_check_payee},
    from:{name:from.name,address_line1:from.address_line1,
      ...(from.address_line2?{address_line2:from.address_line2}:{}),
      address_city:from.address_city,address_state:from.address_state,
      address_zip:from.address_zip},
    attachment:attachmentUrl,
    mail_type:"usps_first_class",
    message:"Court filing deposit and attached application",
    memo:String(caseReference||"Record sealing").slice(0,40),
    use_type:"operational"
  };
}
export function requireLobLiveDispatch(env={}){
  return env.RECORDPATH_ENABLE_LIVE_DISPATCH==="true" &&
    env.LOB_LIVE_CHECKS_ENABLED==="true" &&
    env.LOB_CHECK_ATTACHMENTS_APPROVED==="true" &&
    String(env.LOB_LIVE_API_KEY||"").startsWith("live_") &&
    BANK.test(String(env.LOB_VERIFIED_BANK_ID||""));
}
