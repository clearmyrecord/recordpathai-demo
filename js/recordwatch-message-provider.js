(function () {
  "use strict";

  var SMS_CONSENT_COPY = "By enabling SMS notifications, you agree to receive RecordWatch reminders from RecordPathAI. Message and data rates may apply. Reply STOP to opt out.";

  function canSendSms(subscription, preferences) {
    subscription = subscription || {};
    preferences = preferences || {};
    return Boolean(
      (subscription.premium_active || subscription.premium === true) &&
      preferences.sms_enabled === true &&
      preferences.phone_number &&
      preferences.sms_consent_at &&
      !preferences.sms_opted_out_at
    );
  }

  function buildChannels(subscription, preferences) {
    var channels = [];
    if (!preferences || preferences.email_enabled !== false) channels.push("email");
    if (canSendSms(subscription, preferences)) channels.push("sms");
    return channels;
  }

  function applyStopOptOut(preferences) {
    var updated = Object.assign({}, preferences || {}, {
      sms_enabled: false,
      eligibility_sms: false,
      sms_opted_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    try { localStorage.setItem("recordwatchNotificationPreferences", JSON.stringify(updated)); } catch (error) {}
    return updated;
  }

  window.RecordWatchMessageProvider = {
    SMS_CONSENT_COPY: SMS_CONSENT_COPY,
    canSendSms: canSendSms,
    buildChannels: buildChannels,
    applyStopOptOut: applyStopOptOut
  };
}());
