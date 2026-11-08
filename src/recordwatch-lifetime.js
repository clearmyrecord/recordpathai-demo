// One-time RecordWatch Premium. Every paid entitlement belongs to one saved case.
export const RECORDWATCH_LIFETIME_CENTS = 3900;
export const RECORDWATCH_LIFETIME_PRICE_ENV = "STRIPE_RECORDWATCH_LIFETIME_PRICE_ID";
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

export function assertRecordwatchLifetimePrice(price) {
  if (!price?.id?.startsWith("price_") || price.active !== true ||
      price.currency !== "usd" || price.unit_amount !== RECORDWATCH_LIFETIME_CENTS ||
      price.type !== "one_time" || price.recurring != null || price.billing_scheme !== "per_unit") {
    throw Object.assign(new Error("Configured RecordWatch lifetime price must be a one-time USD $39 price."), { status: 503 });
  }
  return price.id;
}

export function paidRecordwatchLifetimeCheckout(session, userId, caseId, priceId) {
  const metadata = session?.metadata || {};
  const pi = typeof session?.payment_intent === "string" ? session.payment_intent : session?.payment_intent?.id;
  return Boolean(
    uuid(userId) && uuid(caseId) && /^price_/.test(String(priceId || "")) &&
    session?.id?.startsWith("cs_") && session.mode === "payment" &&
    session.status === "complete" && session.payment_status === "paid" &&
    session.currency === "usd" && session.amount_total === RECORDWATCH_LIFETIME_CENTS &&
    session.client_reference_id === userId &&
    metadata.product === "premium_recordwatch_lifetime" &&
    metadata.plan === "lifetime_case" && metadata.user_id === userId &&
    metadata.saved_case_id === caseId && metadata.price_id === priceId &&
    pi?.startsWith("pi_")
  );
}

export function lifetimeCaseEntitled(row, caseId) {
  return Boolean(row && uuid(caseId) && row.saved_case_id === caseId &&
    row.plan === "lifetime_case" && row.status === "active" && !row.revoked_at &&
    row.stripe_checkout_session_id?.startsWith("cs_") &&
    row.stripe_payment_intent_id?.startsWith("pi_") &&
    row.amount_cents === RECORDWATCH_LIFETIME_CENTS && row.currency === "usd");
}
