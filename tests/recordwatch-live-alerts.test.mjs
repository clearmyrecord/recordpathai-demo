import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHmac} from "node:crypto";
import {canonicalSmsPhone,validAlertEmail,reminderForDate,neutralAlertContent,
  isPremiumAlertAllowed,validTwilioWebhookSignature,STOP_WORDS} from "../src/recordwatch-alerts.js";
import {providerReadiness,sendPremiumEmail,sendPremiumSms} from "../src/recordwatch-alert-dispatch.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const server=read("server.js"),page=read("recordwatch-dashboard.html");
const id="11111111-1111-4111-8111-111111111111";
const caseId="22222222-2222-4222-8222-222222222222";
const lifetime={user_id:id,saved_case_id:caseId,status:"active",revoked_at:null,
  amount_cents:3900,currency:"usd",stripe_checkout_session_id:"cs_live_abc",
  stripe_payment_intent_id:"pi_abc"};
const prefs={user_id:id,saved_case_id:caseId,email_enabled:true,
  email_opted_in_at:"2026-11-08T12:00:00Z",sms_enabled:true,
  sms_consent_at:"2026-11-08T12:00:00Z",sms_opted_out_at:null,
  phone_number:"+17025551234"};
test("Both outbound channels strictly require paid per-case entitlements and affirmative opt-ins",()=>{
  for(const channel of ["email","sms"]){
    assert.equal(isPremiumAlertAllowed({lifetime,caseId,prefs,channel}),true);
    for(const row of [
      {...lifetime,status:"refunded"},{...lifetime,revoked_at:"2026-11-09"},
      {...lifetime,amount_cents:0},{...lifetime,saved_case_id:"other"},
      {...lifetime,stripe_checkout_session_id:""}
    ])assert.equal(isPremiumAlertAllowed({lifetime:row,caseId,prefs,channel}),false);
  }
  assert.equal(isPremiumAlertAllowed({lifetime,caseId,prefs:{...prefs,email_opted_in_at:null},channel:"email"}),false);
  assert.equal(isPremiumAlertAllowed({lifetime,caseId,prefs:{...prefs,email_enabled:false},channel:"email"}),false);
  assert.equal(isPremiumAlertAllowed({lifetime,caseId,prefs:{...prefs,sms_consent_at:null},channel:"sms"}),false);
  assert.equal(isPremiumAlertAllowed({lifetime,caseId,prefs:{...prefs,sms_enabled:false},channel:"sms"}),false);
  assert.equal(isPremiumAlertAllowed({lifetime,caseId,prefs,channel:"sms",phoneSuppressed:true}),false);
  assert.equal(isPremiumAlertAllowed({lifetime,caseId,prefs:{...prefs,sms_opted_out_at:"2026-11-09"},channel:"sms"}),false);
});
test("US phone canonicalization, SMS signature and consent are fail-closed",()=>{
  assert.equal(canonicalSmsPhone("(702) 555-1234"),"+17025551234");
  assert.equal(canonicalSmsPhone("+17025551234"),"+17025551234");
  assert.equal(canonicalSmsPhone("123"),"");
  assert.equal(validAlertEmail("user@example.com"),true);
  const url="https://recordpathai.com/api/recordwatch/inbound-sms";
  const params={From:"+17025551234",Body:"STOP",AccountSid:"AC"+"a".repeat(32)};
  const data=url+Object.keys(params).sort().map(k=>k+params[k]).join("");
  const signature=createHmac("sha1","test-token").update(data).digest("base64");
  assert.equal(validTwilioWebhookSignature({url,params,signature,authToken:"test-token"}),true);
  assert.equal(validTwilioWebhookSignature({url,params,signature:"incorrect",authToken:"test-token"}),false);
  assert.equal(validTwilioWebhookSignature({url,params:{...params,Body:"START"},signature,authToken:"test-token"}),false);
  assert.match(server,/validTwilioWebhookSignature\(/);
  assert.match(server,/recordwatch_sms_suppressions/);
});
test("All standard Twilio STOP aliases and signed Advanced Opt-Out are persisted",()=>{
  for(const keyword of ["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT","REVOKE","OPTOUT"])
    assert.equal(STOP_WORDS.has(keyword),true,keyword);
  const handler=server.slice(server.indexOf('app.post("/api/recordwatch/inbound-sms"'),
    server.indexOf('app.post("/api/recordwatch/subscribe"'));
  assert.match(handler,/const optOutType=safe\(payload\.OptOutType\)/);
  assert.match(handler,/const isStop=STOP_WORDS\.has\(body\)\|\|optOutType==="STOP"/);
  assert.match(handler,/if\(isStop\)/);
  assert.match(handler,/sms_enabled:false,sms_opted_out_at:now,sms_consent_at:null/);
  assert.match(handler,/sms_enabled:false,sms_opted_out_at:null,sms_consent_at:null/);
  assert.match(handler,/pref\.sms_opted_out_at=isStop\?now:null/);
});

test("Date schedule is exact, no catch-up spam and no case details in outbound copy",()=>{
  for(const d of [180,90,30,7,0]){
    const from=new Date("2026-11-08T00:00:00Z");
    const target=new Date(from.getTime()+d*86400000).toISOString().slice(0,10);
    assert.equal(reminderForDate(target,"2026-11-08").days,d);
  }
  assert.equal(reminderForDate("2026-11-12","2026-11-08"),null);
  assert.equal(reminderForDate("2026-11-07","2026-11-08"),null);
  for(const channel of ["email","sms"]){
    const text=neutralAlertContent("eligibility_reached",channel);
    assert.match(text.message,/Sign in/);
    assert.doesNotMatch(text.message,/arrest|convict|felony|charge|expunge|seal/i);
  }
});
test("Live outbound providers cannot send before explicit enablement and A2P approval",async()=>{
  const env={RESEND_API_KEY:"re_dummy",RECORDWATCH_EMAIL_FROM:"alerts@recordpathai.com",
    TWILIO_ACCOUNT_SID:"AC"+"a".repeat(32),TWILIO_AUTH_TOKEN:"test_token",
    TWILIO_MESSAGING_SERVICE_SID:"MG"+"b".repeat(32),
    RECORDWATCH_SMS_CAMPAIGN_APPROVED:"true"};
  assert.equal(providerReadiness(env).email_ready,false);
  assert.equal(providerReadiness(env).sms_ready,false);
  assert.equal(providerReadiness({...env,RECORDWATCH_ALERTS_LIVE_ENABLED:"true"}).sms_ready,true);
  assert.equal(providerReadiness({...env,RECORDWATCH_ALERTS_LIVE_ENABLED:"true",RECORDWATCH_SMS_CAMPAIGN_APPROVED:"false"}).sms_ready,false);
  const noNetwork=()=>{throw Error("A disabled provider must never make a network request");};
  await assert.rejects(sendPremiumEmail({to:"user@example.com",subject:"Test",message:"Test",env,fetchFn:noNetwork}),/disabled/);
  await assert.rejects(sendPremiumSms({to:"+17025551234",message:"Test",env,fetchFn:noNetwork}),/disabled/);
});
test("Provider API acceptance is tracked separately from confirmed delivery",async()=>{
  const env={RECORDWATCH_ALERTS_LIVE_ENABLED:"true",
    RESEND_API_KEY:"re_dummy",RECORDWATCH_EMAIL_FROM:"alerts@recordpathai.com",
    TWILIO_ACCOUNT_SID:"AC"+"a".repeat(32),TWILIO_AUTH_TOKEN:"secret",
    TWILIO_MESSAGING_SERVICE_SID:"MG"+"b".repeat(32),
    RECORDWATCH_SMS_CAMPAIGN_APPROVED:"true"};
  const ok=body=>({ok:true,json:async()=>body});
  const email=await sendPremiumEmail({to:"user@example.com",subject:"Update",message:"Log in",
    env,fetchFn:async(url,opts)=>{assert.match(url,/resend.com/);assert.equal(opts.method,"POST");return ok({id:"0c0d0e0f-0c0d-4000-a000-0123456789ab"});}});
  const sms=await sendPremiumSms({to:"+17025551234",message:"Log in",env,
    fetchFn:async(url,opts)=>{assert.match(url,/twilio.com/);assert.equal(opts.method,"POST");return ok({sid:"SM"+"c".repeat(32)});}});
  assert.equal(email.status,"provider_accepted");
  assert.equal(sms.status,"provider_accepted");
});
test("Only signed webhook and authenticated operator daily worker can initiate sends",()=>{
  assert.match(server,/app\.post\("\/api\/recordwatch\/inbound-sms"/);
  assert.match(server,/x-recordwatch-alerts-key/);
  assert.match(server,/RECORDWATCH_LEGACY_NIGHTLY_ENABLED !== "true"/);
  assert.match(server,/recordwatch_alert_deliveries/);
  assert.match(server,/resolution=ignore-duplicates/);
  assert.match(server,/verifyPremiumAlertPayment\(lifetime\)/);
  assert.match(server,/alertRecipientEmail\(userId\)/);
  assert.match(page,/id='\+?|premiumEmailEnabled|premiumEmailEnabled/);
  assert.match(page,/Voluntary consent; not required to purchase Premium/);
});
