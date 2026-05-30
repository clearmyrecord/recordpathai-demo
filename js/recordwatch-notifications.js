(function () {
  "use strict";

  var SUBSCRIPTIONS_KEY = "recordwatchSubscriptions";
  var EVENTS_KEY = "recordwatchEligibilityEvents";
  var NOTIFICATIONS_KEY = "recordwatchNotifications";
  var PREFERENCES_KEY = "recordwatchNotificationPreferences";
  var COURT_STATUS_KEY = "recordwatchCourtStatuses";
  var FALLBACK_NOTE = "Showing locally saved RecordWatch data.";
  var reminderDefinitions = [
    { days: 90, flag: "reminder_90_sent", type: "eligibility_90_day" },
    { days: 30, flag: "reminder_30_sent", type: "eligibility_30_day" },
    { days: 7, flag: "reminder_7_sent", type: "eligibility_7_day" },
    { days: 0, flag: "reminder_day_sent", type: "eligibility_reached" }
  ];
  var courtStatuses = ["RECEIVED", "UNDER_REVIEW", "CORRECTION_REQUESTED", "ACCEPTED", "FILED", "HEARING_SCHEDULED", "GRANTED", "DENIED", "CLOSED"];
  var courtNotificationTypes = {
    RECEIVED: "court_status_received",
    UNDER_REVIEW: "court_status_under_review",
    CORRECTION_REQUESTED: "court_status_correction_requested",
    ACCEPTED: "court_status_accepted",
    FILED: "court_status_filed",
    HEARING_SCHEDULED: "court_status_hearing_scheduled",
    GRANTED: "court_status_granted",
    DENIED: "court_status_denied",
    CLOSED: "court_status_closed"
  };

  function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (error) { return fallback; } }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value; }
  function id(prefix) { return prefix + "_" + Date.now() + "_" + Math.random().toString(16).slice(2); }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function normalizeStatus(value) { return clean(value).toUpperCase().replace(/[\s-]+/g, "_"); }
  function dateOnly(value) {
    if (!value) return "";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  function daysUntil(value, from) {
    var start = new Date((dateOnly(from || new Date()) || dateOnly(new Date())) + "T00:00:00.000Z");
    var end = new Date(dateOnly(value) + "T00:00:00.000Z");
    if (Number.isNaN(end.getTime())) return null;
    return Math.round((end - start) / 86400000);
  }
  function currentUserId() {
    if (window.RecordPathUserStore && RecordPathUserStore.getCurrentUser()) return RecordPathUserStore.getCurrentUser().id;
    return localStorage.getItem("email") || "demo-user";
  }
  function defaultPreferences(userId) {
    return { user_id: userId || currentUserId(), eligibility_email: true, eligibility_sms: false, court_status_updates: true, packet_reminders: true, marketing_emails: false };
  }
  function loadSubscriptions() { return readJSON(SUBSCRIPTIONS_KEY, []); }
  function loadEvents() { return readJSON(EVENTS_KEY, []); }
  function loadNotifications() { return readJSON(NOTIFICATIONS_KEY, []); }
  function loadPreferences(userId) { return Object.assign(defaultPreferences(userId), readJSON(PREFERENCES_KEY, {})); }
  async function apiGet(path, userId) {
    var response = await fetch(path + "?user_id=" + encodeURIComponent(userId || currentUserId()));
    if (!response.ok) throw new Error("RecordWatch API fetch failed");
    return response.json();
  }
  async function post(url, payload) {
    if (!window.fetch || location.protocol === "file:") throw new Error("RecordWatch API unavailable");
    var response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("RecordWatch API save failed");
    return response.json();
  }
  async function fetchRemoteData(userId) {
    try {
      var uid = userId || currentUserId();
      var results = await Promise.all([
        apiGet("/api/recordwatch/subscriptions", uid),
        apiGet("/api/recordwatch/events", uid),
        apiGet("/api/recordwatch/notifications", uid),
        apiGet("/api/recordwatch/preferences", uid)
      ]);
      var source = results.some(function (item) { return item.source === "local_fallback"; }) ? "local_fallback" : "supabase";
      var subscriptions = (results[0].subscriptions && results[0].subscriptions.length) ? results[0].subscriptions : loadSubscriptions();
      var events = (results[1].events && results[1].events.length) ? results[1].events : loadEvents();
      var notifications = (results[2].notifications && results[2].notifications.length) ? results[2].notifications : loadNotifications();
      var preferences = results[3].preferences || loadPreferences(uid);
      writeJSON(SUBSCRIPTIONS_KEY, subscriptions);
      writeJSON(EVENTS_KEY, events);
      writeJSON(NOTIFICATIONS_KEY, notifications);
      writeJSON(PREFERENCES_KEY, preferences);
      return { source: source, fallbackNote: source === "local_fallback" ? FALLBACK_NOTE : "", subscriptions: subscriptions, events: events, notifications: notifications, preferences: preferences };
    } catch (error) {
      return { source: "local_fallback", fallbackNote: FALLBACK_NOTE, subscriptions: loadSubscriptions(), events: loadEvents(), notifications: loadNotifications(), preferences: loadPreferences(userId) };
    }
  }
  function registerSubscription(payload) {
    payload = payload || {};
    var userId = clean(payload.user_id || payload.userId || currentUserId());
    var caseId = clean(payload.case_id || payload.caseId || "demo-case");
    var planType = clean(payload.plan_type || payload.planType || "free").toLowerCase() === "premium" ? "premium" : "free";
    var expiresAt = payload.premium_expires_at || payload.premiumExpiresAt || null;
    var premiumActive = Boolean(payload.premium_active || payload.premiumActive || planType === "premium") && (!expiresAt || new Date(expiresAt).getTime() > Date.now());
    var wantsSms = Boolean(payload.notify_sms || payload.notifySms);
    var subscriptions = loadSubscriptions();
    var existing = subscriptions.find(function (item) { return item.user_id === userId && item.case_id === caseId; });
    var row = Object.assign(existing || { id: id("rws"), user_id: userId, case_id: caseId, created_at: new Date().toISOString() }, {
      notification_email: clean(payload.notification_email || payload.notificationEmail || payload.email),
      notification_phone: clean(payload.notification_phone || payload.notificationPhone || payload.phone),
      notify_email: payload.notify_email !== false && payload.notifyEmail !== false,
      notify_sms: premiumActive && wantsSms,
      sms_requires_premium: wantsSms && !premiumActive,
      plan_type: premiumActive ? "premium" : planType,
      premium_active: premiumActive,
      premium_started_at: payload.premium_started_at || payload.premiumStartedAt || (premiumActive ? new Date().toISOString() : null),
      premium_expires_at: expiresAt,
      status: clean(payload.status) || "active"
    });
    if (!existing) subscriptions.push(row);
    writeJSON(SUBSCRIPTIONS_KEY, subscriptions);
    post("/api/recordwatch/subscribe", Object.assign({}, row, payload)).catch(function () {});
    return row;
  }
  function registerEligibilityEvent(payload) {
    payload = payload || {};
    var userId = clean(payload.user_id || payload.userId || currentUserId());
    var caseId = clean(payload.case_id || payload.caseId || "demo-case");
    var events = loadEvents();
    var existing = events.find(function (item) { return item.user_id === userId && item.case_id === caseId; });
    var row = Object.assign(existing || { id: id("rwe"), user_id: userId, case_id: caseId, reminder_90_sent: false, reminder_30_sent: false, reminder_7_sent: false, reminder_day_sent: false, eligibility_notification_sent: false, created_at: new Date().toISOString() }, {
      eligibility_date: dateOnly(payload.eligibility_date || payload.eligibilityDate),
      eligibility_reason: clean(payload.eligibility_reason || payload.eligibilityReason),
      waiting_period: clean(payload.waiting_period || payload.waitingPeriod),
      eligibility_confidence: clean(payload.eligibility_confidence || payload.eligibilityConfidence || "medium"),
      eligibility_confidence_reason: clean(payload.eligibility_confidence_reason || payload.eligibilityConfidenceReason),
      eligibility_completed_at: payload.eligibility_completed_at || payload.eligibilityCompletedAt || null,
      record_details_completed_at: payload.record_details_completed_at || payload.recordDetailsCompletedAt || null,
      paid_at: payload.paid_at || payload.paidAt || null,
      packet_generated_at: payload.packet_generated_at || payload.packetGeneratedAt || null,
      updated_at: new Date().toISOString()
    });
    if (!existing) events.push(row);
    writeJSON(EVENTS_KEY, events);
    post("/api/recordwatch/eligibility-event", row).catch(function () {});
    return row;
  }
  function savePreferences(payload) {
    var row = Object.assign(defaultPreferences(payload && (payload.user_id || payload.userId)), loadPreferences(payload && (payload.user_id || payload.userId)), payload || {});
    row.user_id = row.user_id || row.userId || currentUserId();
    row.updated_at = new Date().toISOString();
    writeJSON(PREFERENCES_KEY, row);
    return post("/api/recordwatch/preferences", row).then(function (result) { return result.preferences || row; }).catch(function () { return row; });
  }
  function subject(type) {
    if (type === "eligibility_reached") return "You May Now Be Eligible";
    if (type.indexOf("packet_incomplete") === 0) return "Finish Your RecordPathAI Packet";
    if (type.indexOf("court_status_") === 0) return "RecordPathAI Court Status Update";
    return "RecordPathAI Eligibility Reminder";
  }
  function message(type, context) {
    context = context || {};
    if (type === "eligibility_reached") return "Based on the information provided, your waiting period appears complete. Log in to RecordPathAI to verify eligibility and generate your packet.";
    if (type.indexOf("packet_incomplete") === 0) return "Your eligibility review is complete. Finish your record details to generate your court packet.";
    if (type.indexOf("court_status_") === 0) return "Your court filing status changed to " + (context.status || "updated") + ". This is a RecordWatch manual or system-test update unless marked as verified.";
    if (type === "eligibility_90_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 90 days.";
    if (type === "eligibility_30_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 30 days.";
    if (type === "eligibility_7_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 7 days.";
    return "RecordWatch has an update about your eligibility timeline.";
  }
  function createNotification(subscription, type, context) {
    var rows = loadNotifications();
    var preferences = loadPreferences(subscription.user_id);
    var channels = [];
    if (subscription.notify_email !== false && subscription.notification_email) channels.push("email");
    if (subscription.notify_sms && subscription.notification_phone && subscription.premium_active && preferences.eligibility_sms) channels.push("sms");
    if (!channels.length) channels.push("in_app");
    if (type.indexOf("court_status_") === 0 && !subscription.premium_active && !(context && context.admin_override)) channels = ["in_app"];
    var made = channels.map(function (channel) {
      return { id: id("rwn"), user_id: subscription.user_id, case_id: subscription.case_id, type: type, channel: channel, subject: subject(type), message: channel === "sms" ? "You may now be eligible to clear your record. Log in to RecordPathAI to continue." : message(type, context), sent_at: new Date().toISOString(), status: "logged", source: context && context.source || "local_fallback", notification_date: context && context.notification_date || dateOnly(new Date()) };
    });
    writeJSON(NOTIFICATIONS_KEY, rows.concat(made));
    return made;
  }
  function runDailyCheck(now) {
    var events = loadEvents();
    var subscriptions = loadSubscriptions();
    var notifications = [];
    events.forEach(function (event) {
      var subscription = subscriptions.find(function (item) { return item.user_id === event.user_id && item.case_id === event.case_id && item.status === "active"; });
      if (!subscription) return;
      var days = daysUntil(event.eligibility_date, now);
      reminderDefinitions.forEach(function (reminder) {
        var due = reminder.days === 0 ? days !== null && days <= 0 : days === reminder.days;
        if (due && !event[reminder.flag]) {
          notifications = notifications.concat(createNotification(subscription, reminder.type, { days: reminder.days, notification_date: event.eligibility_date }));
          event[reminder.flag] = true;
          if (reminder.days === 0) event.eligibility_notification_sent = true;
          event.updated_at = new Date().toISOString();
        }
      });
    });
    writeJSON(EVENTS_KEY, events);
    post("/api/recordwatch/run-daily", { source: "browser-preview" }).catch(function () {});
    return notifications;
  }
  function recordCourtStatus(caseId, status, userId, options) {
    status = normalizeStatus(status);
    options = options || {};
    if (courtStatuses.indexOf(status) === -1) return [];
    var statuses = readJSON(COURT_STATUS_KEY, {});
    var key = (userId || currentUserId()) + ":" + caseId;
    var previous = statuses[key];
    statuses[key] = status;
    writeJSON(COURT_STATUS_KEY, statuses);
    post("/api/recordwatch/court-status", Object.assign({ user_id: userId || currentUserId(), case_id: caseId, status: status, source: options.source || "manual" }, options)).catch(function () {});
    if (previous && previous !== status) {
      var subscription = loadSubscriptions().find(function (item) { return item.case_id === caseId; }) || { user_id: userId || currentUserId(), case_id: caseId, notify_email: false, notify_sms: false, premium_active: false };
      return createNotification(subscription, courtNotificationTypes[status], { status: status, source: options.source || "manual", admin_override: options.admin_override });
    }
    return [];
  }
  function getAdminSummary() {
    var subscriptions = loadSubscriptions();
    var notifications = loadNotifications();
    return {
      total_subscribers: subscriptions.length,
      free_subscribers: subscriptions.filter(function (item) { return item.plan_type !== "premium"; }).length,
      premium_subscribers: subscriptions.filter(function (item) { return item.premium_active; }).length,
      upcoming_eligibility_events: loadEvents().filter(function (item) { return daysUntil(item.eligibility_date) >= 0; }).length,
      notifications_sent: notifications.length,
      failed_or_skipped_notifications: notifications.filter(function (item) { return item.status === "failed" || item.status === "skipped_provider_missing"; }).length,
      provider_missing_warnings: notifications.filter(function (item) { return item.status === "skipped_provider_missing"; }).length,
      latest_job_runs: [],
      sms_usage: notifications.filter(function (item) { return item.channel === "sms"; }).length,
      email_usage: notifications.filter(function (item) { return item.channel === "email"; }).length
    };
  }

  window.RecordWatchNotifications = {
    fallbackNote: FALLBACK_NOTE,
    courtStatuses: courtStatuses,
    daysUntil: daysUntil,
    fetchRemoteData: fetchRemoteData,
    loadSubscriptions: loadSubscriptions,
    loadEvents: loadEvents,
    loadNotifications: loadNotifications,
    loadPreferences: loadPreferences,
    savePreferences: savePreferences,
    registerSubscription: registerSubscription,
    registerEligibilityEvent: registerEligibilityEvent,
    createNotification: createNotification,
    runDailyCheck: runDailyCheck,
    recordCourtStatus: recordCourtStatus,
    getAdminSummary: getAdminSummary
  };
}());
