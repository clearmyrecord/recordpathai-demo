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

app.listen(port, () => {
  console.log(`RecordPathAI server listening on port ${port}`);
});
