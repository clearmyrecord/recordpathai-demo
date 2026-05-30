import express from "express";
import Stripe from "stripe";
import cors from "cors";
import path from "path";
import { runJurisdictionSearch } from "./tools/court-search-core.js";

const LEDGER_ENTRY_TYPES = new Set([
  "packet_purchase",
  "recordwatch_subscription",
  "sms_alert_charge",
  "credit",
  "refund",
  "adjustment",
  "court_filing_fee",
  "promo_credit",
  "failed_payment",
  "chargeback"
]);

const LEDGER_STATUSES = new Set(["pending", "posted", "failed", "refunded", "reversed"]);
const CREDIT_LEDGER_TYPES = new Set(["credit", "refund", "promo_credit", "chargeback"]);
const PACKET_UNLOCK_AMOUNT_CENTS = Number(process.env.PACKET_UNLOCK_AMOUNT_CENTS || 5000);
const RECORDWATCH_PREMIUM_AMOUNT_CENTS = Number(process.env.RECORDWATCH_PREMIUM_AMOUNT_CENTS || 0);

const recordwatchMemory = {
  subscriptions: [],
  events: [],
  notifications: [],
  preferences: [],
  courtStatuses: new Map(),
  jobRuns: []
};
const RECORDWATCH_FROM_EMAIL = "matt@recordpathai.com";
const RECORDWATCH_PROVIDER_MISSING = "skipped_provider_missing";
const COURT_STATUS_VALUES = ["RECEIVED", "UNDER_REVIEW", "CORRECTION_REQUESTED", "ACCEPTED", "FILED", "HEARING_SCHEDULED", "GRANTED", "DENIED", "CLOSED"];


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


function getSupabaseUrl() {
  return safe(process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
}

function getSupabaseAnonKey() {
  return safe(process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY);
}

function getSupabaseServiceKey() {
  return safe(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

function isSupabaseServerConfigured() {
  return Boolean(getSupabaseUrl() && (getSupabaseServiceKey() || getSupabaseAnonKey()));
}

function bearerToken(req) {
  const header = safe(req.headers.authorization || req.headers.Authorization);
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function supabaseRest(pathname, options = {}) {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey();
  const anonKey = getSupabaseAnonKey();
  const apiKey = serviceKey || anonKey;

  if (!url || !apiKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${options.jwt || serviceKey || anonKey}`,
    ...(options.headers || {})
  };

  const response = await fetch(`${url}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || text || `Supabase request failed: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function getAuthenticatedUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey() || getSupabaseServiceKey();
  if (!url || !anonKey) return null;

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user && user.id ? { ...user, accessToken: token } : null;
}

function adminEmails() {
  return safe(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminUser(user) {
  if (!user) return false;
  const role = safe(user.role || user.app_metadata?.role || user.user_metadata?.role).toLowerCase();
  const claimsRole = safe(user.app_metadata?.roles || user.user_metadata?.roles).toLowerCase();
  const email = safe(user.email).toLowerCase();
  return role === "admin" || role === "service_role" || claimsRole.split(",").map((r) => r.trim()).includes("admin") || adminEmails().includes(email);
}

async function requireAuthenticatedUser(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

async function requireAdminUser(req, res) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  if (!isAdminUser(user)) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return user;
}

function toPositiveCents(value, fallback = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}

function normalizeLedgerEntry(input = {}) {
  const entryType = safe(input.entryType || input.entry_type);
  const status = safe(input.status, "posted");
  const amountCents = toPositiveCents(input.amountCents ?? input.amount_cents);
  let debitCents = toPositiveCents(input.debitCents ?? input.debit_cents);
  let creditCents = toPositiveCents(input.creditCents ?? input.credit_cents);

  if (!LEDGER_ENTRY_TYPES.has(entryType)) throw new Error("Invalid ledger entry type");
  if (!LEDGER_STATUSES.has(status)) throw new Error("Invalid ledger status");
  if (!safe(input.userId || input.user_id)) throw new Error("Missing ledger userId");
  if (!safe(input.description)) throw new Error("Missing ledger description");
  if (!amountCents) throw new Error("Ledger amount must be positive");

  if (!debitCents && !creditCents) {
    if (CREDIT_LEDGER_TYPES.has(entryType)) creditCents = amountCents;
    else debitCents = amountCents;
  }

  if (debitCents && creditCents) throw new Error("Ledger entry cannot be both a debit and a credit");

  return {
    user_id: safe(input.userId || input.user_id),
    case_id: safe(input.caseId || input.case_id) || null,
    entry_type: entryType,
    description: safe(input.description),
    amount_cents: amountCents,
    currency: safe(input.currency, "usd").toLowerCase(),
    debit_cents: debitCents,
    credit_cents: creditCents,
    stripe_session_id: safe(input.stripeSessionId || input.stripe_session_id) || null,
    stripe_payment_intent_id: safe(input.stripePaymentIntentId || input.stripe_payment_intent_id) || null,
    stripe_customer_id: safe(input.stripeCustomerId || input.stripe_customer_id) || null,
    related_recordwatch_subscription_id: safe(input.relatedRecordWatchSubscriptionId || input.related_recordwatch_subscription_id) || null,
    related_packet_id: safe(input.relatedPacketId || input.related_packet_id) || null,
    status,
    metadata: (input.metadata && typeof input.metadata === "object") ? input.metadata : {}
  };
}

async function getUserLedger(userId) {
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    order: "created_at.desc"
  });
  return await supabaseRest(`/rest/v1/user_ledger_entries?${query.toString()}`, {
    headers: { Accept: "application/json" }
  }) || [];
}

async function calculateUserLedgerBalance(userId) {
  const entries = await getUserLedger(userId);
  const posted = entries.filter((entry) => ["posted", "refunded", "reversed"].includes(entry.status));
  const totalDebits = posted.reduce((sum, entry) => sum + toPositiveCents(entry.debit_cents), 0);
  const totalCredits = posted.reduce((sum, entry) => sum + toPositiveCents(entry.credit_cents), 0);
  return {
    total_debits_cents: totalDebits,
    total_credits_cents: totalCredits,
    current_balance_cents: totalDebits - totalCredits
  };
}

async function findDuplicateLedgerEntry(entry) {
  const filters = new URLSearchParams({
    user_id: `eq.${entry.user_id}`,
    status: `eq.${entry.status}`,
    limit: "1"
  });

  if (entry.stripe_session_id) {
    filters.set("stripe_session_id", `eq.${entry.stripe_session_id}`);
  } else if (entry.metadata?.idempotency_key) {
    filters.set("metadata->>idempotency_key", `eq.${entry.metadata.idempotency_key}`);
  } else {
    return null;
  }

  const rows = await supabaseRest(`/rest/v1/user_ledger_entries?${filters.toString()}`, {
    headers: { Accept: "application/json" }
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function createLedgerEntry(input = {}) {
  const entry = normalizeLedgerEntry(input);
  const duplicate = await findDuplicateLedgerEntry(entry);
  if (duplicate) return { entry: duplicate, duplicate: true };

  if (entry.status === "posted") {
    const balance = await calculateUserLedgerBalance(entry.user_id);
    entry.balance_after_cents = balance.current_balance_cents + entry.debit_cents - entry.credit_cents;
  }

  const rows = await supabaseRest("/rest/v1/user_ledger_entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(entry)
  });

  return { entry: Array.isArray(rows) ? rows[0] : rows, duplicate: false };
}

async function getLedgerSummary(userId) {
  const entries = await getUserLedger(userId);
  const postedEntries = entries.filter((entry) => ["posted", "refunded", "reversed"].includes(entry.status));
  const totalDebits = postedEntries.reduce((sum, entry) => sum + toPositiveCents(entry.debit_cents), 0);
  const totalCredits = postedEntries.reduce((sum, entry) => sum + toPositiveCents(entry.credit_cents), 0);
  return {
    total_debits_cents: totalDebits,
    total_credits_cents: totalCredits,
    current_balance_cents: totalDebits - totalCredits,
    packet_purchases_count: postedEntries.filter((entry) => entry.entry_type === "packet_purchase").length,
    recordwatch_subscription_count: postedEntries.filter((entry) => entry.entry_type === "recordwatch_subscription").length,
    last_transaction_at: entries[0]?.created_at || null
  };
}

async function getAllLedgerEntries(limit = 100) {
  const query = new URLSearchParams({ order: "created_at.desc", limit: String(limit) });
  return await supabaseRest(`/rest/v1/user_ledger_entries?${query.toString()}`, {
    headers: { Accept: "application/json" }
  }) || [];
}

async function getAdminLedgerSummary() {
  const entries = await getAllLedgerEntries(250);
  const posted = entries.filter((entry) => ["posted", "refunded", "reversed"].includes(entry.status));
  const debitTotal = (type) => posted.filter((entry) => !type || entry.entry_type === type).reduce((sum, entry) => sum + toPositiveCents(entry.debit_cents), 0);
  const creditTotal = posted.reduce((sum, entry) => sum + toPositiveCents(entry.credit_cents), 0);
  return {
    total_revenue_cents: debitTotal() - creditTotal,
    packet_purchase_revenue_cents: debitTotal("packet_purchase"),
    recordwatch_premium_revenue_cents: debitTotal("recordwatch_subscription"),
    refunds_credits_cents: creditTotal,
    failed_payments_count: entries.filter((entry) => entry.status === "failed" || entry.entry_type === "failed_payment").length,
    recent_entries: entries.slice(0, 25)
  };
}


function recordwatchId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function recordwatchDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalizeRecordwatchStatus(status) {
  return String(status || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeRecordwatchPreferences(payload = {}) {
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
  const row = Object.assign(existing || { id: recordwatchId("rwp"), user_id: userId, created_at: new Date().toISOString() }, normalizeRecordwatchPreferences(payload), { updated_at: new Date().toISOString() });
  if (!existing) recordwatchMemory.preferences.push(row);
  return row;
}

async function recordwatchTableSelect(table, userId) {
  if (!isSupabaseServerConfigured() || !userId) return null;
  try {
    const query = new URLSearchParams({ user_id: `eq.${userId}`, order: "created_at.desc" });
    return await supabaseRest(`/rest/v1/${table}?${query.toString()}`, { headers: { Accept: "application/json" } });
  } catch (error) {
    console.warn(`RecordWatch ${table} lookup using memory fallback:`, error.message);
    return null;
  }
}

async function recordwatchTableUpsert(table, payload, conflict = "id") {
  if (!isSupabaseServerConfigured()) return null;
  try {
    const rows = await supabaseRest(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(payload)
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    console.warn(`RecordWatch ${table} upsert using memory fallback:`, error.message);
    return null;
  }
}

function memoryRows(name, userId) {
  return recordwatchMemory[name].filter((item) => !userId || item.user_id === userId);
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

    const requestedSuccessUrl = safe(successUrl) || `${baseUrl}/payment-success.html`;
    const finalSuccessUrl = requestedSuccessUrl.includes("{CHECKOUT_SESSION_ID}")
      ? requestedSuccessUrl
      : `${requestedSuccessUrl}${requestedSuccessUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = safe(cancelUrl) || `${baseUrl}/packet.html?payment=cancelled`;
    const internalOrderId = `packet_${Date.now()}`;
    const authUser = await getAuthenticatedUser(req);

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
        userId: safe(authUser?.id),

        fullName: safe(applicant.fullName),
        email: safe(applicant.email),
        phone: safe(applicant.phone),
        street: safe(applicant.street),
        apartment: safe(applicant.apartment),
        city: safe(applicant.city),
        residenceState: safe(applicant.residenceState),
        zip: safe(applicant.zip),

        caseState: safe(caseInfo.caseState),
        caseId: safe(caseInfo.caseId || caseInfo.caseNumber),
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


app.get("/api/recordwatch/subscriptions", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId, "demo-user");
  const remote = await recordwatchTableSelect("recordwatch_subscriptions", userId);
  return res.json({ source: remote ? "supabase" : "local_fallback", subscriptions: remote || memoryRows("subscriptions", userId) });
});

app.get("/api/recordwatch/events", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId, "demo-user");
  const remote = await recordwatchTableSelect("recordwatch_eligibility_events", userId);
  return res.json({ source: remote ? "supabase" : "local_fallback", events: remote || memoryRows("events", userId) });
});

app.get("/api/recordwatch/notifications", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId, "demo-user");
  const remote = await recordwatchTableSelect("recordwatch_notifications", userId);
  return res.json({ source: remote ? "supabase" : "local_fallback", notifications: remote || memoryRows("notifications", userId) });
});

app.get("/api/recordwatch/preferences", async (req, res) => {
  const userId = safe(req.query.user_id || req.query.userId, "demo-user");
  const remote = await recordwatchTableSelect("recordwatch_notification_preferences", userId);
  return res.json({ source: remote ? "supabase" : "local_fallback", preferences: remote && remote[0] ? remote[0] : getMemoryPreferences(userId) });
});

app.post("/api/recordwatch/preferences", async (req, res) => {
  const payload = Object.assign({}, req.body || {}, { user_id: safe(req.body?.user_id || req.body?.userId, "demo-user") });
  const row = Object.assign(upsertMemoryPreferences(payload), normalizeRecordwatchPreferences(payload));
  const remote = await recordwatchTableUpsert("recordwatch_notification_preferences", row, "user_id");
  return res.json({ source: remote ? "supabase" : "local_fallback", preferences: remote || row });
});

app.post("/api/recordwatch/subscribe", async (req, res) => {
  const payload = req.body || {};
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const planType = safe(payload.plan_type || payload.planType, "free").toLowerCase() === "premium" ? "premium" : "free";
  const premiumActive = Boolean(payload.premium_active || payload.premiumActive || planType === "premium");
  const existing = recordwatchMemory.subscriptions.find((item) => item.user_id === userId && item.case_id === caseId);
  const row = Object.assign(existing || { id: recordwatchId("rws"), user_id: userId, case_id: caseId, created_at: new Date().toISOString() }, payload, {
    user_id: userId,
    case_id: caseId,
    plan_type: premiumActive ? "premium" : planType,
    premium_active: premiumActive,
    notify_sms: premiumActive && Boolean(payload.notify_sms || payload.notifySms),
    sms_requires_premium: !premiumActive && Boolean(payload.notify_sms || payload.notifySms),
    status: safe(payload.status, "active"),
    updated_at: new Date().toISOString()
  });
  if (!existing) recordwatchMemory.subscriptions.push(row);
  const remote = await recordwatchTableUpsert("recordwatch_subscriptions", row);
  return res.json({ source: remote ? "supabase" : "local_fallback", subscription: remote || row });
});

app.post("/api/recordwatch/eligibility-event", async (req, res) => {
  const payload = req.body || {};
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const existing = recordwatchMemory.events.find((item) => item.user_id === userId && item.case_id === caseId);
  const row = Object.assign(existing || { id: recordwatchId("rwe"), user_id: userId, case_id: caseId, created_at: new Date().toISOString() }, payload, {
    user_id: userId,
    case_id: caseId,
    eligibility_date: recordwatchDateOnly(payload.eligibility_date || payload.eligibilityDate),
    eligibility_confidence: safe(payload.eligibility_confidence || payload.eligibilityConfidence, "medium"),
    updated_at: new Date().toISOString()
  });
  if (!existing) recordwatchMemory.events.push(row);
  const remote = await recordwatchTableUpsert("recordwatch_eligibility_events", row);
  return res.json({ source: remote ? "supabase" : "local_fallback", event: remote || row });
});

app.post("/api/recordwatch/court-status", async (req, res) => {
  const payload = req.body || {};
  const userId = safe(payload.user_id || payload.userId, "demo-user");
  const caseId = safe(payload.case_id || payload.caseId, "demo-case");
  const status = normalizeRecordwatchStatus(payload.status);
  if (!COURT_STATUS_VALUES.includes(status)) return res.status(400).json({ error: "Invalid court status" });
  const key = `${userId}:${caseId}`;
  const previous = recordwatchMemory.courtStatuses.get(key);
  recordwatchMemory.courtStatuses.set(key, status);
  return res.json({ source: "local_fallback", user_id: userId, case_id: caseId, status, previous_status: previous || null });
});

app.post("/api/recordwatch/run-daily", (req, res) => {
  const job = { id: recordwatchId("rwj"), source: safe(req.body?.source, "server-preview"), status: "completed", created_at: new Date().toISOString() };
  recordwatchMemory.jobRuns.unshift(job);
  return res.json({ source: "local_fallback", job, from_email: RECORDWATCH_FROM_EMAIL, provider_missing_status: RECORDWATCH_PROVIDER_MISSING });
});

app.get("/api/ledger", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    const entries = await getUserLedger(user.id);
    const balance = await calculateUserLedgerBalance(user.id);
    return res.json({ entries, balance });
  } catch (error) {
    console.error("Ledger fetch error:", error);
    return res.status(500).json({ error: error?.message || "Failed to load ledger" });
  }
});

app.get("/api/ledger/summary", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    return res.json(await getLedgerSummary(user.id));
  } catch (error) {
    console.error("Ledger summary error:", error);
    return res.status(500).json({ error: error?.message || "Failed to load ledger summary" });
  }
});

app.post("/api/ledger/packet-purchase", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const sessionId = safe(req.body?.stripeSessionId || req.body?.sessionId);
    let session = null;
    if (sessionId && stripe) {
      session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status && session.payment_status !== "paid") {
        return res.status(409).json({ error: "Stripe checkout session is not paid yet" });
      }
      const sessionUserId = safe(session.metadata?.userId);
      if (sessionUserId && sessionUserId !== user.id) {
        return res.status(403).json({ error: "Checkout session does not belong to the authenticated user" });
      }
    }

    const amountCents = toPositiveCents(session?.amount_total || req.body?.amountCents || PACKET_UNLOCK_AMOUNT_CENTS);
    const caseId = safe(req.body?.caseId || session?.metadata?.caseId || session?.metadata?.caseNumber);
    const result = await createLedgerEntry({
      userId: user.id,
      caseId,
      entryType: "packet_purchase",
      description: "RecordPathAI packet unlock",
      amountCents,
      currency: safe(session?.currency || req.body?.currency, "usd"),
      debitCents: amountCents,
      creditCents: 0,
      stripeSessionId: sessionId || null,
      stripePaymentIntentId: safe(session?.payment_intent),
      stripeCustomerId: safe(session?.customer),
      relatedPacketId: safe(session?.client_reference_id || req.body?.relatedPacketId),
      status: "posted",
      metadata: {
        product: "packet_generation",
        page: "packet.html",
        idempotency_key: sessionId ? undefined : safe(req.body?.idempotencyKey || `packet_purchase:${user.id}:${caseId || "no_case"}`)
      }
    });
    return res.json(result);
  } catch (error) {
    console.error("Packet ledger error:", error);
    return res.status(500).json({ error: error?.message || "Failed to create packet ledger entry" });
  }
});

app.post("/api/ledger/recordwatch-subscription", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    const amountCents = toPositiveCents(req.body?.amountCents || RECORDWATCH_PREMIUM_AMOUNT_CENTS);
    if (!amountCents) return res.status(400).json({ error: "RecordWatch premium amount is not configured" });
    const result = await createLedgerEntry({
      userId: user.id,
      caseId: safe(req.body?.caseId),
      entryType: "recordwatch_subscription",
      description: "Premium RecordWatch subscription",
      amountCents,
      currency: safe(req.body?.currency, "usd"),
      debitCents: amountCents,
      creditCents: 0,
      relatedRecordWatchSubscriptionId: safe(req.body?.relatedRecordWatchSubscriptionId),
      status: safe(req.body?.status, "posted"),
      metadata: { product: "recordwatch_premium", idempotency_key: safe(req.body?.idempotencyKey) || undefined }
    });
    return res.json(result);
  } catch (error) {
    console.error("RecordWatch ledger error:", error);
    return res.status(500).json({ error: error?.message || "Failed to create RecordWatch ledger entry" });
  }
});

app.post("/api/admin/ledger-entry", async (req, res) => {
  try {
    const admin = await requireAdminUser(req, res);
    if (!admin) return;
    const result = await createLedgerEntry({
      ...req.body,
      metadata: {
        ...(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}),
        created_by_admin_id: admin.id
      }
    });
    return res.json(result);
  } catch (error) {
    console.error("Admin ledger entry error:", error);
    return res.status(500).json({ error: error?.message || "Failed to create admin ledger entry" });
  }
});

app.get("/api/admin/ledger-summary", async (req, res) => {
  try {
    const admin = await requireAdminUser(req, res);
    if (!admin) return;
    return res.json(await getAdminLedgerSummary());
  } catch (error) {
    console.error("Admin ledger summary error:", error);
    return res.status(500).json({ error: error?.message || "Failed to load admin ledger summary" });
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

app.listen(port, () => {
  console.log(`RecordPathAI server listening on port ${port}`);
});
