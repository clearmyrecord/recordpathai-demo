// Actual outbound provider adapters. Fail CLOSED without explicit live enablement.
import {validSmsPhone,validAlertEmail} from "./recordwatch-alerts.js";
export function providerReadiness(env={}){
  const enabled=env.RECORDWATCH_ALERTS_LIVE_ENABLED==="true";
  const testEnabled=env.RECORDWATCH_ALERTS_TEST_ENABLED==="true";
  const emailConfigured=Boolean(env.RESEND_API_KEY && validAlertEmail(env.RECORDWATCH_EMAIL_FROM||""));
  const smsConfigured=Boolean(/^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID||"") &&
    env.TWILIO_AUTH_TOKEN && /^MG[a-f0-9]{32}$/i.test(env.TWILIO_MESSAGING_SERVICE_SID||"") &&
    env.RECORDWATCH_SMS_CAMPAIGN_APPROVED==="true");
  return {enabled,email_configured:emailConfigured,sms_configured:smsConfigured,
    email_ready:enabled && emailConfigured,sms_ready:enabled && smsConfigured,
    test_enabled:testEnabled,test_email_ready:testEnabled && emailConfigured,
    test_sms_ready:testEnabled && smsConfigured};
}
export async function sendPremiumEmail({to,subject,message,env=process.env,fetchFn=fetch,testOnly=false}){
  const r=providerReadiness(env);
  if(!(testOnly?r.test_email_ready:r.email_ready)||!validAlertEmail(to))throw new Error("Premium email sending is disabled or recipient invalid");
  const response=await fetchFn("https://api.resend.com/emails",{
    method:"POST",headers:{Authorization:"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({from:"RecordPathAI <"+env.RECORDWATCH_EMAIL_FROM+">",
      to:[to],subject,
      text:message+"\n\nManage or disable alerts: https://recordpathai.com/recordwatch-dashboard.html",
      html:'<p>'+message.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+
        '</p><p><a href="https://recordpathai.com/recordwatch-dashboard.html">Manage alert preferences</a></p>'
    }),signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error("Resend rejected Premium alert (HTTP "+response.status+")");
  const receipt=await response.json();
  if(!/^[-a-z0-9]{16,}$/i.test(receipt.id||""))throw new Error("Resend receipt missing");
  return {provider:"resend",id:receipt.id,status:"provider_accepted"};
}
export async function sendPremiumSms({to,message,env=process.env,fetchFn=fetch,testOnly=false}){
  const r=providerReadiness(env);
  if(!(testOnly?r.test_sms_ready:r.sms_ready) || !validSmsPhone(to))throw new Error("Premium SMS sending disabled or phone invalid");
  const url="https://api.twilio.com/2010-04-01/Accounts/"+env.TWILIO_ACCOUNT_SID+"/Messages.json";
  const payload=new URLSearchParams({To:to,MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID,Body:message});
  const response=await fetchFn(url,{
    method:"POST",headers:{Authorization:"Basic "+Buffer.from(env.TWILIO_ACCOUNT_SID+":"+env.TWILIO_AUTH_TOKEN).toString("base64"),
      "Content-Type":"application/x-www-form-urlencoded"},
    body:payload,signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error("Twilio rejected Premium alert (HTTP "+response.status+")");
  const receipt=await response.json();
  if(!/^SM[a-f0-9]{32}$/i.test(receipt.sid||""))throw new Error("Twilio receipt missing");
  return {provider:"twilio",id:receipt.sid,status:"provider_accepted"};
}
