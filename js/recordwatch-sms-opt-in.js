// Canonical RecordWatch SMS opt-in UI for the paid dashboard and public
// illustrative preview. The preview NEVER records consent or contacts Twilio.
(function () {
  "use strict";
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
    });
  }
  var DISCLOSURE_VERSION = "2026-11-web-form-v2";
  var SMS_CONSENT_LABEL = "Yes, I agree to receive automated, non-marketing RecordWatch Premium account and estimated eligibility timeline text messages from RecordPathAI at the mobile number provided.";
  var SMS_DETAILS = "Message frequency varies by case milestones (up to five scheduled timeline reminders per eligibility date, when applicable). Msg & data rates may apply. Reply STOP to opt out or HELP for help. Consent is optional, is not required to purchase Premium, and may be withdrawn at any time. Texts do not contain court or charge details. Delivery is available only after provider approval.";
  function fields(options) {
    options = options || {};
    var phone = esc(options.phone || "");
    var emailChecked = options.emailChecked === true ? " checked" : "";
    var smsConsentChecked = options.smsConsentChecked === true ? " checked" : "";
    var smsEnabledChecked = options.smsEnabledChecked === true ? " checked" : "";
    return [
      '<div class="recordwatch-optin-field"><label for="premiumPhone"><strong>Mobile phone number</strong></label>',
        '<input id="premiumPhone" type="tel" inputmode="tel" autocomplete="tel" value="',phone,'" placeholder="(555) 555-5555" aria-describedby="premiumSmsPhoneNote">',
        '<p class="meta-note" id="premiumSmsPhoneNote">United States mobile numbers only. Your number is used for RecordWatch notifications only if you choose to enroll.</p></div>',
      '<fieldset class="recordwatch-optin-group"><legend>Notification choices</legend>',
        '<label class="toggle-row"><input id="premiumEmailEnabled" type="checkbox"',emailChecked,
        '> <span>Email: Send RecordWatch Premium timeline updates to my confirmed account email. Optional.</span></label>',
        '<label class="toggle-row"><input id="premiumSmsConsent" type="checkbox"',smsConsentChecked,
        '> <span><strong>SMS — optional consent</strong>: ',esc(SMS_CONSENT_LABEL),'</span></label>',
        '<p class="recordwatch-sms-disclosure">',esc(SMS_DETAILS),'</p>',
        '<label class="toggle-row"><input id="premiumSmsEnabled" type="checkbox"',smsEnabledChecked,
        '> <span>Enable SMS alerts for this paid saved case when the messaging service is approved.</span></label>',
      '</fieldset>',
      '<fieldset class="recordwatch-optin-group"><legend>Terms acknowledgment (separate from messaging consent)</legend>',
        '<label class="toggle-row"><input id="premiumSmsTerms" type="checkbox"> ',
        '<span>I have read the <a href="https://recordpathai.com/terms.html" target="_blank" rel="noopener noreferrer">Terms of Service</a> and ',
        '<a href="https://recordpathai.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. ',
        'This acknowledgment is required only when newly enrolling in SMS or changing the SMS phone number; it is not required for purchasing Premium or disabling alerts.</span></label>',
      '</fieldset>'
    ].join("");
  }
  window.RecordWatchSmsOptIn = {
    fields: fields,
    DISCLOSURE_VERSION: DISCLOSURE_VERSION,
    SMS_CONSENT_LABEL: SMS_CONSENT_LABEL,
    SMS_DETAILS: SMS_DETAILS
  };
}());
