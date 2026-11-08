import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RECORDWATCH_BILLING, recordwatchPlan, assertRecordwatchStripePrice,
  billingPeriod, verifyRecordwatchSubscription, paidRecordwatchCheckout,
  recordwatchEntitled
} from "../src/recordwatch-billing.js";

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
  assert.ok(server.includes('recordwatchBillingReadiness().ready'));
  assert.ok(server.includes('RECORDWATCH_LIVE_BILLING_ENABLED'));

  for (const event of ["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed","checkout.session.completed"])
    assert.ok(server.includes('"' + event + '"'), event);
  assert.ok(server.includes("syncVerifiedRecordwatchStripeSubscription"));
  assert.ok(server.includes("verifiedPacketSession(session,owner,caseId)"));
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
  assert.ok(recordwatch.includes('checkoutPremium(plan'));
  assert.ok(recordwatch.includes('data-recordwatch-checkout="monthly"'));
  assert.ok(recordwatch.includes('data-recordwatch-checkout="annual"'));
  assert.ok(dashboard.includes('openBillingPortal()'));
  assert.ok(account.includes('accountBillingPortal'));
  assert.ok(provider.includes('subscription.stripe_subscription_id'));
  assert.ok(dashboard.includes("premiumState.subscription || null"));
});
