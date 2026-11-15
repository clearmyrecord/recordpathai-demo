import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Exercise the same selector shipped in the inline dashboard script, without
// touching Supabase, Stripe, a live browser session or customer data.
const html = readFileSync(new URL("../recordwatch-dashboard.html", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const account = readFileSync(new URL("../dashboard.html", import.meta.url), "utf8");
const start = html.indexOf("      function isSavedCaseUuid(id) {");
const end = html.indexOf("      function renderPremiumPanels(cases) {", start);
assert(start >= 0 && end > start, "Real dashboard saved-case selection helpers must exist");
const functions = html.slice(start, end);
const active = "6b02da01-97b3-46a4-9e20-31e3e6f24001";
const deleted = "a8b15b1c-c46a-4d19-8d82-51cc73b94202";
const second = "7a46f9f0-329f-4a8e-a03a-33b57610bb03";

function select({ verified = [], query = "", cached = "" } = {}) {
  const context = {
    verifiedSavedCases: verified.map((case_id) => ({ case_id })),
    window: {
      location: { search: query },
      RecordPathUserStore: { getActiveCaseId() { return cached; } },
    },
    URLSearchParams,
  };
  return runInNewContext(functions + "\nselectedSavedCaseId();", context);
}

test("an explicit deleted or stale case ID cannot unlock Stripe checkout", () => {
  assert.equal(select({ verified: [active], query: "?caseId=" + deleted, cached: active }), "");
});

test("an explicitly selected account-owned active case is eligible for checkout", () => {
  assert.equal(select({ verified: [active], query: "?caseId=" + active }), active);
});

test("an old browser case ID does not override the sole verified Supabase case", () => {
  assert.equal(select({ verified: [active], cached: deleted }), active);
});

test("multiple verified cases require explicit selection when local selection is stale", () => {
  assert.equal(select({ verified: [active, second], cached: deleted }), "");
  assert.equal(select({ verified: [active, second], cached: second }), second);
});

test("unverified drafts and browser-only cases never unlock checkout", () => {
  assert.equal(select({ verified: [], query: "?caseId=" + active, cached: active }), "");
  assert.match(html, /verifiedSavedCases = activeUser\(\) && !cases\.isFallback/);
});

test("the checkout endpoint rejects a deleted or unowned saved case before Stripe", () => {
  const route = server.slice(server.indexOf('app.post("/api/recordwatch/checkout"'), server.indexOf('app.post("/api/recordwatch/verify-checkout"'));
  assert.match(route, /await getSavedCaseReviewFacts\(user\.id,savedCaseId\)/);
  assert.match(route, /selected case is deleted or is not saved to this account/);
  assert(route.indexOf("await getSavedCaseReviewFacts") < route.indexOf("recordwatchStripe.checkout.sessions.create"));
  assert.doesNotMatch(route, /Unable to start secure lifetime checkout\. Please confirm your saved case/);
});

test("account overview remains separate from dedicated RecordWatch checkout", () => {
  assert.match(account, /<title>Account Dashboard \| RecordPathAI<\/title>/);
  assert.match(account, /<h2>RecordWatch overview<\/h2>/);
  assert.match(account, /href="recordwatch-dashboard\.html">Open RecordWatch<\/a>/);
});
