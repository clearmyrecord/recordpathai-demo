// RecordPathAI affiliate payout safety rules.
// No court data, bank details or customer identities are stored here.
// Payout intents require independent owner confirmation, never a browser-supplied amount.
import { AFFILIATE_MIN_PAYOUT_CENTS } from "./affiliate-program.js";

export const STRIPE_GLOBAL_API_VERSION = "2026-10-28.endive";
export const AFFILIATE_PAYOUT_HOLD_DAYS = 30;

export function validatedAffiliateRecipientId(value) {
  return /^acct_(?:test_)?[A-Za-z0-9]+$/.test(String(value || "")) ? String(value) : "";
}
export function restrictedPayoutKeyConfigured(key, live = true) {
  const value = String(key || "");
  return live ? /^rk_live_[A-Za-z0-9]+$/.test(value) : /^(rk_test_|sk_test_)[A-Za-z0-9]+$/.test(value);
}
export function eligibleAffiliateCommissions(rows, now = new Date()) {
  const cutoff = new Date(now).getTime();
  if (!Number.isFinite(cutoff)) throw new Error("Valid payout review date required");
  return (Array.isArray(rows) ? rows : []).filter(row => {
    const amount = Number(row?.commission_cents);
    const releaseAt = new Date(row?.available_after).getTime();
    return row?.status === "approved" &&
      !row?.payout_batch_id &&
      Number.isSafeInteger(amount) && amount > 0 && amount <= 1500 &&
      Number.isFinite(releaseAt) && releaseAt <= cutoff;
  });
}
export function affiliatePayoutAmount(rows, now = new Date()) {
  const eligible = eligibleAffiliateCommissions(rows, now);
  const cents = eligible.reduce((sum, row) => sum + Number(row.commission_cents), 0);
  return Number.isSafeInteger(cents) ? cents : 0;
}
export function affiliatePayoutAllowed(partner, rows, now = new Date()) {
  const amount = affiliatePayoutAmount(rows, now);
  return {
    amount_cents: amount,
    minimum_cents: AFFILIATE_MIN_PAYOUT_CENTS,
    ready: Boolean(
      partner?.status === "approved" && partner?.compliance_approved_at &&
      partner?.tax_reviewed_at && partner?.payouts_paused === false &&
      validatedAffiliateRecipientId(partner?.stripe_recipient_account_id) &&
      amount >= AFFILIATE_MIN_PAYOUT_CENTS
    )
  };
}
export function validatePayoutIntent(intent, { recipient, financialAccount, amountCents }) {
  if (!intent || !/^poi_(?:test_)?[A-Za-z0-9]+$/.test(String(intent.id || "")))
    throw new Error("Stripe payout intent ID was not verified");
  if (intent.to?.recipient !== recipient ||
      intent.from?.financial_account !== financialAccount ||
      intent.from?.currency !== "usd" ||
      intent.amount?.currency !== "usd" ||
      Number(intent.amount?.value) !== amountCents ||
      intent.confirmation_method !== "manual")
    throw new Error("Stripe payout details differ from the approved commission batch");
  return intent;
}
export function hasActiveUsAchRecipient(recipient) {
  const capabilities = recipient?.configuration?.recipient?.capabilities;
  return String(recipient?.identity?.country || "").toUpperCase() === "US" &&
    capabilities?.bank_accounts?.ach?.status === "active";
}
export function shouldRecordPayoutPaid(stripeStatus) {
  // 'posted' means funds have left Stripe. It is not proof of bank receipt;
  // returned payouts must be reversed in the commission ledger.
  return stripeStatus === "posted";
}
