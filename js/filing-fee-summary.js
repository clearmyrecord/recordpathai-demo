/* Customer fee guidance only. Filing fees are independent of packet preparation.
   Never infer entitlement to relief or add court fees to RecordPathAI checkout. */
(function (root) {
  "use strict";
  const OHIO_CONVICTION_LAW = "https://codes.ohio.gov/ohio-revised-code/section-2953.32";
  const OHIO_DISMISSAL_LAW = "https://codes.ohio.gov/ohio-revised-code/section-2953.33";
  const dismissed = new Set(["dismissed", "not guilty", "acquitted", "no bill"]);
  function normalize(value) {
    return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\\s+/g, " ");
  }
  function describe(state, charges) {
    const s = String(state || "").trim().toUpperCase();
    const outcomes = (Array.isArray(charges) ? charges : [])
      .map(c => normalize(c && (c.final_disposition || c.disposition || c.outcome)))
      .filter(Boolean);
    if (!s) return {
      heading: "Select your case state to see filing-fee guidance",
      detail: "The court determines its own fees. We will show available state guidance when you select the state where the case was heard.",
      sourceUrl: ""
    };
    if (s !== "OH") return {
      heading: "Court fee: confirm with your filing court",
      detail: "Court fees vary by state, court, filing type and final outcome. Dismissed or not-guilty cases may have different fees from convictions. Verify the exact amount with your court before filing.",
      sourceUrl: ""
    };
    if (outcomes.length && outcomes.every(outcome => dismissed.has(outcome))) return {
      heading: "Ohio: no $50 conviction-application fee for dismissal or acquittal filings",
      detail: "Ohio R.C. 2953.33 covers dismissed, not-guilty, acquitted and no-bill cases and does not impose the R.C. 2953.32 conviction-application fee. Confirm any separate local costs with your clerk; eligibility and mixed-case rules still require review.",
      sourceUrl: OHIO_DISMISSAL_LAW
    };
    if (outcomes.includes("convicted")) return {
      heading: "Ohio conviction filing: $50 state fee + up to $50 local court fee",
      detail: "R.C. 2953.32 allows these fees per application, regardless of how many records the application covers. A poverty affidavit may waive the application fee. Mixed convicted and dismissed outcomes may need separate court review or filing routes. Confirm the clerk's actual charge before filing.",
      sourceUrl: OHIO_CONVICTION_LAW
    };
    return {
      heading: "Ohio court fees depend on each charge's final outcome",
      detail: "For qualifying conviction applications, R.C. 2953.32 specifies a $50 state fee plus up to $50 local fee per application, subject to indigency provisions. Dismissed or not-guilty applications follow R.C. 2953.33 and do not carry that conviction-application fee. Verify unknown or mixed outcomes before estimating a total.",
      sourceUrl: OHIO_CONVICTION_LAW
    };
  }
  function render(state, charges) {
    if (typeof document === "undefined") return describe(state, charges);
    const result = describe(state, charges);
    const heading = document.getElementById("courtFeeHeading");
    const detail = document.getElementById("courtFeeDetails");
    const source = document.getElementById("courtFeeSource");
    if (heading) heading.textContent = result.heading;
    if (detail) detail.textContent = result.detail;
    if (source) {
      source.hidden = !result.sourceUrl;
      if (result.sourceUrl) source.href = result.sourceUrl;
      else source.removeAttribute("href");
    }
    return result;
  }
  const api = Object.freeze({ describe, render, OHIO_CONVICTION_LAW, OHIO_DISMISSAL_LAW });
  root.RecordPathFilingFees = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
