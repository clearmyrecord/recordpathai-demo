import { courtFilingPlan, normalizeCourtFormType } from "./court-profiles.js";

// Fee quotes are informative only; collecting funds requires server-validated
// reviewer release, current court rules and a confirmed fulfillment route.
export const SERVICE_PREPARATION_CENTS = 5000;
export const WOOD_COMMON_PLEAS_CONVICTION_COURT_CENTS = 10000;

export function quotePacketPricing(input = {}) {
  const plan = courtFilingPlan(input);
  const type=normalizeCourtFormType(input.formType || input.form_type || input.finalOutcome);
  const core={
    serviceFeeCents:SERVICE_PREPARATION_CENTS,
    courtFeeCents:plan.courtFeeCents,
    totalCents:plan.courtFeeCents===null ? null : SERVICE_PREPARATION_CENTS+plan.courtFeeCents,
    currency:"usd",
    canCollect:false,
    filingMethod:plan.filingMethod,
    profileId:plan.profileId,
    postalTrackingGuaranteed:Boolean(plan.postalTrackingGuaranteed)
  };
  if(plan.profileId==="oh-wood-common-pleas"){
    if(type==="sealing-conviction") return {
      ...core,scope:"wood-common-pleas-conviction",
      courtName:plan.courtName,
      message:"Wood County Common Pleas conviction sealing: $50 for RecordPathAI preparation plus a separate $100 court deposit (estimated combined $150, absent an accepted fee waiver). Local Rule 3.03 permits filing a searchable PDF by e-mail AFTER direct court prepayment; that $100 must not also be collected for a Lob check. Filing and packet checkout remain gated until the signed original, proof of prepayment and applicant authorization are verified."
    };
    if(type==="sealing-dismissal") return {
      ...core,scope:"wood-common-pleas-nonconviction",
      courtName:plan.courtName,
      message:"A dismissal, not-guilty or no-bill application generally has no conviction filing fee. Verify all final outcomes and court instructions before purchasing $50 document preparation."
    };
    return {
      ...core,scope:"wood-common-pleas-outcome-unverified",
      courtName:plan.courtName,
      message:"For a standard conviction filing without fee waiver, Wood County's published court deposit is $100 (proposed total $150 including preparation). Unknown and nonconviction outcomes have different fee rules. No payment until confirmed."
    };
  }
  return {
    ...core,scope:"unknown",
    message:"RecordPathAI's preparation charge is $50. Court fees and filing methods depend on the exact court, case, outcome and accepted waiver. No verified total yet."
  };
}
