import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const dashboard=read("recordwatch-dashboard.html");
const provider=read("js/recordwatch-sms-opt-in.js");
const preview=read("recordwatch-sms-opt-in-preview.html");
const server=read("server.js");
const providerDispatch=read("src/recordwatch-alert-dispatch.js");
const terms=read("terms.html");
const privacy=read("privacy.html");

test("The dashboard and public preview use the same consent disclosure renderer",()=>{
  assert.match(dashboard,/src="js\/recordwatch-sms-opt-in\.js"/);
  assert.match(dashboard,/RecordWatchSmsOptIn\.fields\(/);
  assert.match(preview,/src="js\/recordwatch-sms-opt-in\.js"/);
  assert.match(preview,/RecordWatchSmsOptIn\.fields\(/);
  assert.match(provider,/id="premiumPhone"/);
  for (const id of ["premiumSmsConsent","premiumSmsEnabled","premiumSmsTerms","premiumEmailEnabled"]){
    assert.ok(provider.includes('id="'+id+'"'),id);
  }
  assert.match(provider,/smsConsentChecked === true \? " checked" : ""/);
  assert.match(provider,/smsEnabledChecked === true \? " checked" : ""/);
  assert.match(provider,/Terms of Service/);
  assert.match(provider,/Privacy Policy/);
  assert.match(provider,/Msg & data rates may apply/);
  assert.match(provider,/Reply STOP to opt out or HELP for help/);
  assert.match(provider,/frequency varies/);
  assert.match(provider,/Consent is optional/);
  assert.doesNotMatch(provider,/Marketing Messages/);
  assert.match(preview,/not a live sign-up/);
  assert.match(preview,/No phone number or consent is collected here/);
});

test("Consent confirmation is only displayed after server persistence",()=>{
  assert.match(dashboard,/RecordWatchNotifications\.savePremiumPreferences\(payload\)\.then\(function \(result\)/);
  assert.match(dashboard,/preferenceSaveNotice = stored\.sms_enabled && stored\.sms_consent_at/);
  assert.match(dashboard,/renderPremiumPanels\(\[\]\)/);
  assert.match(dashboard,/id="premiumPreferencesStatus"/);
  assert.match(dashboard,/role="status" aria-live="polite"/);
  assert.match(dashboard,/premiumSmsTerms'\)\.checked/);
  assert.match(dashboard,/sms_terms_acknowledged/);
  assert.match(dashboard,/sms_consent_disclosure_version/);
  assert.match(dashboard,/phoneInput\.dataset\.consentReconfirmed = 'false'/);
  assert.match(dashboard,/phoneInput\.dataset\.consentReconfirmed = 'true'/);
  assert.match(dashboard,/href="#recordwatchPreferencesPanel"/);
  assert.match(preview,/Illustrative confirmation only/);
  assert.match(preview,/No real preferences were saved/);
});

test("Server requires Terms acknowledgment and current disclosure for fresh SMS enrollment",()=>{
  assert.match(server,/const newSmsEnrollment=smsRequested/);
  assert.match(server,/newSmsEnrollment && payload\.sms_terms_acknowledged!==true/);
  assert.match(server,/newSmsEnrollment && payload\.sms_consent_disclosure_version!=="2026-11-web-form-v2"/);
  assert.match(server,/sms_consent_at:smsRequested\?\(newSmsEnrollment\?now:/);
  assert.match(server,/const changedPhone=Boolean/);
  assert.match(server,/recordwatch_sms_suppressions/);
  assert.match(server,/Paid RecordWatch Premium is required/);
  assert.match(providerDispatch,/RECORDWATCH_SMS_CAMPAIGN_APPROVED/);
});

test("Terms and Privacy match the SMS program and include mandatory disclosures",()=>{
  for(const text of ["STOP","HELP","Message and data rates may apply","Wireless carriers are not liable for delayed or undelivered messages","matt@recordpathai.com"])
    assert.match(terms,new RegExp(text));
  assert.match(terms,/href="privacy\.html"/);
  assert.match(privacy,/We do not share SMS opt-in data or mobile numbers with affiliates or third parties for marketing or promotional purposes/);
});

test("Updated inline scripts parse cleanly and preview is never a functional enrollment endpoint",()=>{
  for(const [filename,html] of [["recordwatch-dashboard.html",dashboard],["recordwatch-sms-opt-in-preview.html",preview]]){
    const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    for(let i=0;i<blocks.length;i++){
      const body=blocks[i][1].trim();
      if(body)assert.doesNotThrow(()=>new Script(body,{filename:filename+" inline "+i}));
    }
  }
  assert.doesNotThrow(()=>new Script(provider,{filename:"recordwatch-sms-opt-in.js"}));
  assert.doesNotMatch(preview,/fetch\(|apiFetch\(|savePremiumPreferences\(/);
  assert.match(preview,/phone\.disabled=true/);
});
