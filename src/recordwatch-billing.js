// RecordWatch billing invariants. No client-supplied entitlement can pass this gate.
export const RECORDWATCH_BILLING = Object.freeze({
  monthly: Object.freeze({ cents: 499, interval: "month", env: "STRIPE_RECORDWATCH_MONTHLY_PRICE_ID" }),
  annual: Object.freeze({ cents: 3900, interval: "year", env: "STRIPE_RECORDWATCH_ANNUAL_PRICE_ID" })
});

export function recordwatchPlan(value) {
  const plan = String(value || "").trim().toLowerCase();
  return Object.hasOwn(RECORDWATCH_BILLING, plan) ? plan : "";
}

export function assertRecordwatchStripePrice(price, plan) {
  const expected = RECORDWATCH_BILLING[recordwatchPlan(plan)];
  if (!expected || !price || price.id?.slice(0, 6) !== "price_" ||
      price.currency !== "usd" || price.unit_amount !== expected.cents ||
      price.type !== "recurring" || price.recurring?.interval !== expected.interval ||
      price.recurring?.interval_count !== 1 || price.billing_scheme !== "per_unit") {
    throw Object.assign(new Error("RecordWatch Stripe price does not match the advertised plan."), { status: 503 });
  }
  return price.id;
}

export function billingPeriod(subscription) {
  const first = subscription?.items?.data?.[0] || {};
  const start = first.current_period_start || subscription?.current_period_start;
  const end = first.current_period_end || subscription?.current_period_end;
  return {
    start: Number.isFinite(start) ? new Date(start * 1000).toISOString() : null,
    end: Number.isFinite(end) ? new Date(end * 1000).toISOString() : null
  };
}

export function verifyRecordwatchSubscription(subscription, env, userId) {
  const metadata = subscription?.metadata || {};
  const plan = recordwatchPlan(metadata.plan);
  const price = subscription?.items?.data?.[0]?.price;
  if (!subscription?.id?.startsWith("sub_") || metadata.product !== "premium_recordwatch" ||
      metadata.user_id !== userId || !plan || !env[RECORDWATCH_BILLING[plan].env] ||
      !price || price.id !== env[RECORDWATCH_BILLING[plan].env]) return "";
  return plan;
}

export function paidRecordwatchCheckout(session, userId) {
  const plan = recordwatchPlan(session?.metadata?.plan);
  return Boolean(plan && session?.mode === "subscription" &&
    session?.status === "complete" && session?.payment_status === "paid" &&
    session?.currency === "usd" &&
    session?.amount_total === RECORDWATCH_BILLING[plan].cents &&
    session?.metadata?.product === "premium_recordwatch" &&
    session?.metadata?.user_id === userId &&
    (typeof session?.subscription === "string" || session?.subscription?.id?.startsWith("sub_")));
}

export function recordwatchEntitled(row, now = Date.now()) {
  if (!row?.stripe_subscription_id?.startsWith("sub_") ||
      String(row.status || "").toLowerCase() !== "active") return false;
  const end = Date.parse(row.current_period_end || "");
  return Number.isFinite(end) && end > now;
}
