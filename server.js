import express from "express";
import Stripe from "stripe";
import cors from "cors";
import path from "path";
import { runJurisdictionSearch } from "./tools/court-search-core.js";

const app = express();
const port = process.env.PORT || 8080;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

app.use(cors({
  origin: [
    "https://clearmyrecord.github.io",
    "https://recordpathai.com",
    "https://www.recordpathai.com"
  ]
}));

app.use(express.json());

app.get("/api/config/supabase", (req, res) => {
  res.json({
    url: process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || ""
  });
});

app.use(express.static(process.cwd()));

const recordwatchMemory = {
  subscriptions: [],
  events: [],
  notifications: [],
  preferences: [],
  courtStatuses: new Map(),
  jobRuns: []
};

const RECORDWATCH_FROM_EMAIL = "matt@recordpathai.com";
const RECORDWATCH_PLANS = ["free", "premium"];
const RECORDWATCH_PROVIDER_MISSING = "skipped_provider_missing";
const RECORDWATCH_REMINDERS = [
  { days: 90, flag: "reminder_90_sent", type: "eligibility_90_day" },
  { days: 30, flag: "reminder_30_sent", type: "eligibility_30_day" },
  { days: 7, flag: "reminder_7_sent", type: "eligibility_7_day" },
  { days: 0, flag: "reminder_day_sent", type: "eligibility_reached" }
];
const PACKET_REMINDER_TYPES = {
  eligibility_record_details: { 3: "packet_incomplete_3_day", 7: "packet_incomplete_7_day", 14: "packet_incomplete_14_day" },
  record_details_unpaid: { 3: "packet_incomplete_3_day", 7: "packet_incomplete_7_day", 14: "packet_incomplete_14_day" },
  paid_not_generated: { 1: "packet_incomplete_3_day", 3: "packet_incomplete_3_day", 7: "packet_incomplete_7_day" }
};
const COURT_STATUS_VALUES = [
  "RECEIVED",
  "UNDER_REVIEW",
  "CORRECTION_REQUESTED",
  "ACCEPTED",
  "FILED",
  "HEARING_SCHEDULED",
  "GRANTED",
  "DENIED",
  "CLOSED"
];
const COURT_STATUS_NOTIFICATION_TYPES = {
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
const RECORDWATCH_NOTIFICATION_TYPES = [
  "eligibility_90_day",
  "eligibility_30_day",
  "eligibility_7_day",
  "eligibility_reached",
  "packet_incomplete_3_day",
  "packet_incomplete_7_day",
  "packet_incomplete_14_day",
  ...Object.values(COURT_STATUS_NOTIFICATION_TYPES)
];

function recordwatchId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function recordwatchDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function daysBetweenDates(from, to) {
  const start = new Date(`${recordwatchDateOnly(from || new Date())}T00:00:00.000Z`);
  const end = new Date(`${recordwatchDateOnly(to)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end - start) / 86400000);
}

function normalizeRecordwatchStatus(status) {
  return String(status || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizeRecordwatchPlan(payload = {}) {
  const plan = String(payload.plan_type || payload.planType || "free").trim().toLowerCase();
  return RECORDWATCH_PLANS.includes(plan) ? plan : "free";
}

function normalizePreferences(payload = {}) {
  return {
    eligibility_email: payload.eligibility_email !== false && payload.eligibilityEmail !== false,
    eligibility_sms: Boolean(payload.eligibility_sms || payload.eligibilitySms),
    court_status_updates: payload.court_status_updates !== false && payload.courtStatusUpdates !== false,
    packet_reminders: payload.packet_reminders !== false && payload.packetReminders !== false,
    marketing_emails: Boolean(payload.marketing_emails || payload.marketingEmails)
  };
}

function getMemoryPreferences(userId) {
  return recordwatchMemory.preferences.find((item) => item.user_id === userId) || {
    id: recordwatchId("rwp"),
    user_id: userId,
    eligibility_email: true,
    eligibility_sms: false,
    court_status_updates: true,
    packet_reminders: true,
    marketing_emails: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function upsertMemoryPreferences(payload = {}) {
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const existing = recordwatchMemory.preferences.find((item) => item.user_id === userId);
  const row = Object.assign(existing || { id: recordwatchId("rwp"), user_id: userId, created_at: new Date().toISOString() }, normalizePreferences(payload), { updated_at: new Date().toISOString() });
  if (!existing) recordwatchMemory.preferences.push(row);
  return row;
}

function shouldSendChannel({ channel, type, subscription, preferences, adminOverride = false }) {
  if (channel === "in_app") return true;
  if (channel === "email") {
    if (type.startsWith("eligibility_")) return preferences.eligibility_email !== false;
    if (type.startsWith("packet_incomplete")) return preferences.packet_reminders !== false;
    if (type.startsWith("court_status_")) return adminOverride || (subscription.premium_active && preferences.court_status_updates !== false);
    return true;
  }
  if (channel === "sms") {
    if (!subscription.premium_active || preferences.eligibility_sms !== true) return false;
    if (type.startsWith("court_status_")) return adminOverride || preferences.court_status_updates !== false;
    return type.startsWith("eligibility_") || type.startsWith("packet_incomplete");
  }
  return false;
}

function recordwatchSubject(type, context = {}) {
  if (type === "eligibility_reached") return "You May Now Be Eligible";
  if (type.startsWith("packet_incomplete")) return "Finish Your RecordPathAI Packet";
  if (type.startsWith("court_status_")) return "RecordPathAI Court Status Update";
  return "RecordPathAI Eligibility Reminder";
}

function recordwatchMessage(type, context = {}) {
  if (type === "eligibility_reached") return "Based on the information provided, your waiting period appears complete. Log in to RecordPathAI to verify eligibility and generate your packet.";
  if (type.startsWith("packet_incomplete")) return "Your eligibility review is complete. Finish your record details to generate your court packet.";
  if (type.startsWith("court_status_")) {
    const source = context.source === "verified_court" || context.source === "admin" ? "" : " This is a RecordWatch manual or system-test update, not a live court integration.";
    const hearing = context.hearing_date ? ` Hearing date: ${context.hearing_date}.` : "";
    return `Your court filing status changed to ${context.status || "updated"}.${hearing} Log in to RecordPathAI to view details.${source}`;
  }
  if (type === "eligibility_90_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 90 days.";
  if (type === "eligibility_30_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 30 days.";
  if (type === "eligibility_7_day") return "Good news. Based on current information, your record may become eligible for sealing in approximately 7 days.";
  return "RecordWatch has an update about your eligibility timeline.";
}

function recordwatchSmsMessage(type) {
  if (type === "eligibility_reached") return "You may now be eligible to clear your record. Log in to RecordPathAI to continue.";
  if (type.startsWith("packet_incomplete")) return "Your court packet needs attention. Log in to RecordPathAI to continue.";
  if (type.startsWith("court_status_")) return "Your RecordPathAI court status changed. Log in to view details.";
  return "RecordPathAI eligibility reminder: log in to review your next step.";
}

function brandedEmailHtml({ subject, message, actionUrl }) {
  const safeSubject = String(subject || "RecordPathAI Notification").replace(/[<>]/g, "");
  const safeMessage = String(message || "").replace(/[<>]/g, "");
  const href = String(actionUrl || process.env.PUBLIC_APP_URL || "https://recordpathai.com/dashboard.html").replace(/"/g, "%22");
  return `<!doctype html><html><body style="margin:0;background:#eef4ff;font-family:Arial,sans-serif;color:#17345f;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;border:1px solid #dbe7fb;box-shadow:0 16px 44px rgba(32,63,112,.12);overflow:hidden;"><tr><td style="padding:28px 32px;background:linear-gradient(135deg,#143d8f,#6da7ff);color:#fff;"><div style="font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">RecordPathAI</div><h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${safeSubject}</h1></td></tr><tr><td style="padding:32px;"><p style="font-size:17px;line-height:1.7;margin:0 0 24px;">${safeMessage}</p><a href="${href}" style="display:inline-block;background:#143d8f;color:#fff;text-decoration:none;border-radius:999px;padding:14px 22px;font-weight:700;">Open RecordPathAI</a><p style="font-size:12px;color:#6a7894;line-height:1.6;margin:28px 0 0;">RecordWatch reminders are based on the information you provide. RecordPathAI is not a law firm and does not guarantee eligibility or court approval.</p></td></tr></table></td></tr></table></body></html>`;
}

async function sendRecordwatchEmail(to, subject, message) {
  if (!to) return { status: "skipped", detail: "Missing email" };
  if (!process.env.RESEND_API_KEY) return { status: RECORDWATCH_PROVIDER_MISSING, detail: "RESEND_API_KEY not configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `RecordPathAI <${RECORDWATCH_FROM_EMAIL}>`,
      reply_to: RECORDWATCH_FROM_EMAIL,
      to,
      subject,
      html: brandedEmailHtml({ subject, message })
    })
  });
  if (!response.ok) throw new Error(`Resend delivery failed: ${response.status}`);
  return { status: "sent", detail: await response.text() };
}

async function sendRecordwatchSms(to, message) {
  if (!to) return { status: "skipped", detail: "Missing phone" };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { status: RECORDWATCH_PROVIDER_MISSING, detail: "Twilio is not configured" };
  const params = new URLSearchParams({ To: to, From: from, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!response.ok) throw new Error(`Twilio delivery failed: ${response.status}`);
  return { status: "sent", detail: await response.text() };
}

function supabaseRestConfig() {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseRest(table, { method = "GET", query = "", body, prefer = "return=representation" } = {}) {
  const config = supabaseRestConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: prefer
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error(`Supabase ${table} ${method} failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return [];
  return response.json();
}

function supabaseSafeCaseId(caseId) {
  return isUuid(caseId) ? caseId : null;
}

async function persistRecordwatchRow(table, row, conflictColumns) {
  try {
    const payload = Object.assign({}, row);
    if (!isUuid(payload.id)) delete payload.id;
    if ("case_id" in payload) payload.case_id = supabaseSafeCaseId(payload.case_id);
    const query = conflictColumns ? `?on_conflict=${encodeURIComponent(conflictColumns)}` : "";
    const data = await supabaseRest(table, { method: "POST", query, body: payload, prefer: "resolution=merge-duplicates,return=representation" });
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.warn(`RecordWatch Supabase persistence fallback for ${table}:`, error.message);
    return null;
  }
}

async function fetchRecordwatchRows(table, userId) {
  if (!userId) return [];
  try {
    const orderColumn = table === "recordwatch_notifications" ? "sent_at" : "created_at";
    const data = await supabaseRest(table, { query: `?user_id=eq.${encodeURIComponent(userId)}&order=${orderColumn}.desc` });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`RecordWatch Supabase fetch fallback for ${table}:`, error.message);
    return null;
  }
}

async function createRecordwatchNotification(subscription, type, context = {}) {
  if (!RECORDWATCH_NOTIFICATION_TYPES.includes(type)) type = "eligibility_30_day";
  if (notificationAlreadyExists(subscription.user_id, subscription.case_id, type, context.notification_date || recordwatchDateOnly(new Date()))) return [];
  let preferences = Object.assign(getMemoryPreferences(subscription.user_id), context.preferences || {});
  const remotePreferences = await fetchRecordwatchRows("user_notification_preferences", subscription.user_id);
  if (remotePreferences && remotePreferences[0]) preferences = Object.assign(preferences, remotePreferences[0]);
  const subject = recordwatchSubject(type, context);
  const message = recordwatchMessage(type, context);
  const channels = [];
  if (subscription.notify_email !== false && subscription.notification_email) channels.push("email");
  if (subscription.notify_sms && subscription.notification_phone) channels.push("sms");
  if (!channels.length) channels.push("in_app");

  const eligibleChannels = channels.filter((channel) => shouldSendChannel({ channel, type, subscription, preferences, adminOverride: context.admin_override === true }));
  if (!eligibleChannels.length) eligibleChannels.push("in_app");
  const sent = [];
  for (const channel of eligibleChannels) {
    const blockedAlert = channels.length > 0 && channel === "in_app" && type.startsWith("court_status_") && !subscription.premium_active && context.admin_override !== true;
    const row = {
      id: recordwatchId("rwn"),
      user_id: subscription.user_id,
      case_id: subscription.case_id,
      type,
      channel,
      subject,
      message: channel === "sms" ? recordwatchSmsMessage(type) : message,
      sent_at: new Date().toISOString(),
      status: blockedAlert ? "skipped" : "queued",
      source: context.source || "system_test",
      notification_date: context.notification_date || recordwatchDateOnly(new Date())
    };
    try {
      if (!blockedAlert && channel === "email") row.status = (await sendRecordwatchEmail(subscription.notification_email, subject, message)).status;
      if (!blockedAlert && channel === "sms") row.status = (await sendRecordwatchSms(subscription.notification_phone, row.message)).status;
      if (!blockedAlert && channel === "in_app") row.status = "logged";
    } catch (error) {
      row.status = "failed";
      row.error_message = error.message;
    }
    recordwatchMemory.notifications.push(row);
    await persistRecordwatchRow("recordwatch_notifications", row);
    sent.push(row);
  }
  return sent;
}

function notificationAlreadyExists(userId, caseId, type, notificationDate) {
  return recordwatchMemory.notifications.some((item) => item.user_id === userId && item.case_id === caseId && item.type === type && item.notification_date === notificationDate);
}

function upsertRecordwatchEvent(payload) {
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const existing = recordwatchMemory.events.find((item) => item.user_id === userId && item.case_id === caseId);
  const row = Object.assign(existing || {
    id: recordwatchId("rwe"),
    user_id: userId,
    case_id: caseId,
    reminder_90_sent: false,
    reminder_30_sent: false,
    reminder_7_sent: false,
    reminder_day_sent: false,
    eligibility_notification_sent: false,
    created_at: new Date().toISOString()
  }, {
    eligibility_date: recordwatchDateOnly(payload.eligibility_date || payload.eligibilityDate),
    eligibility_reason: safe(payload.eligibility_reason || payload.eligibilityReason),
    waiting_period: safe(payload.waiting_period || payload.waitingPeriod),
    eligibility_confidence: safe(payload.eligibility_confidence || payload.eligibilityConfidence, "medium"),
    eligibility_confidence_reason: safe(payload.eligibility_confidence_reason || payload.eligibilityConfidenceReason),
    eligibility_completed_at: payload.eligibility_completed_at || payload.eligibilityCompletedAt || null,
    record_details_completed_at: payload.record_details_completed_at || payload.recordDetailsCompletedAt || null,
    paid_at: payload.paid_at || payload.paidAt || null,
    packet_generated_at: payload.packet_generated_at || payload.packetGeneratedAt || null,
    updated_at: new Date().toISOString()
  });
  if (!existing) recordwatchMemory.events.push(row);
  persistRecordwatchRow("recordwatch_eligibility_events", row, "user_id,case_id");
  return row;
}

function upsertRecordwatchSubscription(payload) {
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const existing = recordwatchMemory.subscriptions.find((item) => item.user_id === userId && item.case_id === caseId);
  const planType = normalizeRecordwatchPlan(payload);
  const expiresAt = payload.premium_expires_at || payload.premiumExpiresAt || null;
  const notExpired = !expiresAt || new Date(expiresAt).getTime() > Date.now();
  const premiumActive = Boolean(payload.premium_active || payload.premiumActive || planType === "premium") && notExpired;
  const row = Object.assign(existing || { id: recordwatchId("rws"), user_id: userId, case_id: caseId, created_at: new Date().toISOString() }, {
    notification_email: safe(payload.notification_email || payload.notificationEmail || payload.email),
    notification_phone: safe(payload.notification_phone || payload.notificationPhone || payload.phone),
    notify_email: payload.notify_email !== false && payload.notifyEmail !== false,
    notify_sms: premiumActive && Boolean(payload.notify_sms || payload.notifySms),
    plan_type: premiumActive ? "premium" : planType,
    premium_active: premiumActive,
    premium_started_at: payload.premium_started_at || payload.premiumStartedAt || (premiumActive ? existing?.premium_started_at || new Date().toISOString() : null),
    premium_expires_at: expiresAt,
    status: safe(payload.status, "active")
  });
  if (!existing) recordwatchMemory.subscriptions.push(row);
  persistRecordwatchRow("recordwatch_subscriptions", row, "user_id,case_id");
  return row;
}

function createJobRun(jobType = "recordwatch_daily") {
  const row = { id: recordwatchId("rwj"), job_type: jobType, started_at: new Date().toISOString(), status: "running", processed_count: 0, sent_count: 0, failed_count: 0, error_message: "" };
  recordwatchMemory.jobRuns.push(row);
  return row;
}

async function finishJobRun(jobRun, updates = {}) {
  Object.assign(jobRun, updates, { finished_at: new Date().toISOString() });
  await persistRecordwatchRow("recordwatch_job_runs", jobRun);
  return jobRun;
}

function getSubscriptionForEvent(event) {
  return recordwatchMemory.subscriptions.find((item) => item.case_id === event.case_id && item.user_id === event.user_id && item.status === "active");
}

async function runRecordwatchDailyJob({ now = new Date() } = {}) {
  const jobRun = createJobRun();
  const results = { checked_at: now.toISOString(), eligibility_reminders: 0, packet_reminders: 0, court_status_alerts: 0, notifications: [] };
  try {
    for (const event of recordwatchMemory.events) {
      jobRun.processed_count += 1;
      const subscription = getSubscriptionForEvent(event);
      if (!subscription || !event.eligibility_date) continue;
      const days = daysBetweenDates(now, event.eligibility_date);
      for (const reminder of RECORDWATCH_REMINDERS) {
        const due = reminder.days === 0 ? days !== null && days <= 0 : days === reminder.days;
        if (due && !event[reminder.flag]) {
          const sent = await createRecordwatchNotification(subscription, reminder.type, { notification_date: event.eligibility_date });
          event[reminder.flag] = true;
          if (reminder.days === 0) event.eligibility_notification_sent = true;
          event.updated_at = new Date().toISOString();
          await persistRecordwatchRow("recordwatch_eligibility_events", event, "user_id,case_id");
          results.eligibility_reminders += 1;
          results.notifications.push(...sent);
        }
      }
      const packetNotifications = await runPacketReminderChecks(event, subscription, now);
      results.packet_reminders += packetNotifications.length;
      results.notifications.push(...packetNotifications);
    }
    jobRun.sent_count = results.notifications.filter((item) => item.status === "sent" || item.status === "queued" || item.status === "logged").length;
    jobRun.failed_count = results.notifications.filter((item) => item.status === "failed" || item.status === RECORDWATCH_PROVIDER_MISSING).length;
    await finishJobRun(jobRun, { status: "completed" });
    return results;
  } catch (error) {
    await finishJobRun(jobRun, { status: "failed", error_message: error.message });
    throw error;
  }
}

async function runPacketReminderChecks(event, subscription, now) {
  const sent = [];
  const checks = [
    { key: "eligibility_record_details", anchor: event.eligibility_completed_at || event.created_at, condition: event.eligibility_completed_at && !event.record_details_completed_at },
    { key: "record_details_unpaid", anchor: event.record_details_completed_at, condition: event.record_details_completed_at && !event.paid_at },
    { key: "paid_not_generated", anchor: event.paid_at, condition: event.paid_at && !event.packet_generated_at }
  ];
  for (const check of checks) {
    if (!check.condition) continue;
    const elapsed = daysBetweenDates(check.anchor, now);
    const type = PACKET_REMINDER_TYPES[check.key][elapsed];
    if (!type) continue;
    const notifications = await createRecordwatchNotification(subscription, type, { notification_date: `${event.case_id}:${check.key}:${elapsed}` });
    sent.push(...notifications);
  }
  return sent;
}

async function recordwatchAdminSummary() {
  const notifications = recordwatchMemory.notifications;
  return {
    total_subscribers: recordwatchMemory.subscriptions.length,
    free_subscribers: recordwatchMemory.subscriptions.filter((item) => item.plan_type !== "premium").length,
    premium_subscribers: recordwatchMemory.subscriptions.filter((item) => item.premium_active).length,
    upcoming_eligibility_events: recordwatchMemory.events.filter((item) => daysBetweenDates(new Date(), item.eligibility_date) >= 0).length,
    notifications_sent: notifications.filter((item) => ["sent", "queued", "logged"].includes(item.status)).length,
    failed_or_skipped_notifications: notifications.filter((item) => item.status === "failed" || item.status === RECORDWATCH_PROVIDER_MISSING || item.status === "skipped").length,
    provider_missing_warnings: notifications.filter((item) => item.status === RECORDWATCH_PROVIDER_MISSING).length,
    latest_job_runs: recordwatchMemory.jobRuns.slice(-5).reverse(),
    sms_usage: notifications.filter((item) => item.channel === "sms").length,
    email_usage: notifications.filter((item) => item.channel === "email").length
  };
}

function isAdminRequest(req) {
  const configuredKey = process.env.RECORDWATCH_ADMIN_KEY || "";
  if (configuredKey && req.get("x-recordpath-admin-key") === configuredKey) return true;
  if (process.env.RECORDWATCH_DEMO_ADMIN === "true" && req.get("x-recordpath-demo-admin") === "true") return true;
  return false;
}

const OFFICIAL_PACKET_HINTS = [
  "application for sealing",
  "2953.32",
  "conviction",
  "dismissal",
  "expungement",
  "pdf",
  "forms"
];

const OFFICIAL_DOMAIN_HINTS = [
  ".gov",
  ".us",
  "clerk",
  "court",
  "municipal",
  "county",
  "commonpleas",
  "common-pleas",
  "co."
];


function slugify(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function suggestCourtType(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('municipal')) return 'municipal';
  if (t.includes('common pleas') || t.includes('common-pleas')) return 'common-pleas';
  if (t.includes('district')) return 'district';
  if (t.includes('superior')) return 'superior';
  if (t.includes('circuit')) return 'circuit';
  if (t.includes('county')) return 'county';
  return 'other';
}
function safe(value, fallback = "") {
  return (value ?? "").toString().trim() || fallback;
}

function getBaseUrl(req) {
  const envUrl = safe(process.env.PUBLIC_APP_URL);

  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  const protoHeader = safe(req.headers["x-forwarded-proto"]);
  const hostHeader = safe(req.headers["x-forwarded-host"]) || safe(req.get("host"));
  const protocol = protoHeader || req.protocol || "https";

  if (!hostHeader) {
    return "http://localhost:8080";
  }

  return `${protocol}://${hostHeader}`;
}

function normalizeCourtName(input) {
  return String(input || "").trim().replace(/\s+/g, " ");
}

function scoreResult(result, courtQuery) {
  const title = (result.title || "").toLowerCase();
  const url = (result.url || "").toLowerCase();
  const query = (courtQuery || "").toLowerCase();

  let score = 0;

  for (const hint of OFFICIAL_PACKET_HINTS) {
    if (title.includes(hint) || url.includes(hint.replace(/\./g, ""))) {
      score += 2;
    }
  }

  for (const hint of OFFICIAL_DOMAIN_HINTS) {
    if (url.includes(hint)) {
      score += 2;
    }
  }

  if (url.endsWith(".pdf") || url.includes("/view/")) score += 4;
  if (title.includes("application for sealing")) score += 5;
  if (title.includes("conviction")) score += 2;

  if (query && (title.includes(query) || url.includes(query.replace(/\s+/g, "-")))) {
    score += 4;
  }

  if (url.includes("law") && !url.includes("clerk") && !url.includes("court")) {
    score -= 4;
  }

  if (url.includes("blog")) {
    score -= 4;
  }

  return score;
}

function buildSearchQueries(court, state, type) {
  return [
    `${court} ${state} ${type} packet pdf`,
    `${court} clerk forms application for sealing pdf`,
    `${court} 2953.32 conviction pdf`
  ];
}

async function searchWeb(query) {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    throw new Error("Missing SERPAPI_KEY");
  }

  const url = new URL("https://serpapi.com/search.json");

  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", "10");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const json = await response.json();
  const results = Array.isArray(json.organic_results)
    ? json.organic_results
    : [];

  return results.map((result) => ({
    title: result.title || "",
    url: result.link || "",
    snippet: result.snippet || ""
  }));
}

function woodCountyShortcut(court) {
  const c = court.toLowerCase();

  if (!c.includes("wood")) {
    return null;
  }

  return {
    court: "Wood County Court of Common Pleas",
    packetTitle: "Application for Sealing 2953.32 (Conviction)",
    packetUrl: "https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF",
    source: "Wood County Clerk of Courts",
    confidence: 0.99
  };
}




app.post('/api/jurisdiction-search', async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await runJurisdictionSearch(payload);
    return res.json({ ...result, generatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ backendConfigured: false, queries: [], results: [], errors: [error.message], generatedAt: new Date().toISOString() });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "RecordPathAI"
  });
});


app.post("/api/recordwatch/subscribe", async (req, res) => {
  try {
    const subscription = upsertRecordwatchSubscription(req.body || {});
    let event = null;
    if ((req.body || {}).eligibility_date || (req.body || {}).eligibilityDate) event = upsertRecordwatchEvent(Object.assign({}, req.body, { user_id: subscription.user_id, case_id: subscription.case_id }));
    res.json({ ok: true, persistence: supabaseRestConfig() ? "supabase" : "memory", subscription, event });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/recordwatch/subscriptions", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("recordwatch_subscriptions", userId);
  const rows = supabaseRows || recordwatchMemory.subscriptions.filter((item) => item.user_id === userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", subscriptions: rows });
});

app.post("/api/recordwatch/eligibility-event", async (req, res) => {
  try {
    const event = upsertRecordwatchEvent(req.body || {});
    res.json({ ok: true, persistence: supabaseRestConfig() ? "supabase" : "memory", event });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/recordwatch/events", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("recordwatch_eligibility_events", userId);
  const rows = supabaseRows || recordwatchMemory.events.filter((item) => item.user_id === userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", events: rows });
});

app.get("/api/recordwatch/notifications", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("recordwatch_notifications", userId);
  const rows = supabaseRows || recordwatchMemory.notifications.filter((item) => item.user_id === userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", notifications: rows });
});

app.get("/api/recordwatch/preferences", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "user_id is required" });
  const supabaseRows = await fetchRecordwatchRows("user_notification_preferences", userId);
  const preference = supabaseRows && supabaseRows[0] ? supabaseRows[0] : getMemoryPreferences(userId);
  res.json({ ok: true, source: supabaseRows ? "supabase" : "local_fallback", preferences: preference });
});

app.post("/api/recordwatch/preferences", async (req, res) => {
  try {
    const preferences = upsertMemoryPreferences(req.body || {});
    await persistRecordwatchRow("user_notification_preferences", preferences, "user_id");
    res.json({ ok: true, persistence: supabaseRestConfig() ? "supabase" : "memory", preferences });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/recordwatch/court-status", async (req, res) => {
  try {
    const payload = req.body || {};
    const status = normalizeRecordwatchStatus(payload.status);
    if (!COURT_STATUS_VALUES.includes(status)) return res.status(400).json({ ok: false, error: "Unsupported court status" });
    const userId = safe(payload.user_id || payload.userId, "demo-user");
    const caseId = safe(payload.case_id || payload.caseId, "demo-case");
    const source = ["verified_court", "admin"].includes(payload.source) ? payload.source : safe(payload.source, "manual");
    const previous = recordwatchMemory.courtStatuses.get(`${userId}:${caseId}`);
    recordwatchMemory.courtStatuses.set(`${userId}:${caseId}`, status);
    const subscription = recordwatchMemory.subscriptions.find((item) => item.user_id === userId && item.case_id === caseId && item.status === "active") || {
      user_id: userId,
      case_id: caseId,
      notification_email: payload.notification_email,
      notification_phone: payload.notification_phone,
      notify_email: true,
      notify_sms: false,
      plan_type: "free",
      premium_active: false
    };
    const type = COURT_STATUS_NOTIFICATION_TYPES[status];
    const notifications = await createRecordwatchNotification(subscription, type, {
      status,
      note: payload.note,
      court_id: payload.court_id || payload.courtId,
      hearing_date: payload.hearing_date || payload.hearingDate,
      source,
      admin_override: payload.admin_override === true || payload.adminOverride === true,
      notification_date: `${caseId}:${status}:${recordwatchDateOnly(new Date())}`
    });
    res.json({ ok: true, previous_status: previous || null, status, source, notifications });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/recordwatch/run-daily", async (req, res) => {
  try {
    res.json({ ok: true, result: await runRecordwatchDailyJob() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/recordwatch/admin-summary", async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ ok: false, error: "Admin access required" });
  res.json({ ok: true, summary: await recordwatchAdminSummary() });
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        error: "Missing STRIPE_SECRET_KEY"
      });
    }

    const {
      amount = 5000,
      currency = "usd",
      productType = "record-sealing-packet",
      applicant = {},
      caseInfo = {},
      eligibility = {},
      successUrl,
      cancelUrl
    } = req.body || {};

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: "Invalid amount"
      });
    }

    const baseUrl = getBaseUrl(req);

    const finalSuccessUrl = safe(successUrl) || `${baseUrl}/payment-success.html`;
    const finalCancelUrl = safe(cancelUrl) || `${baseUrl}/packet.html?payment=cancelled`;
    const internalOrderId = `packet_${Date.now()}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      ui_mode: "hosted",
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      client_reference_id: internalOrderId,
      customer_email: safe(applicant.email) || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: safe(currency, "usd").toLowerCase(),
            unit_amount: numericAmount,
            product_data: {
              name: "RecordPathAI Packet Preparation",
              description: "Court-ready sealing / expungement packet preparation"
            }
          }
        }
      ],
      metadata: {
        productType: safe(productType),
        orderId: internalOrderId,

        fullName: safe(applicant.fullName),
        email: safe(applicant.email),
        phone: safe(applicant.phone),
        street: safe(applicant.street),
        apartment: safe(applicant.apartment),
        city: safe(applicant.city),
        residenceState: safe(applicant.residenceState),
        zip: safe(applicant.zip),

        caseState: safe(caseInfo.caseState),
        caseNumber: safe(caseInfo.caseNumber),
        chargeName: safe(caseInfo.chargeName),
        offenseCode: safe(caseInfo.offenseCode),
        chargeLevel: safe(caseInfo.chargeLevel),
        disposition: safe(caseInfo.disposition),
        dispositionDate: safe(caseInfo.dispositionDate),
        dischargeDate: safe(caseInfo.dischargeDate),
        court: safe(caseInfo.court),
        county: safe(caseInfo.county),
        estimatedEligibleDate: safe(caseInfo.estimatedEligibleDate),

        eligibilityStatus: safe(eligibility.status),
        reliefType: safe(eligibility.reliefType),
        manualReview: String(!!eligibility.manualReview)
      }
    });

    return res.json({
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);

    return res.status(500).json({
      error: error?.message || "Failed to create Stripe checkout session"
    });
  }
});

app.get("/api/find-packet", async (req, res) => {
  try {
    const court = normalizeCourtName(req.query.court);
    const state = normalizeCourtName(req.query.state || "Ohio");
    const type = normalizeCourtName(req.query.type || "sealing");

    if (!court) {
      return res.status(400).json({
        error: "Missing court"
      });
    }

    const shortcut = woodCountyShortcut(court);

    if (shortcut) {
      return res.json(shortcut);
    }

    const queries = buildSearchQueries(court, state, type);
    const allResults = [];

    for (const query of queries) {
      const results = await searchWeb(query);
      allResults.push(...results);
    }

    const deduped = [];
    const seen = new Set();

    for (const result of allResults) {
      if (!result.url || seen.has(result.url)) continue;

      seen.add(result.url);
      deduped.push(result);
    }

    const ranked = deduped
      .map((result) => ({
        ...result,
        _score: scoreResult(result, court)
      }))
      .sort((a, b) => b._score - a._score);

    const best = ranked[0];

    if (!best || best._score < 4) {
      return res.json({
        court,
        packetTitle: "",
        packetUrl: "",
        source: "",
        confidence: 0
      });
    }

    let source = "Official court source";

    try {
      source = new URL(best.url).hostname;
    } catch {}

    return res.json({
      court,
      packetTitle: best.title,
      packetUrl: best.url,
      source,
      confidence: Math.min(0.98, 0.5 + best._score / 20)
    });
  } catch (error) {
    console.error("Packet search error:", error);

    return res.status(500).json({
      error: error?.message || "Could not search for packet"
    });
  }
});

app.get("/api/fetch-pdf", async (req, res) => {
  try {
    const url = String(req.query.url || "");

    if (!url.startsWith("http")) {
      return res.status(400).send("Invalid URL");
    }

    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    const allowed =
      host.includes("court") ||
      host.includes("clerk") ||
      host.endsWith(".gov") ||
      host.endsWith(".us");

    if (!allowed) {
      return res.status(403).send("Only official court sources are allowed");
    }

    const pdfResponse = await fetch(url);

    if (!pdfResponse.ok) {
      return res.status(502).send("Could not fetch PDF");
    }

    const contentType = pdfResponse.headers.get("content-type") || "";

    if (!contentType.includes("pdf")) {
      return res.status(400).send("Source is not a PDF");
    }

    const bytes = Buffer.from(await pdfResponse.arrayBuffer());

    res.setHeader("Content-Type", "application/pdf");
    res.send(bytes);
  } catch (error) {
    console.error("PDF fetch error:", error);

    res.status(500).send("Failed to fetch PDF");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

function scheduleRecordwatchNightlyJob() {
  if (process.env.RECORDWATCH_DISABLE_SCHEDULER === "true") return;
  setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 7) {
      runRecordwatchDailyJob().then((result) => console.log("RecordWatch daily job", result)).catch((error) => console.error("RecordWatch daily job failed", error));
    }
  }, 60 * 60 * 1000);
}

app.listen(port, () => {
  console.log(`RecordPathAI server listening on port ${port}`);
  scheduleRecordwatchNightlyJob();
});
