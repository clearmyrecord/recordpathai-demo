/* RecordPathAI — Ohio 2025 law / Wood County pilot review screen.
   Decision SUPPORT only: never a legal determination, filing authorization,
   court-fee quote, payment approval or verified evidence repository.
   Primary law: Ohio Rev. Code 2953.32 (effective 2025-09-30), 2953.33, 2953.61. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RecordPathOhioReview = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SOURCES = Object.freeze({
    conviction: "https://codes.ohio.gov/ohio-revised-code/section-2953.32",
    nonconviction: "https://codes.ohio.gov/ohio-revised-code/section-2953.33",
    combinedCharges: "https://codes.ohio.gov/ohio-revised-code/section-2953.61",
    woodConvictionForm: "https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF",
    woodNonconvictionForm: "https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/143/Application-for-Sealing-295333-Dismissal-PDF",
    woodFees: "https://clerkofcourt.co.wood.oh.us/189/Criminal-Division-of-the-Clerk-of-Courts"
  });
  const WOOD_FEE = Object.freeze({
    stateApplicationFee: 50, maximumLocalFee: 50,
    woodCountyPublishedDeposit: 100, waiverMayApply: true,
    confirmPayableAndAmountWithClerk: true,
    recordPathPreparationFeeIncluded: false
  });
  const OUTCOMES = Object.freeze({
    conviction: new Set(["convicted","conviction","guilty","pleaded_guilty","pled_guilty"]),
    dismissal: new Set(["dismissed","dismissal","acquitted","not_guilty","not_guilty_finding"]),
    nobill: new Set(["no_bill","no_true_bill","not_indicted"])
  });
  const normalize = value => String(value || "").trim().toLowerCase().replace(/[\\s-]+/g, "_");
  const has = value => typeof value === "string" && value.trim() !== "";
  function iso(value) {
    if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
    const date = new Date(value + "T00:00:00Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) return null;
    return value;
  }
  function addMonths(value, months) {
    const parsed = iso(value);
    if (!parsed || !Number.isInteger(months) || months < 0) return null;
    const [year, month, day] = parsed.split("-").map(Number);
    const targetMonth = (year * 12 + (month - 1)) + months;
    const y = Math.floor(targetMonth / 12), m = targetMonth % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + "-" + String(m + 1).padStart(2,"0") + "-" + String(Math.min(day,last)).padStart(2,"0");
  }
  function statute(charge) {
    return String(charge?.charge_code || charge?.final_statute || "").match(/\\b\\d{4}\\.\\d{2,3}\\b/)?.[0] || "";
  }
  function routeOutcome(charge) {
    const o = normalize(charge?.final_disposition || charge?.disposition);
    if (OUTCOMES.conviction.has(o)) return "conviction";
    if (OUTCOMES.dismissal.has(o)) return "dismissal";
    if (OUTCOMES.nobill.has(o)) return "no_bill";
    return "unknown";
  }
  function approximateTiming(charge, relief, asOf) {
    const outcome = routeOutcome(charge);
    if (outcome === "unknown") return {date:null,status:"unresolved_outcome"};
    if (outcome === "dismissal") {
      if (!iso(charge?.disposition_date)) return {date:null,status:"missing_disposition"};
      return {date:charge.disposition_date,status:charge.disposition_date <= asOf ? "time_elapsed" : "time_not_elapsed",
        note:"Dismissals without prejudice require a statute-of-limitations review; acquittal timing may differ."};
    }
    if (outcome === "no_bill") {
      const reportDate = iso(charge?.no_bill_report_to_court_date);
      if (!reportDate) return {date:null,status:"missing_grand_jury_report_date"};
      const date = addMonths(reportDate,24);
      return {date,status:date <= asOf ? "time_elapsed" : "time_not_elapsed"};
    }
    // A clerk-export 'termination date' and judgment date are NOT the date of final discharge.
    // In particular, NEVER infer this from disposition_date or reported_termination_date_unverified.
    const verified = charge?.final_discharge_evidence_status === "verified" &&
      charge?.final_discharge_evidence_source && has(charge.final_discharge_evidence_source);
    const discharge = verified ? iso(charge?.final_discharge_date) : null;
    if (!discharge) return {date:null,status:"unverified_final_discharge"};
    const degree = String(charge?.level || charge?.degree || "").trim().toUpperCase();
    const code = statute(charge);
    let waitMonths;
    if (degree === "MM") waitMonths = 6;
    else if (/^M[1-4]$/.test(degree)) waitMonths = 12;
    else if (degree === "F4" || degree === "F5") waitMonths = code==="2921.43" ? 84 : 12;
    else if (degree === "F3") waitMonths = code==="2921.43" ? 84 : 36;
    else return {date:null,status:"offense_degree_review_required"};
    if (relief === "expungement" && degree.startsWith("F")) waitMonths += 120;
    const date = addMonths(discharge,waitMonths);
    return {date,status:date <= asOf ? "time_elapsed" : "time_not_elapsed",
      from:"documented final discharge",months:waitMonths};
  }
  function review(data,{today="2026-11-07"}={}) {
    const issues=[], chargeReviews=[], charges = Array.isArray(data?.charges) ? data.charges : [];
    const state=normalize(data?.court?.state || data?.meta?.source_state);
    const isOhio=state==="oh"||state==="ohio";
    const isWood=/^wood(?:_county)?$/.test(normalize(data?.court?.county));
    if (!isOhio) issues.push("Ohio pilot only: wrong or unknown case state.");
    if (!isWood) issues.push("Wood County pilot forms cannot be assumed for another county.");
    if (data?.court?.court_type!=="court-of-common-pleas")
      issues.push("Confirm the exact court type; this Common Pleas form must not be selected by county alone.");
    if(!has(data?.court?.case_number)) issues.push("Case number not verified.");
    if(data?.case?.all_charges_confirmed!=="yes") issues.push("Entire charge and related-case inventory is unconfirmed.");
    if(data?.case?.proceedings_status!=="none") issues.push("Other pending criminal proceedings need checking.");
    if(!charges.length)issues.push("No court-verified final charge list.");
    if(charges.length>4)issues.push("The Wood County application has four charge rows; more than four counts need approved handling.");
    const outcomes=charges.map(routeOutcome);
    const mixed=outcomes.includes("conviction") && outcomes.some(o=>o!=="conviction");
    if(mixed)issues.push("Mixed related outcomes: apply R.C. 2953.61 and require case-level legal review.");
    if(charges.length>1)issues.push("Multiple counts: review R.C. 2953.32(A)(3), conviction-count aggregation and shared dates; no automatic eligibility or filing.");
    let earliest=null;
    charges.forEach((charge,i)=>{
      const outcome=outcomes[i],degree=String(charge?.level||charge?.degree||"").toUpperCase();
      const code=statute(charge), cissues=[];
      if(outcome==="unknown")cissues.push("Final outcome unknown; never infer from the original allegation.");
      if(!has(charge?.charge_code)||!has(charge?.charge_name))cissues.push("Verify final/amended statute and offense description from the journal.");
      if(!iso(charge?.disposition_date))cissues.push("Verify the court judgment/disposition date separately.");
      if(outcome==="conviction"){
        if(!has(charge?.final_discharge_evidence_source)||charge?.final_discharge_evidence_status!=="verified"||
           !iso(charge?.final_discharge_date))
          cissues.push("Independent proof of final sentence discharge, including supervision and fines, is missing.");
        if(["F1","F2"].includes(degree))cissues.push("F1/F2 conviction: statute exclusion under R.C. 2953.32(A)(1)(f).");
        if(code==="2921.41")cissues.push("Theft in office: excluded conviction.");
        if(/^45(?:06|07|10|11|49)\\./.test(code))cissues.push("Traffic / motor vehicle conviction: excluded by statute.");
        if(code==="2919.25"&&["M1","M2"].includes(degree))
          cissues.push("Domestic violence M1/M2: conviction excluded.");
        if(code==="2919.25"&&["M3","M4"].includes(degree))
          cissues.push("Domestic violence M3/M4: sealing-only exception; expungement prohibited.");
        if(code==="2919.27")
          cissues.push("Violation of protection order: sealing-only exception; expungement prohibited.");
        if(charge?.felony_violence_offense===true || charge?.sex_registry_ineligible===true || charge?.victim_under_13===true)
          cissues.push("Potential statutory violence/sex-registration/child-victim exclusion; confirm current court status.");
        if(degree==="F3")cissues.push("F3 conviction limits require applicant-wide felony and aggregate-count verification.");
      }
      if(outcome==="dismissal")cissues.push("Check dismissal with/without prejudice; limitations, pending cases and R.C. 2953.33(C) expungement restrictions.");
      if(outcome==="no_bill" && !iso(charge?.no_bill_report_to_court_date))
        cissues.push("No bill: verify exact date the grand jury reported the no bill to court.");
      const sealing=approximateTiming(charge,"sealing",today);
      const expungement=approximateTiming(charge,"expungement",today);
      if(sealing.date && (!earliest||sealing.date>earliest))earliest=sealing.date;
      issues.push(...cissues.map(x=>"Charge "+(i+1)+": "+x));
      chargeReviews.push({index:i+1,outcome,finalStatute:code||null,degree:degree||null,
        sealing,expungement,issues:cissues});
    });
    issues.push("Statutory exclusions and nationwide record history must be source-verified; court retains all decision authority.");
    issues.push("Confirm current Wood County form revision, fees, prosecutor service, signature and address-verification page before filing.");
    return Object.freeze({
      jurisdiction:isOhio&&isWood?"OH-Wood":"unverified",
      asOf:today,statuteEffective:"2025-09-30",
      caseOutcome:mixed?"mixed":outcomes.every(o=>o==="conviction")?"conviction":outcomes.every(o=>o!=="conviction"&&o!=="unknown")?"nonconviction":"needs_review",
      recommendedAction:"manual_review_only",eligible:false,safeToFile:false,allowPayment:false,allowMail:false,
      formRowCapacity:4,chargeCount:charges.length,provisionalSealingDate:earliest,
      chargeReviews,issues:[...new Set(issues)],fee:WOOD_FEE,sources:SOURCES
    });
  }
  return Object.freeze({SOURCES,WOOD_FEE,iso,addMonths,statute,routeOutcome,approximateTiming,review});
}));
