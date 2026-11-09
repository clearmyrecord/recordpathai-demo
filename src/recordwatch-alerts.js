// RecordWatch Premium alert policy. No personal case information in outbound copy.
import {createHmac,timingSafeEqual} from "node:crypto";
export const REMINDER_WINDOWS = Object.freeze([180,90,30,7,0]);
const US_E164=/^\+1[2-9][0-9]{9}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const STOP_WORDS = new Set(["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"]);
export function validSmsPhone(phone){return US_E164.test(String(phone||""));}
export function validAlertEmail(email){return EMAIL.test(String(email||"").trim()) && String(email).length<=254;}
export function canonicalSmsPhone(raw){
  let digits=String(raw||"").replace(/\D/g,"");
  if(digits.length===10)digits="1"+digits;
  const phone="+"+digits;
  return validSmsPhone(phone)?phone:"";
}
export function daysUntilEligibility(eligibilityDate,today){
  const day=s=>String(s||"").slice(0,10);
  const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+"T00:00:00Z"));
  const target=day(eligibilityDate),from=day(today);
  if(!valid(target)||!valid(from))return null;
  return Math.round((Date.parse(target+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000);
}
export function reminderForDate(date,today){
  const days=daysUntilEligibility(date,today);
  return REMINDER_WINDOWS.includes(days)?{days,kind:days===0?"eligibility_reached":"eligibility_"+days+"_day"}:null;
}
export function isPremiumAlertAllowed({lifetime,caseId,prefs,channel,phoneSuppressed=false}){
  if(!lifetime||lifetime.saved_case_id!==caseId||lifetime.status!=="active"||lifetime.revoked_at||
    lifetime.amount_cents!==3900||lifetime.currency!=="usd"||
    !String(lifetime.stripe_checkout_session_id||"").startsWith("cs_")||
    !String(lifetime.stripe_payment_intent_id||"").startsWith("pi_"))return false;
  if(!prefs||prefs.saved_case_id!==caseId||prefs.user_id!==lifetime.user_id)return false;
  if(channel==="email")return prefs.email_enabled===true && !!prefs.email_opted_in_at;
  if(channel==="sms")return prefs.sms_enabled===true && !!prefs.sms_consent_at &&
    !prefs.sms_opted_out_at && !phoneSuppressed && validSmsPhone(prefs.phone_number);
  return false;
}
export function neutralAlertContent(kind,channel){
  const milestoneReached=kind==="eligibility_reached";
  // Keep case details, dates and charge/docket information out of SMS.
  const message=milestoneReached
    ?"A RecordWatch Premium timeline milestone is ready for review. Sign in to RecordPathAI for your saved case."
    :"A RecordWatch Premium timeline update is available. Sign in to RecordPathAI to review your saved case.";
  const smsText=milestoneReached
    ?"RecordPathAI RecordWatch: A saved timeline milestone is ready for review. Sign in to your account for details. Reply STOP to opt out; HELP for help. Msg & data rates may apply."
    :"RecordPathAI RecordWatch: A timeline update is available. Sign in to your account to review it. Reply STOP to opt out; HELP for help. Msg & data rates may apply.";
  return {
    subject:milestoneReached?"RecordWatch Premium: Timeline milestone":"RecordWatch Premium: Timeline update",
    message:channel==="sms"?smsText:message,
    kind
  };
}
export function validTwilioWebhookSignature({url,params,signature,authToken}){
  if(!url?.startsWith("https://")||!signature||!authToken||
    !params||typeof params!=="object")return false;
  const keys=Object.keys(params).sort();
  let data=url;
  for(const key of keys){
    if(typeof params[key]!=="string")return false;
    data+=key+params[key];
  }
  const expected=createHmac("sha1",authToken).update(data).digest("base64");
  const a=Buffer.from(signature),b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
