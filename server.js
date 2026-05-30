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
  courtStatuses: new Map(),
  packetReminders: new Map()
};

const RECORDWATCH_REMINDERS = [
  { days: 90, flag: "reminder_90_sent" },
  { days: 30, flag: "reminder_30_sent" },
  { days: 7, flag: "reminder_7_sent" },
  { days: 0, flag: "reminder_day_sent" }
];

const COURT_STATUS_VALUES = [
  "Received",
  "Under Review",
  "Correction Requested",
  "Accepted",
  "Filed",
  "Hearing Scheduled",
  "Granted",
  "Denied"
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

function recordwatchSubject(type) {
  if (type === "eligibility_reached") return "You May Now Be Eligible";
  if (type === "packet_incomplete") return "Finish Your RecordPathAI Packet";
  if (type === "court_status_update") return "RecordPathAI Court Status Update";
  return "RecordPathAI Eligibility Reminder";
}

function recordwatchMessage(type, context = {}) {
  if (type === "eligibility_reached") return "Based on the information provided, your waiting period appears complete. Log in to RecordPathAI to verify eligibility and generate your packet.";
  if (type === "packet_incomplete") return "Your eligibility review is complete. Finish your record details to generate your court packet.";
  if (type === "court_status_update") return `Your court filing status changed to ${context.status || "updated"}. Log in to RecordPathAI to view details and next steps.`;
  if (context.days === 90) return "Good news. Based on current information, your record may become eligible for sealing in approximately 90 days.";
  return `Good news. Based on current information, your record may become eligible for sealing in approximately ${context.days} day${context.days === 1 ? "" : "s"}.`;
}

function brandedEmailHtml({ subject, message, actionUrl }) {
  const safeSubject = String(subject || "RecordPathAI Notification").replace(/[<>]/g, "");
  const safeMessage = String(message || "").replace(/[<>]/g, "");
  const href = String(actionUrl || process.env.PUBLIC_APP_URL || "https://recordpathai.com/dashboard.html").replace(/"/g, "%22");
  return `<!doctype html><html><body style="margin:0;background:#eef4ff;font-family:Arial,sans-serif;color:#17345f;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;border:1px solid #dbe7fb;box-shadow:0 16px 44px rgba(32,63,112,.12);overflow:hidden;"><tr><td style="padding:28px 32px;background:linear-gradient(135deg,#143d8f,#6da7ff);color:#fff;"><div style="font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">RecordPathAI</div><h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${safeSubject}</h1></td></tr><tr><td style="padding:32px;"><p style="font-size:17px;line-height:1.7;margin:0 0 24px;">${safeMessage}</p><a href="${href}" style="display:inline-block;background:#143d8f;color:#fff;text-decoration:none;border-radius:999px;padding:14px 22px;font-weight:700;">Open RecordPathAI</a><p style="font-size:12px;color:#6a7894;line-height:1.6;margin:28px 0 0;">RecordWatch provides reminders and document workflow support. It is not legal advice and does not guarantee eligibility, filing acceptance, sealing, or expungement.</p></td></tr></table></td></tr></table></body></html>`;
}

async function sendRecordwatchEmail(to, subject, message) {
  if (!to) return { status: "skipped", detail: "Missing email" };
  if (!process.env.RESEND_API_KEY) return { status: "queued", detail: "RESEND_API_KEY not configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RECORDWATCH_EMAIL_FROM || "RecordPathAI <notifications@recordpathai.com>",
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
  if (!sid || !token || !from) return { status: "queued", detail: "Twilio is not configured" };
  const params = new URLSearchParams({ To: to, From: from, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!response.ok) throw new Error(`Twilio delivery failed: ${response.status}`);
  return { status: "sent", detail: await response.text() };
}

async function createRecordwatchNotification(subscription, type, context = {}) {
  const subject = recordwatchSubject(type);
  const message = recordwatchMessage(type, context);
  const channels = [];
  if (subscription.notify_email !== false && subscription.notification_email) channels.push("email");
  if (subscription.notify_sms && subscription.notification_phone) channels.push("sms");
  if (!channels.length) channels.push("in_app");

  const sent = [];
  for (const channel of channels) {
    const row = {
      id: recordwatchId("rwn"),
      user_id: subscription.user_id,
      case_id: subscription.case_id,
      type,
      channel,
      subject,
      message: channel === "sms" && type === "eligibility_reached" ? "You may now be eligible for record sealing. Log in to RecordPathAI to continue." : channel === "sms" && type === "packet_incomplete" ? "Your court packet needs attention. Log in to view details." : message,
      sent_at: new Date().toISOString(),
      status: "queued"
    };
    try {
      if (channel === "email") row.status = (await sendRecordwatchEmail(subscription.notification_email, subject, message)).status;
      if (channel === "sms") row.status = (await sendRecordwatchSms(subscription.notification_phone, row.message)).status;
      if (channel === "in_app") row.status = "logged";
    } catch (error) {
      row.status = "failed";
      row.error = error.message;
    }
    recordwatchMemory.notifications.push(row);
    sent.push(row);
  }
  return sent;
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
    updated_at: new Date().toISOString()
  });
  if (!existing) recordwatchMemory.events.push(row);
  return row;
}

function upsertRecordwatchSubscription(payload) {
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const existing = recordwatchMemory.subscriptions.find((item) => item.user_id === userId && item.case_id === caseId);
  const row = Object.assign(existing || { id: recordwatchId("rws"), user_id: userId, case_id: caseId, created_at: new Date().toISOString() }, {
    notification_email: safe(payload.notification_email || payload.notificationEmail || payload.email),
    notification_phone: safe(payload.notification_phone || payload.notificationPhone || payload.phone),
    notify_email: payload.notify_email !== false && payload.notifyEmail !== false,
    notify_sms: Boolean(payload.notify_sms || payload.notifySms),
    status: safe(payload.status, "active")
  });
  if (!existing) recordwatchMemory.subscriptions.push(row);
  return row;
}

async function runRecordwatchDailyJob({ now = new Date() } = {}) {
  const results = { checked_at: now.toISOString(), eligibility_reminders: 0, packet_reminders: 0, court_status_alerts: 0, notifications: [] };
  for (const event of recordwatchMemory.events) {
    const subscription = recordwatchMemory.subscriptions.find((item) => item.case_id === event.case_id && item.user_id === event.user_id && item.status === "active");
    if (!subscription || !event.eligibility_date) continue;
    const days = daysBetweenDates(now, event.eligibility_date);
    for (const reminder of RECORDWATCH_REMINDERS) {
      if (days === reminder.days && !event[reminder.flag]) {
        const type = reminder.days === 0 ? "eligibility_reached" : "eligibility_reminder";
        const sent = await createRecordwatchNotification(subscription, type, { days: reminder.days });
        event[reminder.flag] = true;
        if (reminder.days === 0) event.eligibility_notification_sent = true;
        event.updated_at = new Date().toISOString();
        results.eligibility_reminders += 1;
        results.notifications.push(...sent);
      }
    }
  }
  return results;
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
    res.json({ ok: true, subscription, event });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/recordwatch/eligibility-event", async (req, res) => {
  try {
    const event = upsertRecordwatchEvent(req.body || {});
    res.json({ ok: true, event });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/recordwatch/court-status", async (req, res) => {
  try {
    const payload = req.body || {};
    const status = safe(payload.status);
    if (!COURT_STATUS_VALUES.includes(status)) return res.status(400).json({ ok: false, error: "Unsupported court status" });
    const userId = safe(payload.user_id || payload.userId, "demo-user");
    const caseId = safe(payload.case_id || payload.caseId, "demo-case");
    const previous = recordwatchMemory.courtStatuses.get(`${userId}:${caseId}`);
    recordwatchMemory.courtStatuses.set(`${userId}:${caseId}`, status);
    let notifications = [];
    if (previous && previous !== status) {
      const subscription = recordwatchMemory.subscriptions.find((item) => item.user_id === userId && item.case_id === caseId && item.status === "active") || { user_id: userId, case_id: caseId, notification_email: payload.notification_email, notification_phone: payload.notification_phone, notify_email: true, notify_sms: false };
      notifications = await createRecordwatchNotification(subscription, "court_status_update", { status });
    }
    res.json({ ok: true, previous_status: previous || null, status, notifications });
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

app.get("/api/recordwatch/admin-summary", (req, res) => {
  const sent = recordwatchMemory.notifications.filter((item) => item.status === "sent" || item.status === "queued" || item.status === "logged");
  res.json({
    total_subscribers: recordwatchMemory.subscriptions.length,
    upcoming_eligibility_events: recordwatchMemory.events.filter((item) => daysBetweenDates(new Date(), item.eligibility_date) >= 0).length,
    notifications_sent: sent.length,
    failed_deliveries: recordwatchMemory.notifications.filter((item) => item.status === "failed").length,
    sms_usage: recordwatchMemory.notifications.filter((item) => item.channel === "sms").length,
    email_usage: recordwatchMemory.notifications.filter((item) => item.channel === "email").length
  });
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
