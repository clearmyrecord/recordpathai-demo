import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const dash=read("recordwatch-dashboard.html");
const provider=read("js/recordwatch-sms-opt-in.js");
const landing=read("recordwatch.html");
const preview=read("recordwatch-sms-opt-in-preview.html");
const server=read("server.js");
const migration=read("supabase/migrations/20261109000000_recordwatch_custom_notification_email.sql");
const prior=read("supabase/migrations/20261108040000_recordwatch_premium_delivery.sql");
const client=read("js/recordwatch-notifications.js");

test("Checkout CTA follows separate contact destinations and mandatory purchase agreement",()=>{
  assert.match(dash,/recordwatchPreCheckoutForm/);
  assert.match(dash,/checkoutFields \+/);
  assert.match(dash,/recordwatchPurchaseTerms/);
  assert.match(dash,/Accept terms &amp; continue to Stripe — \$39/);
  assert.ok(dash.indexOf("checkoutFields +") < dash.indexOf('recordwatchPurchaseTerms'));
  assert.ok(dash.indexOf('recordwatchPurchaseTerms') < dash.indexOf('Accept terms &amp; continue to Stripe'));
  assert.match(dash,/if \(!purchaseTerms\)/);
  assert.match(dash,/purchase_terms_acknowledged:true/);
  assert.match(dash,/sms_consent_disclosure_version:RecordWatchSmsOptIn.DISCLOSURE_VERSION/);
  assert.match(server,/req\.body\?\.purchase_terms_acknowledged!==true/);
  assert.match(server,/req\.body\?\.sms_consent_disclosure_version!=="2026-11-web-form-v2"/);
  assert.ok(server.indexOf('req.body?.purchase_terms_acknowledged!==true') <
    server.indexOf('recordwatchStripe.checkout.sessions.create'));
  assert.doesNotMatch(dash,/data-premium-action="lifetime_case"/);
  assert.match(landing,/window\.location\.assign\("recordwatch-dashboard\.html\?caseId=/);
  assert.doesNotMatch(landing,/RecordWatchNotifications\.checkoutPremium\("lifetime_case"/);
});

test("Premium contact fields never prefill from Step 1, auth user or Stripe",()=>{
  assert.match(provider,/id="premiumNotificationEmail"/);
  assert.match(provider,/id="premiumPhone"/);
  assert.match(provider,/separate from Step 1/);
  assert.match(provider,/verify it after payment/);
  assert.match(dash,/var phone = preferences\.phone_number \|\| ''/);
  assert.match(dash,/var notificationEmail=preferences\.notification_email \|\| ''/);
  assert.match(dash,/RecordWatchSmsOptIn\.fields\(\{phone:'',email:''/);
  assert.doesNotMatch(dash,/premiumState\.stepOnePhone|user && user\.phone|source\.person\.phone/);
  assert.match(preview,/demo only/);
  assert.match(preview,/No phone number, email, consent, or payment is collected/);
  assert.doesNotMatch(preview,/savePremiumPreferences\(/);
});

test("Unpaid and abandoned checkouts cannot save preferences or activate alerts",()=>{
  assert.match(dash,/sessionStorage\.setItem\('recordwatchPendingCheckoutConsent'/);
  assert.match(dash,/recordwatchPendingCheckoutConsent/);
  assert.match(dash,/Date\.now\(\)-pending\.createdAt>7200000/);
  assert.match(dash,/pending\.userId!==user\.id \|\| pending\.caseId!==caseId/);
  assert.match(dash,/if\(!window\.RecordWatchMessageProvider\?\.isPremium\(premiumState\.subscription\)\)return false/);
  assert.match(dash,/RecordWatchNotifications\.verifyPremiumCheckout\(successSessionId, selectedSavedCaseId\(\)\)/);
  assert.match(dash,/if \(!result\?\.premium\) throw/);
  assert.ok(dash.indexOf('if (!result?.premium) throw') <
    dash.indexOf('await saveCheckoutNotificationChoices(successSessionId)'));
  assert.match(dash,/pending\.sessionId!==paidSessionId/);
  assert.match(dash,/draft\.sessionId=result\.sessionId/);
  assert.match(server,/Paid RecordWatch Premium is required for this saved case/);
  assert.match(server,/getRecordwatchLifetimeCase\(userId,caseId\)/);
  assert.match(server,/sms_consent_at:smsRequested\?\(newSmsEnrollment\?now:/);
  assert.match(client,/savePremiumPreferences\(payload\)/);
});

test("Independent email must be verified before provider sends paid notifications",()=>{
  assert.match(server,/notification_email:notificationEmail\|\|oldEmail\|\|null/);
  assert.match(server,/notification_email_verified_at:emailChanged\?null/);
  assert.match(server,/randomBytes\(32\)\.toString\("hex"\)/);
  assert.match(server,/sendRecordwatchVerificationEmail/);
  assert.match(server,/verify-notification-email/);
  assert.match(server,/timingSafeEqual\(a,b\)/);
  assert.match(server,/publicRecordwatchPreferences\(preferences\)/);
  assert.match(server,/email_verification_sent:verificationSent/);
  assert.match(server,/prefs\.notification_email_verified_at\?prefs\.notification_email:""/);
  assert.match(server,/casePremiumPreferences\.notification_email_verified_at/);
  assert.match(dash,/confirmRecordwatchEmailToken/);
  assert.match(dash,/searchParams\.delete\("verify_recordwatch_email"\)/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS notification_email/);
  assert.match(migration,/notification_email_verified_at/);
  assert.match(migration,/notification_email_token_sha256/);
  assert.match(migration,/notification_email_token_sent_at/);
  assert.doesNotMatch(prior,/on conflict\(id\) do nothing;\s*\),/);
});

test("New checkout UI and server scripts parse cleanly",()=>{
  assert.doesNotThrow(()=>new Script(provider,{filename:"js/recordwatch-sms-opt-in.js"}));
  const blocks=[...dash.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  for(const [i,match] of blocks.entries()){
    if(match[1].trim())
      assert.doesNotThrow(()=>new Script(match[1],{filename:"recordwatch-dashboard.html:"+i}));
  }
  assert.match(preview,/Accept terms &amp; continue to Stripe/);
});
