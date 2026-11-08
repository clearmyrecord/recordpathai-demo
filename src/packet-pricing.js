// Public court-fee quoting only. A quote never authorizes payment, issuance of
// checks, filing, or mail. The service fee and court's money stay separate.
export const SERVICE_PREPARATION_CENTS = 5000;
export const WOOD_COMMON_PLEAS_CONVICTION_COURT_CENTS = 10000;

// Sources: https://clerkofcourt.co.wood.oh.us/189/Criminal-Division-of-the-Clerk-of-Courts
// https://codes.ohio.gov/ohio-revised-code/section-2953.32
// Last reviewed 2026-11-07. Always reverify at actual filing.
const clean = (value) => String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
const stateCode = (value) => {
  const state = clean(value);
  return state === "oh" || state === "ohio" ? "OH" : state.toUpperCase();
};
const normalizeCourtType = (value) => {
  const type = clean(value);
  if (["court-of-common-pleas","common-pleas","common-pleas-court","wood-county-court-of-common-pleas"].includes(type))
    return "court-of-common-pleas";
  return type;
};
const formCategory = (value) => {
  const type = clean(value);
  if (["sealing-conviction","conviction","convicted","sealing-of-conviction"].includes(type))
    return "conviction";
  if (["sealing-dismissal","nonconviction","dismissal","dismissed","acquittal","not-guilty","no-bill"].includes(type))
    return "nonconviction";
  return "unknown";
};

export function quotePacketPricing(input = {}) {
  const state = stateCode(input.state || input.caseState || input.case_state);
  const county = clean(input.county || input.caseCounty).replace(/-county$/, "");
  const courtType = normalizeCourtType(input.courtType || input.court_type);
  const category = formCategory(input.formType || input.form_type || input.finalOutcome);
  const core = {
    serviceFeeCents: SERVICE_PREPARATION_CENTS,
    courtFeeCents: null,
    totalCents: null,
    currency: "usd",
    canCollect: false,
    filingMethod: "not_verified",
    message: "Court fee, payment method and filing requirements must be verified before charging."
  };
  if (state === "OH" && county === "wood" && courtType === "court-of-common-pleas") {
    if (category === "conviction") {
      return {
        ...core, courtFeeCents: WOOD_COMMON_PLEAS_CONVICTION_COURT_CENTS,
        totalCents: SERVICE_PREPARATION_CENTS + WOOD_COMMON_PLEAS_CONVICTION_COURT_CENTS,
        scope: "wood-common-pleas-conviction", courtName: "Wood County Court of Common Pleas",
        message: "Illustrative total for conviction sealing without an approved poverty affidavit: $50 document preparation + $100 Wood County court deposit. Review is still required. Checkout, checks, mailing and e-filing are not active."
      };
    }
    if (category === "nonconviction") {
      return {
        ...core, courtFeeCents: 0, totalCents: SERVICE_PREPARATION_CENTS,
        scope: "wood-common-pleas-nonconviction",
        courtName: "Wood County Court of Common Pleas",
        message: "A dismissal, acquittal or no-bill generally has no sealing/expungement filing fee. Verify the exact disposition and court requirements before purchasing document preparation."
      };
    }
  }
  return { ...core, scope: "unknown", message: "The RecordPathAI preparation service is $50. Court fees vary by case, court, relief type and fee-waiver status. Total cannot be quoted yet." };
}
