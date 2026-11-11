import { verifiedPacketSession } from "./payment-security.js";

// Never trust a paid-hold database row alone to authorize a real bank-funded check.
// Call with a freshly retrieved, fully expanded Stripe Checkout Session:
// expand: ["payment_intent.latest_charge"].
export function verifyLivePacketPaymentForLob(session, job) {
  const fail = () => ({ ok: false, reason: "Live Stripe payment must be reverified before Lob dispatch." });
  if (!job || !session || session.id !== job.stripe_session_id ||
      !/^cs_live_[A-Za-z0-9]+$/.test(session.id || "") ||
      session.livemode !== true || session.mode !== "payment" ||
      !verifiedPacketSession(session, job.user_id, job.case_id))
    return fail();

  const fee = Number(session.metadata?.courtFeeCents);
  if (session.metadata?.fulfillmentMode !== "lob_check" ||
      !Number.isSafeInteger(fee) || fee <= 0 || fee !== job.court_fee_cents)
    return fail();

  const intent = session.payment_intent;
  if (!intent || typeof intent !== "object" ||
      !/^pi_[A-Za-z0-9]+$/.test(intent.id || "") ||
      intent.livemode !== true ||
      intent.status !== "succeeded" ||
      intent.currency !== "usd" ||
      !Number.isSafeInteger(intent.amount_received) ||
      intent.amount_received !== session.amount_total ||
      intent.amount !== session.amount_total)
    return fail();

  const charge = intent.latest_charge;
  if (!charge || typeof charge !== "object" ||
      charge.payment_intent !== intent.id ||
      charge.livemode !== true ||
      charge.paid !== true || charge.status !== "succeeded" ||
      charge.refunded === true || charge.disputed === true ||
      !Number.isSafeInteger(charge.amount_refunded) ||
      charge.amount_refunded !== 0 ||
      charge.currency !== "usd" ||
      charge.amount !== session.amount_total)
    return fail();
  return { ok: true, reason: null };
}
