// RecordPathAI affiliate attribution and commission math.
// This module never receives court filing fees or customer case details.
// Rollout requires explicit server config + applied database migration.
export const AFFILIATE_COMMISSION_BPS = 2000; // 20% of platform service fee
export const AFFILIATE_ATTRIBUTION_DAYS = 30;
export const AFFILIATE_HOLD_DAYS = 30;
export const AFFILIATE_MIN_PAYOUT_CENTS = 5000;
export const AFFILIATE_PRODUCTS = Object.freeze({
  recordwatch_lifetime: 3900,
  packet_preparation: 5000
});

export function normalizeAffiliateCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{6,24}$/.test(code) ? code : "";
}
export function newAffiliateCode(userId) {
  const id = String(userId || "").replace(/-/g, "").toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(id)) throw new Error("A verified user account is required.");
  return "RPAI" + id.slice(0, 12);
}
export function eligibleAffiliatePurchase(referralAt, paidAt, days = AFFILIATE_ATTRIBUTION_DAYS) {
  const referral = new Date(referralAt).getTime();
  const paid = new Date(paidAt).getTime();
  return Number.isFinite(referral) && Number.isFinite(paid) &&
    paid >= referral && paid - referral <= days * 86400000;
}
export function affiliateCommissionCents(product, collectedServiceFeeCents, commissionBps = AFFILIATE_COMMISSION_BPS) {
  if (!(product in AFFILIATE_PRODUCTS)) return 0;
  const expected = AFFILIATE_PRODUCTS[product];
  if (!Number.isSafeInteger(collectedServiceFeeCents) || collectedServiceFeeCents !== expected)
    return 0;
  if (!Number.isSafeInteger(commissionBps) || commissionBps < 0 || commissionBps > 3000)
    throw new Error("Affiliate commission outside approved range");
  return Math.floor((expected * commissionBps + 5000) / 10000);
}
export function commissionAvailableAfter(paymentDate, days = AFFILIATE_HOLD_DAYS) {
  const date = new Date(paymentDate);
  if (!Number.isFinite(date.getTime())) throw new Error("Valid payment date required");
  return new Date(date.getTime() + days * 86400000).toISOString();
}
