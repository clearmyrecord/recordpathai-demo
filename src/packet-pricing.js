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
      message:"Approved Wood County Common Pleas conviction Pay and Mail costs $150, tax included: $50 preparation and a $100 court deposit. After verified payment, an operator releases the signed forms and check to the clerk. For digital delivery, the applicant pays any court deposit directly to the clerk."
    };
    if(type==="sealing-dismissal") return {
      ...core,scope:"wood-common-pleas-nonconviction",
      courtName:plan.courtName,
      message:"Wood County's official R.C. 2953.33 dismissal form is used for dismissed, not-guilty and no-bill outcomes. The court filing fee is $0; the $50 RecordPathAI preparation charge is separate. Verify all final outcomes and court instructions before preparation."
    };
    return {
      ...core,scope:"wood-common-pleas-outcome-unverified",
      courtName:plan.courtName,
      message:"For a standard conviction filing without fee waiver, Wood County's published court deposit is $100 (Pay and Mail total $150 including preparation and tax after approval). Unknown and nonconviction outcomes have different fee rules. No payment until confirmed."
    };
  }
  return {
    ...core,scope:"unknown",
    message:"RecordPathAI's preparation charge is $50. Court fees and filing methods depend on the exact court, case, outcome and accepted waiver. No verified total yet."
  };
}
