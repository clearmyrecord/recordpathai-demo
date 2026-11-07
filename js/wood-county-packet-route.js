(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RecordPathWoodCountyPacketRoute = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const FORM_URLS = Object.freeze({
    "sealing-dismissal": "https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/143/Application-for-Sealing-295333-Dismissal-PDF",
    "sealing-conviction": "https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF"
  });
  const NONCONVICTION = new Set(["dismissed", "acquitted", "no_bill"]);
  function normalize(v) { return String(v || "").trim().toLowerCase().replace(/[\s-]+/g,"_"); }
  function status(v) {
    const t = normalize(v);
    if (["not_guilty", "found_not_guilty", "acquitted", "acquittal"].includes(t)) return "acquitted";
    if (["dismissed","dismissal","dismissed_with_prejudice","dismissed_without_prejudice"].includes(t)) return "dismissed";
    if (["no_bill","nobill","no_true_bill","not_indicted"].includes(t)) return "no_bill";
    if (["convicted","conviction","guilty","pleaded_guilty","pled_guilty"].includes(t)) return "convicted";
    return "unknown";
  }
  function isoDate(value) {
    if (typeof value !== "string") return "";
    let m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      const a = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!a) return "";
      m = [a[0],a[3],String(a[1]).padStart(2,"0"),String(a[2]).padStart(2,"0")];
    }
    const d = new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
    return Number.isFinite(d.getTime()) && d.getUTCFullYear() === +m[1] &&
      d.getUTCMonth() + 1 === +m[2] && d.getUTCDate() === +m[3] ? d.toISOString().slice(0,10) : "";
  }
  function analyze(data, asOf) {
    const state = normalize(data?.court?.state || data?.court?.caseState || data?.meta?.source_state);
    const county = normalize(data?.court?.county || data?.meta?.source_county).replace(/_county$/, "");
    const courtName = normalize(data?.court?.name || data?.court?.courtName || "");
    if (!(["oh", "ohio"].includes(state) && county === "wood" &&
      (courtName.includes("common_pleas") || courtName.includes("court_of_common_pleas")))) return { applicable: false };
    const caseNo = String(data?.court?.case_number || data?.court?.caseNumber || "").trim();
    const charges = Array.isArray(data?.charges) ? data.charges.filter(Boolean) : [];
    function review(reason) { return {applicable:true,ready:false,kind:"review",reason,courtFeeCheckRequired:false,officialFormUrl:""}; }
    if (!caseNo || !charges.length) return review("Case number and every charge's final disposition are required.");
    const outcomes = [];
    for (const charge of charges) {
      const chargeNo = String(charge.case_number || charge.caseNumber || "").trim();
      if (chargeNo && chargeNo !== caseNo) return review("Multiple case numbers require separate routing and legal review.");
      const final = String(charge.final_disposition || charge.finalDisposition || charge.disposition || "").trim();
      const kind = status(final);
      if (kind === "unknown") return review("Unverified, missing or pending charge disposition. Check official docket.");
      if (NONCONVICTION.has(kind) && !isoDate(charge.disposition_date || charge.dispositionDate)) return review("Court entry date for the nonconviction disposition is required.");
      if (/without[ _-]?prejudice/i.test(final) && !charge.statuteOfLimitationsVerified && !charge.statute_of_limitations_verified)
        return review("Dismissal without prejudice: verify applicable statute of limitations before routing.");
      if (kind === "no_bill") {
        const reported = isoDate(charge.no_bill_date || charge.noBillDate || charge.disposition_date || charge.dispositionDate);
        if (!reported) return review("No-bill report date is required to apply the two-year waiting period.");
        const due = new Date(reported + "T00:00:00Z");
        due.setUTCFullYear(due.getUTCFullYear()+2);
        const eligibleOn = due.toISOString().slice(0,10);
        const today = isoDate(asOf || new Date().toISOString().slice(0,10));
        if (!today) return review("Cannot verify current evaluation date.");
        if (today < eligibleOn) return {applicable:true,kind:"waiting",ready:false,eligibleOn,reason:"The no-bill two-year waiting period has not elapsed.",courtFeeCheckRequired:false};
      }
      outcomes.push(kind);
    }
    const convictions = outcomes.some(x=>x==="convicted");
    const dismissals = outcomes.some(x=>NONCONVICTION.has(x));
    if (convictions && dismissals) return review("Mixed conviction and nonconviction dispositions: R.C. 2953.61 review required.");
    const formType = convictions ? "sealing-conviction" : "sealing-dismissal";
    return {
      applicable:true,kind:convictions?"conviction":"nonconviction",ready:true,formType,
      statute:convictions?"2953.32":"2953.33",
      officialFormUrl:FORM_URLS[formType],
      courtFeeAmountCents:convictions?10000:0,
      courtFeeCheckRequired:convictions,
      courtFeeVerified:false,
      feeNote:convictions
        ? "Wood County lists a $100 conviction sealing deposit; verify current costs and indigency rules."
        : "No court filing fee generally applies to an all-nonconviction R.C. 2953.33 petition. Do not prepare a $100 court check; confirm local clerk practice before filing."
    };
  }
  return Object.freeze({analyze, normalizeStatus:status, officialForms:FORM_URLS});
}));