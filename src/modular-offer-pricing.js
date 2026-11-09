// Pricing preview for a proposed modular RecordPathAI checkout.
// This module cannot authorize Stripe collection, PDF release, or Lob dispatch.
// All paid entitlements, case approvals, and provider quotes must be verified
// independently on the server before enabling any live checkout.
export const RECORDWATCH_LIFETIME_PRICE_CENTS = 3900;
export const PACKET_PREPARATION_PRICE_CENTS = 5000;

function money(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Model optional purchases on ONE court filing/application.
 *
 * Only server-verified values may be supplied as verifiedCourtFeeCents and
 * verifiedLobFulfillmentFeeCents; never use browser-submitted amounts to bill.
 * Court fees are not RecordPathAI preparation revenue.
 */
export function previewModularCheckout({
  recordwatch = false,
  packet = false,
  lobMailing = false,
  hasExistingRecordwatchEntitlement = false,
  verifiedCourtFeeCents = null,
  verifiedLobFulfillmentFeeCents = null
} = {}) {
  if (lobMailing && !packet)
    throw new Error("Printing and mailing require a prepared packet.");
  const rows = [];
  if (recordwatch && !hasExistingRecordwatchEntitlement)
    rows.push({
      key:"recordwatch_lifetime_case",label:"RecordWatch Premium — lifetime for one filing",
      amountCents:RECORDWATCH_LIFETIME_PRICE_CENTS,kind:"service"
    });
  if (packet)
    rows.push({
      key:"packet_preparation",label:"Reviewed digital court packet preparation",
      amountCents:PACKET_PREPARATION_PRICE_CENTS,kind:"service"
    });

  const courtFee = money(verifiedCourtFeeCents);
  const lobFee = money(verifiedLobFulfillmentFeeCents);
  const pending = [];
  if (lobMailing) {
    if (lobFee === null) pending.push("Verified Lob printing and mailing quote");
    else rows.push({
      key:"lob_print_and_mail",label:"Optional printing and mailing",
      amountCents:lobFee,kind:"fulfillment"
    });
    if (courtFee === null) pending.push("Verified court filing fee or accepted waiver");
    else if (courtFee > 0) rows.push({
      key:"court_fee_pass_through",label:"Court filing fee (pass-through)",
      amountCents:courtFee,kind:"court_fee"
    });
  }
  // A self-filer pays any filing fee directly to the court rather than
  // handing those funds to RecordPathAI as part of digital-only checkout.
  const subtotalCents = rows.reduce((total,row)=>total+row.amountCents,0);
  return {
    rows,
    subtotalCents,
    totalCents:pending.length?null:subtotalCents,
    pending,
    requiresManualProviderApproval:lobMailing,
    canCollect:false, // An informational quote cannot become a payment authorization.
    courtFeeChargedByRecordPathAI:Boolean(lobMailing && courtFee !== null && courtFee > 0),
    directCourtPaymentRequired:packet && !lobMailing,
    note:lobMailing
      ?"Physical fulfillment requires approved Lob service, court-specific authority, and tracking disclosures."
      :"Digital packet access is independent of Lob; self-filers handle court fees separately."
  };
}
