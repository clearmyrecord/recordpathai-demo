(function () {
  "use strict";

  var SMS_CONSENT_TEXT = "By enabling SMS notifications, you agree to receive RecordWatch reminders from RecordPathAI. Message and data rates may apply. Reply STOP to opt out.";

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function digits(value) { return clean(value).replace(/\D+/g, ""); }
  function isPremium(subscription) {
    // Display status is returned by the authenticated server. The server checks
    // Stripe and saved-case ownership before granting a paid entitlement.
    if (!subscription) return false;
    var status = clean(subscription.status).toLowerCase();
    if (subscription.plan === "lifetime_case") {
      return status === "active" && !subscription.revoked_at &&
        /^cs_/.test(clean(subscription.stripe_checkout_session_id)) &&
        /^pi_/.test(clean(subscription.stripe_payment_intent_id)) &&
        Boolean(subscription.saved_case_id);
    }
    // Honor existing, unexpired recurring subscriptions; no new ones are sold.
    if (!/^sub_/.test(clean(subscription.stripe_subscription_id))) return false;
    if (status !== "active" && status !== "trialing") return false;
    var end = new Date(subscription.current_period_end || "").getTime();
    return Number.isFinite(end) && end > Date.now();
  }
  function hasSmsOptedOut(preferences) { return Boolean(preferences && (preferences.sms_opted_out_at || preferences.smsOptedOutAt)); }
  function formatPhoneNumber(value) {
    var d = digits(value);
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    if (d.length === 10) return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
    return clean(value);
  }
  function normalizePhoneForPayload(value) {
    var d = digits(value);
    if (d.length === 10) return "+1" + d;
    if (d.length === 11 && d.charAt(0) === "1") return "+" + d;
    return clean(value);
  }
  function canEnableSms(user, subscription, preferences) {
    preferences = preferences || {};
    var phone = clean(preferences.phone_number || preferences.phoneNumber || (user && user.phone));
    var consent = Boolean(preferences.sms_consent_at || preferences.smsConsentAt || preferences.sms_consent || preferences.smsConsent);
    return Boolean(user && isPremium(subscription) && phone && consent && !hasSmsOptedOut(preferences));
  }
  function smsDisabledReason(user, subscription, preferences) {
    preferences = preferences || {};
    if (!user) return "Sign in to manage SMS reminders.";
    if (!isPremium(subscription)) return "Premium RecordWatch is required before SMS can be enabled.";
    if (!clean(preferences.phone_number || preferences.phoneNumber || user.phone)) return "Enter a phone number before enabling SMS.";
    if (!preferences.sms_consent_at && !preferences.smsConsentAt && !preferences.sms_consent && !preferences.smsConsent) return "Check the SMS consent box before enabling SMS.";
    if (hasSmsOptedOut(preferences)) return "SMS is opted out. Reply START to your SMS provider if supported, then save consent again.";
    return "";
  }
  function buildPreferencePayload(user, formValues, subscription) {
    formValues = formValues || {};
    var phone = normalizePhoneForPayload(formValues.phone_number || formValues.phoneNumber || (user && user.phone));
    var wantsSms = Boolean(formValues.sms_enabled || formValues.smsEnabled);
    var consent = Boolean(formValues.sms_consent || formValues.smsConsent || formValues.sms_consent_at || formValues.smsConsentAt);
    var optedOut = formValues.sms_opted_out_at || formValues.smsOptedOutAt || null;
    var candidate = {
      email_enabled: formValues.email_enabled !== false && formValues.emailEnabled !== false,
      sms_enabled: wantsSms,
      phone_number: phone,
      sms_consent_at: consent ? (formValues.sms_consent_at || formValues.smsConsentAt || new Date().toISOString()) : null,
      sms_opted_out_at: optedOut,
      reminder_180_enabled: formValues.reminder_180_enabled !== false,
      reminder_90_enabled: formValues.reminder_90_enabled !== false,
      reminder_30_enabled: formValues.reminder_30_enabled !== false,
      reminder_7_enabled: formValues.reminder_7_enabled !== false,
      reminder_day_enabled: formValues.reminder_day_enabled !== false,
      court_status_enabled: formValues.court_status_enabled !== false
    };
    if (!canEnableSms(user, subscription, candidate)) candidate.sms_enabled = false;
    return candidate;
  }
  async function authHeaders() {
    var headers = { "Content-Type": "application/json" };
    try {
      if (window.RecordPathSupabase) {
        var client = await RecordPathSupabase.getClient();
        var result = await client.auth.getSession();
        var token = result && result.data && result.data.session && result.data.session.access_token;
        if (token) headers.Authorization = "Bearer " + token;
      }
    } catch (error) {}
    return headers;
  }
  async function apiFetch(url, options) {
    options = options || {};
    options.headers = Object.assign(await authHeaders(), options.headers || {});
    if (options.body && typeof options.body !== "string") options.body = JSON.stringify(options.body);
    var response = await fetch(url, options);
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "RecordWatch request failed");
    return data;
  }

  window.RecordWatchMessageProvider = {
    SMS_CONSENT_TEXT: SMS_CONSENT_TEXT,
    isPremium: isPremium,
    hasSmsOptedOut: hasSmsOptedOut,
    canEnableSms: canEnableSms,
    smsDisabledReason: smsDisabledReason,
    formatPhoneNumber: formatPhoneNumber,
    normalizePhoneForPayload: normalizePhoneForPayload,
    buildPreferencePayload: buildPreferencePayload,
    authHeaders: authHeaders,
    apiFetch: apiFetch
  };
}());
