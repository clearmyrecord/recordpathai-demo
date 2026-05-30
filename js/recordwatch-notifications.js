(function () {
  "use strict";

  var SUBSCRIPTIONS_KEY = "recordwatchSubscriptions";
  var EVENTS_KEY = "recordwatchEligibilityEvents";
  var NOTIFICATIONS_KEY = "recordwatchNotifications";
  var COURT_STATUS_KEY = "recordwatchCourtStatuses";

  var reminderDefinitions = [
    { days: 90, flag: "reminder_90_sent" },
    { days: 30, flag: "reminder_30_sent" },
    { days: 7, flag: "reminder_7_sent" },
    { days: 0, flag: "reminder_day_sent" }
  ];

  var courtStatuses = ["Received", "Under Review", "Correction Requested", "Accepted", "Filed", "Hearing Scheduled", "Granted", "Denied"];

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (error) { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value; }
  function id(prefix) { return prefix + "_" + Date.now() + "_" + Math.random().toString(16).slice(2); }
  function clean(value) { return String(value == null ? "" : value).trim(); }
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

  function loadSubscriptions() { return readJSON(SUBSCRIPTIONS_KEY, []); }
  function loadEvents() { return readJSON(EVENTS_KEY, []); }
  function loadNotifications() { return readJSON(NOTIFICATIONS_KEY, []); }

  function registerSubscription(payload) {
    payload = payload || {};
    var userId = clean(payload.user_id || payload.userId || "demo-user");
    var caseId = clean(payload.case_id || payload.caseId || "demo-case");
    var subscriptions = loadSubscriptions();
    var existing = subscriptions.find(function (item) { return item.user_id === userId && item.case_id === caseId; });
    var row = Object.assign(existing || { id: id("rws"), user_id: userId, case_id: caseId, created_at: new Date().toISOString() }, {
      notification_email: clean(payload.notification_email || payload.notificationEmail || payload.email),
      notification_phone: clean(payload.notification_phone || payload.notificationPhone || payload.phone),
      notify_email: payload.notify_email !== false && payload.notifyEmail !== false,
      notify_sms: Boolean(payload.notify_sms || payload.notifySms),
      status: clean(payload.status) || "active"
    });
    if (!existing) subscriptions.push(row);
    writeJSON(SUBSCRIPTIONS_KEY, subscriptions);
    post("/api/recordwatch/subscribe", Object.assign({}, row, payload));
    return row;
  }

  function registerEligibilityEvent(payload) {
    payload = payload || {};
    var userId = clean(payload.user_id || payload.userId || "demo-user");
    var caseId = clean(payload.case_id || payload.caseId || "demo-case");
    var events = loadEvents();
    var existing = events.find(function (item) { return item.user_id === userId && item.case_id === caseId; });
    var row = Object.assign(existing || {
      id: id("rwe"), user_id: userId, case_id: caseId, reminder_90_sent: false, reminder_30_sent: false,
      reminder_7_sent: false, reminder_day_sent: false, eligibility_notification_sent: false, created_at: new Date().toISOString()
    }, {
      eligibility_date: dateOnly(payload.eligibility_date || payload.eligibilityDate),
      eligibility_reason: clean(payload.eligibility_reason || payload.eligibilityReason),
      waiting_period: clean(payload.waiting_period || payload.waitingPeriod),
      updated_at: new Date().toISOString()
    });
    if (!existing) events.push(row);
    writeJSON(EVENTS_KEY, events);
    post("/api/recordwatch/eligibility-event", row);
    return row;
  }

  function subject(type) {
    if (type === "eligibility_reached") return "You May Now Be Eligible";
    if (type === "packet_incomplete") return "Finish Your RecordPathAI Packet";
    if (type === "court_status_update") return "RecordPathAI Court Status Update";
    return "RecordPathAI Eligibility Reminder";
  }

  function message(type, context) {
    context = context || {};
    if (type === "eligibility_reached") return "Based on the information provided, your waiting period appears complete. Log in to RecordPathAI to verify eligibility and generate your packet.";
    if (type === "packet_incomplete") return "Your eligibility review is complete. Finish your record details to generate your court packet.";
    if (type === "court_status_update") return "Your court filing status changed to " + (context.status || "updated") + ". Log in to RecordPathAI to view details.";
    if (context.days === 90) return "Good news. Based on current information, your record may become eligible for sealing in approximately 90 days.";
    return "Good news. Based on current information, your record may become eligible for sealing in approximately " + context.days + " days.";
  }

  function createNotification(subscription, type, context) {
    var rows = loadNotifications();
    var channels = [];
    if (subscription.notify_email !== false && subscription.notification_email) channels.push("email");
    if (subscription.notify_sms && subscription.notification_phone) channels.push("sms");
    if (!channels.length) channels.push("in_app");
    var made = channels.map(function (channel) {
      var body = channel === "sms" && type === "eligibility_reached" ? "You may now be eligible for record sealing. Log in to RecordPathAI to continue." : channel === "sms" && type === "packet_incomplete" ? "Your court packet needs attention. Log in to view details." : message(type, context);
      return { id: id("rwn"), user_id: subscription.user_id, case_id: subscription.case_id, type: type, channel: channel, subject: subject(type), message: body, sent_at: new Date().toISOString(), status: "logged" };
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
        if (days === reminder.days && !event[reminder.flag]) {
          notifications = notifications.concat(createNotification(subscription, reminder.days === 0 ? "eligibility_reached" : "eligibility_reminder", { days: reminder.days }));
          event[reminder.flag] = true;
          if (reminder.days === 0) event.eligibility_notification_sent = true;
          event.updated_at = new Date().toISOString();
        }
      });
    });
    writeJSON(EVENTS_KEY, events);
    notifications = notifications.concat(runPacketAbandonmentCheck(now));
    post("/api/recordwatch/run-daily", { source: "browser-preview" });
    return notifications;
  }


  function runPacketAbandonmentCheck(now) {
    var state = {};
    try { state = JSON.parse(localStorage.getItem("recordPathWorkflowState")) || {}; } catch (error) { state = {}; }
    if (!state.eligibilityCompleted || state.recordDetailsCompleted) return [];
    var completedAt = state.eligibilityCompletedAt || state.updatedAt;
    var days = daysUntil(dateOnly(now || new Date()), completedAt);
    var due = [3, 7, 14].indexOf(days) !== -1;
    if (!due) return [];
    var markerKey = "recordwatchPacketReminder" + days + "Sent";
    if (localStorage.getItem(markerKey) === "true") return [];
    var subscription = loadSubscriptions()[0] || {
      user_id: localStorage.getItem("email") || "demo-user",
      case_id: "demo-case",
      notification_email: localStorage.getItem("email"),
      notification_phone: localStorage.getItem("phone"),
      notify_email: true,
      notify_sms: false
    };
    localStorage.setItem(markerKey, "true");
    return createNotification(subscription, "packet_incomplete", { days: days });
  }

  function recordCourtStatus(caseId, status, userId) {
    if (courtStatuses.indexOf(status) === -1) return [];
    var statuses = readJSON(COURT_STATUS_KEY, {});
    var key = (userId || "demo-user") + ":" + caseId;
    var previous = statuses[key];
    statuses[key] = status;
    writeJSON(COURT_STATUS_KEY, statuses);
    post("/api/recordwatch/court-status", { user_id: userId || "demo-user", case_id: caseId, status: status });
    if (previous && previous !== status) {
      var subscription = loadSubscriptions().find(function (item) { return item.case_id === caseId; }) || { user_id: userId || "demo-user", case_id: caseId, notify_email: false, notify_sms: false };
      return createNotification(subscription, "court_status_update", { status: status });
    }
    return [];
  }

  function getAdminSummary() {
    var notifications = loadNotifications();
    return {
      total_subscribers: loadSubscriptions().length,
      upcoming_eligibility_events: loadEvents().filter(function (item) { return daysUntil(item.eligibility_date) >= 0; }).length,
      notifications_sent: notifications.length,
      failed_deliveries: notifications.filter(function (item) { return item.status === "failed"; }).length,
      sms_usage: notifications.filter(function (item) { return item.channel === "sms"; }).length,
      email_usage: notifications.filter(function (item) { return item.channel === "email"; }).length
    };
  }

  function post(url, payload) {
    if (!window.fetch || !location.protocol.indexOf("file")) return;
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(function () {});
  }

  window.RecordWatchNotifications = {
    courtStatuses: courtStatuses,
    daysUntil: daysUntil,
    loadSubscriptions: loadSubscriptions,
    loadEvents: loadEvents,
    loadNotifications: loadNotifications,
    registerSubscription: registerSubscription,
    registerEligibilityEvent: registerEligibilityEvent,
    createNotification: createNotification,
    runDailyCheck: runDailyCheck,
    runPacketAbandonmentCheck: runPacketAbandonmentCheck,
    recordCourtStatus: recordCourtStatus,
    getAdminSummary: getAdminSummary
  };
}());
