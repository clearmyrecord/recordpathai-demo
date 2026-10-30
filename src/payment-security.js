// Payment release gates must depend on Stripe server-side facts, not browser flags.
export const PACKET_PRICE_CENTS = 5000;
export function verifiedPacketSession(session, userId, caseId = null) {
  const m = session?.metadata || {};
  return Boolean(session?.id && session.status === "complete" &&
    session.payment_status === "paid" && session.currency === "usd" &&
    Number.isSafeInteger(session.amount_total) &&
    session.amount_total >= PACKET_PRICE_CENTS &&
    m.productType === "record-sealing-packet" &&
    m.userId && m.userId === userId &&
    (!caseId || m.saved_case_id === caseId || m.case_id === caseId));
}
export function verifiedRecordwatchSession(session, userId) {
  const m = session?.metadata || {};
  return Boolean(session?.id && session.status === "complete" &&
    session.payment_status === "paid" &&
    m.product === "premium_recordwatch" &&
    m.user_id && m.user_id === userId &&
    ["monthly", "annual", "addon_12_month"].includes(m.plan));
}
export function safeCheckoutRedirect(url, baseUrl, fallbackPath) {
  const origin = new URL(baseUrl).origin;
  const destination = new URL(url || fallbackPath, origin);
  if (destination.origin !== origin || !["https:", "http:"].includes(destination.protocol) ||
      destination.username || destination.password ||
      !destination.pathname.endsWith(".html")) {
    throw Object.assign(new Error("Checkout redirect must stay on the RecordPathAI website"), {status:400});
  }
  return destination.toString();
}
export function assertFixedPacketAmount(amount, currency) {
  if (Number(amount) !== PACKET_PRICE_CENTS || String(currency).toLowerCase() !== "usd")
    throw Object.assign(new Error("Packet preparation is fixed at $50 USD"),{status:400});
}
