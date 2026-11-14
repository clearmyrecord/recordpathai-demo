import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  RECORDWATCH_BILLING, recordwatchPlan, assertRecordwatchStripePrice,
  billingPeriod, verifyRecordwatchSubscription, paidRecordwatchCheckout,
  recordwatchEntitled
} from "../src/recordwatch-billing.js";

import {
  RECORDWATCH_LIFETIME_CENTS, assertRecordwatchLifetimePrice,
  paidRecordwatchLifetimeCheckout, lifetimeCaseEntitled
} from "../src/recordwatch-lifetime.js";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const owner = "f613dc41-4fb4-4804-994e-8b2341dd099c";
const env = {
  STRIPE_RECORDWATCH_MONTHLY_PRICE_ID: "price_monthly_test",
  STRIPE_RECORDWATCH_ANNUAL_PRICE_ID: "price_annual_test"
};
const price = (plan = "monthly") => ({
  id: env[RECORDWATCH_BILLING[plan].env],
  currency: "usd",
  unit_amount: RECORDWATCH_BILLING[plan].cents,
  billing_scheme: "per_unit",
  type: "recurring",
  recurring: { interval: RECORDWATCH_BILLING[plan].interval, interval_count: 1 }
});
const subscription = (plan = "monthly") => ({
  id: "sub_test123",
  status: "active",
  customer: "cus_test123",
  metadata: { product: "premium_recordwatch", user_id: owner, plan },
  items: { data: [{
    price: price(plan),
    current_period_start: 1780000000,
    current_period_end: 1782678400
  }] }
});

test("RecordWatch dashboard formats both date-only eligibility and Stripe ISO renewal timestamps", () => {
  const context = { window: {} };
  runInNewContext(read("js/recordwatch-rules.js"), context);
  const formatDate = context.window.RecordWatchRules.formatDate;
  assert.notEqual(formatDate("2026-12-08"), "Not available");
  assert.notEqual(formatDate("2026-12-08T20:42:43.000Z"), "Not available");
  assert.equal(formatDate(""), "Not available");
  assert.equal(formatDate("not-a-date"), "Not available");
});

test("Price IDs are checked against real Stripe amount, currency, and recurring interval", () => {
  assert.equal(recordwatchPlan("monthly"), "monthly");
  assert.equal(recordwatchPlan("annual"), "annual");
  assert.equal(recordwatchPlan("addon_12_month"), "");
  assert.equal(assertRecordwatchStripePrice(price("monthly"), "monthly"), env.STRIPE_RECORDWATCH_MONTHLY_PRICE_ID);
  assert.equal(assertRecordwatchStripePrice(price("annual"), "annual"), env.STRIPE_RECORDWATCH_ANNUAL_PRICE_ID);
  assert.throws(() => assertRecordwatchStripePrice({ ...price(), unit_amount: 99 }, "monthly"));
  assert.throws(() => assertRecordwatchStripePrice({ ...price(), currency: "eur" }, "monthly"));
  assert.throws(() => assertRecordwatchStripePrice({ ...price(), recurring: { interval: "year", interval_count: 1 } }, "monthly"));
});

test("A paid RecordWatch checkout belongs to the signed-in user and correct billing mode", () => {
  const base = { mode:"subscription", id:"cs_test_ok", status:"complete", payment_status:"paid",
    currency:"usd", amount_total:499, subscription:"sub_test123",
    metadata:{product:"premium_recordwatch",user_id:owner,plan:"monthly"} };
  assert.equal(paidRecordwatchCheckout(base, owner), true);
  assert.equal(paidRecordwatchCheckout({...base, payment_status:"unpaid"},owner),false);
  assert.equal(paidRecordwatchCheckout({...base, mode:"payment"},owner),false);
  assert.equal(paidRecordwatchCheckout({...base, amount_total:5000},owner),false);
  assert.equal(paidRecordwatchCheckout({...base, metadata:{...base.metadata,product:"record-sealing-packet"}},owner),false);
  assert.equal(paidRecordwatchCheckout(base,"another-user"),false);
});

test("Subscription owner, product, and Stripe Price ID are validated", () => {
  const sub=subscription();
  assert.equal(verifyRecordwatchSubscription(sub,env,owner),"monthly");
  assert.equal(verifyRecordwatchSubscription(sub,env,"other-user"),"");
  assert.equal(verifyRecordwatchSubscription({...sub,items:{data:[{...sub.items.data[0],price:{...price(),id:"price_attacker"}}]}},env,owner),"");
  assert.equal(verifyRecordwatchSubscription({...sub,metadata:{...sub.metadata,product:"court_packet"}},env,owner),"");
  assert.equal(billingPeriod(sub).end,new Date(1782678400*1000).toISOString());
});

test("No paid entitlement for forged, unpaid, canceled, or expired subscriptions", () => {
  const future=new Date(Date.now()+10*24*3600000).toISOString();
  const row={stripe_subscription_id:"sub_test123",status:"active",current_period_end:future};
  assert.equal(recordwatchEntitled(row),true);
  assert.equal(recordwatchEntitled({...row,status:"canceled"}),false);
  assert.equal(recordwatchEntitled({...row,status:"past_due"}),false);
  assert.equal(recordwatchEntitled({...row,stripe_subscription_id:null}),false);
  assert.equal(recordwatchEntitled({...row,current_period_end:new Date(0).toISOString()}),false);
  assert.equal(recordwatchEntitled({...row,current_period_end:null}),false);
});

test("Production webhook handles Stripe renewals, cancellation and payment failures while preserving packet processing", () => {
  const server=read("server.js");
  assert.ok(server.includes("stripe.webhooks.constructEvent"));
  assert.ok(server.includes('app.post("/api/recordwatch/stripe-webhook"'));
  assert.ok(server.includes("recordwatchStripe.webhooks.constructEvent"));
  assert.ok(server.includes('process.env.STRIPE_RECORDWATCH_SECRET_KEY'));
  assert.ok(server.includes('process.env.STRIPE_RECORDWATCH_WEBHOOK_SECRET'));
  assert.ok(server.includes('app.get("/api/recordwatch/billing-readiness"'));
  assert.ok(server.includes('(await recordwatchBillingReadiness()).ready'));
  assert.ok(server.includes('assertRecordwatchLifetimePrice(price)'));
  assert.ok(server.includes("async function recordwatchBillingMigrationVerified()"));
  assert.ok(server.includes('app.get("/api/recordwatch/database-readiness"'));
  assert.ok(server.includes("if(!await recordwatchBillingMigrationVerified())"));
  const migration=read("supabase/migrations/20261108010000_recordwatch_stripe_entitlements.sql");
  assert.ok(migration.includes("recordwatch_billing_migration_receipts"));
  assert.ok(migration.includes("revoke all on public.recordwatch_billing_migration_receipts"));
  assert.ok(migration.includes("on conflict (id) do nothing"));
  assert.ok(server.includes('RECORDWATCH_LIVE_BILLING_ENABLED'));

  for (const event of ["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed","checkout.session.completed"])
    assert.ok(server.includes('"' + event + '"'), event);
  assert.ok(server.includes("syncVerifiedRecordwatchStripeSubscription"));
  assert.ok(server.includes("verifiedPacketSession(current,owner,caseId)"));
  assert.ok(server.includes("return await reconcilePaidPacketCheckout(session,res)"));
  assert.ok(server.includes('app.post("/api/recordwatch/billing-portal"'));
  assert.ok(server.includes("recordwatchStripe.billingPortal.sessions.create"));
  assert.ok(server.includes("getRecordwatchBillingRow(user.id)"));
  assert.ok(server.includes('const planType = "free"'));
  assert.ok(server.includes("const premiumActive = false"));
});

test("Customer-facing checkout and account management are wired with no local paid fallback", () => {
  const dashboard=read("recordwatch-dashboard.html");
  const recordwatch=read("recordwatch.html");
  const account=read("account.html");
  const provider=read("js/recordwatch-message-provider.js");
  assert.ok(dashboard.includes("RecordWatchNotifications.checkoutPremium('lifetime_case'"));
  assert.ok(recordwatch.includes('recordwatch-dashboard.html?caseId='));
  assert.ok(dashboard.includes('recordwatchPurchaseTerms'));
  assert.ok(recordwatch.includes('data-recordwatch-checkout="lifetime_case"'));
  assert.ok(!recordwatch.includes('data-recordwatch-checkout="monthly"'));
  assert.ok(!recordwatch.includes('data-recordwatch-checkout="annual"'));
  assert.ok(dashboard.includes('openBillingPortal()'));
  assert.ok(account.includes('accountBillingPortal'));
  assert.ok(provider.includes('subscription.stripe_subscription_id'));
  assert.ok(dashboard.includes("premiumState.subscription || null"));
});

const savedCaseId = "c08d053f-63c7-4a65-997c-df0c40253c15";
const lifetimePriceId = "price_lifetime_case_test";
const lifetimePrice = {
  id: lifetimePriceId, active: true, currency: "usd", unit_amount: 3900,
  billing_scheme: "per_unit", type: "one_time", recurring: null
};
const lifetimeCheckout = {
  id: "cs_test_lifetime123", mode: "payment", status: "complete",
  payment_status: "paid", amount_total: 3900, currency: "usd",
  client_reference_id: owner, payment_intent: "pi_test_lifetime123",
  metadata: {
    product: "premium_recordwatch_lifetime", plan: "lifetime_case",
    user_id: owner, saved_case_id: savedCaseId, price_id: lifetimePriceId
  }
};
test("One-time RecordWatch product is strictly $39 USD, not a recurring price", () => {
  assert.equal(RECORDWATCH_LIFETIME_CENTS, 3900);
  assert.equal(assertRecordwatchLifetimePrice(lifetimePrice), lifetimePriceId);
  assert.throws(() => assertRecordwatchLifetimePrice({ ...lifetimePrice, unit_amount: 499 }));
  assert.throws(() => assertRecordwatchLifetimePrice({ ...lifetimePrice, type: "recurring", recurring: { interval: "year" } }));
});

test("Paid lifetime checkout must match owner, saved case, price, mode and paid Stripe intent", () => {
  assert.equal(paidRecordwatchLifetimeCheckout(lifetimeCheckout,owner,savedCaseId,lifetimePriceId),true);
  for(const changed of [
    {status:"open"}, {payment_status:"unpaid"}, {mode:"subscription"}, {amount_total:499},
    {currency:"eur"}, {payment_intent:null}, {client_reference_id:"attacker"},
    {metadata:{...lifetimeCheckout.metadata,saved_case_id:"attacker"}}
  ]) assert.equal(paidRecordwatchLifetimeCheckout({...lifetimeCheckout,...changed},owner,savedCaseId,lifetimePriceId),false);
  assert.equal(paidRecordwatchLifetimeCheckout(lifetimeCheckout,owner,"random-case",lifetimePriceId),false);
  assert.equal(paidRecordwatchLifetimeCheckout(lifetimeCheckout,owner,savedCaseId,"price_other"),false);
});

test("Lifetime access never expires, but is revoked on refund, dispute, or different case", () => {
  const row = {
    saved_case_id:savedCaseId,plan:"lifetime_case",status:"active",
    stripe_checkout_session_id:lifetimeCheckout.id,
    stripe_payment_intent_id:lifetimeCheckout.payment_intent,
    amount_cents:3900,currency:"usd",revoked_at:null
  };
  assert.equal(lifetimeCaseEntitled(row,savedCaseId),true);
  assert.equal(lifetimeCaseEntitled({...row,status:"refunded"},savedCaseId),false);
  assert.equal(lifetimeCaseEntitled({...row,status:"disputed",revoked_at:new Date().toISOString()},savedCaseId),false);
  assert.equal(lifetimeCaseEntitled({...row,stripe_payment_intent_id:"forged"},savedCaseId),false);
  assert.equal(lifetimeCaseEntitled(row,owner),false);
});

test("Only verified lifetime case purchases can be persisted; packet checkout cannot sell retired add-on", () => {
  const server=read("server.js");
  const migration=read("supabase/migrations/20261108020000_recordwatch_lifetime_cases.sql");
  const packet=read("packet.html");
  const dashboard=read("recordwatch-dashboard.html");
  assert.ok(server.includes('mode:"payment", // Omit ui_mode; Stripe defaults to its supported hosted page.'));
  assert.ok(!server.includes('ui_mode:"hosted"'));
  assert.ok(!server.includes('payment_method_types:["card"]'));
  assert.match(server,/mode:"payment", \/\/ Omit ui_mode/);
  assert.ok(server.includes("paidRecordwatchLifetimeCheckout"));
  assert.ok(server.includes("getSavedCaseReviewFacts(userId,caseId)"));
  assert.ok(server.includes('app.post("/api/recordwatch/stripe-webhook"'));
  assert.ok(server.includes('"charge.refunded","charge.dispute.created"'));
  assert.ok(server.includes('recordwatch_lifetime_cases'));
  assert.ok(server.includes('if(!await recordwatchBillingMigrationVerified())'));
  assert.ok(migration.includes("revoke all on public.recordwatch_lifetime_cases from public, anon, authenticated"));
  assert.ok(migration.includes("on public.recordwatch_lifetime_cases for select to authenticated"));
  assert.ok(!packet.includes('recordwatchAddon'));
  assert.ok(!dashboard.includes('Subscribe — $4.99/month'));
  assert.ok(dashboard.includes('Accept terms &amp; continue to Stripe — $39'));
});
