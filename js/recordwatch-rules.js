(function () {
  "use strict";

  var STATUS = {
    ELIGIBLE_NOW: "Eligible now",
    ELIGIBLE_FUTURE: "Eligible on future date",
    LIKELY_INELIGIBLE: "Likely ineligible",
    MORE_INFO: "More information needed",
    PENDING: "Pending case",
    ALREADY_RELIEVED: "Already sealed/expunged"
  };

  var fallbackStateRules = {
    Ohio: { dismissedMonths: 0, misdemeanorMonths: 12, felonyMonths: 36, diversionMonths: 12 },
    Nevada: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 84, diversionMonths: 12 },
    California: { dismissedMonths: 0, misdemeanorMonths: 12, felonyMonths: 48, diversionMonths: 12 },
    Arizona: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 },
    Texas: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 },
    Florida: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 },
    generic: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 }
  };

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function normalize(value) { return clean(value).toLowerCase(); }
  function getEngine() { return window.RecordPathEligibilityEngine; }

  function firstValue(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && clean(value) !== "") return value;
    }
    return "";
  }

  function getCharges(caseData) { return Array.isArray(caseData && caseData.charges) ? caseData.charges : []; }
  function getOutcome(caseData) { return normalize(caseData && caseData.outcome && caseData.outcome.outcome); }
  function getState(caseData) { return (caseData && caseData.court && caseData.court.caseState) || ""; }

  function fallbackCompletionDateResult(caseData) {
    var outcome = (caseData && caseData.outcome) || {};
    var sentencing = (caseData && caseData.sentencing) || {};
    var charge = getCharges(caseData)[0] || {};
    var sources = [caseData || {}, outcome, sentencing, charge];
    var priority = [
      { label: "sentence_completion_date", aliases: ["sentence_completion_date", "sentenceCompletionDate"] },
      { label: "probation_completed_date", aliases: ["probation_completed_date", "probationCompletedDate", "probation_end_date", "probationEndDate"] },
      { label: "discharge_date", aliases: ["discharge_date", "dischargeDate"] },
      { label: "completion_date", aliases: ["completion_date", "completionDate"] },
      { label: "final_discharge_date", aliases: ["final_discharge_date", "finalDischargeDate"] }
    ];
    for (var i = 0; i < priority.length; i += 1) {
      for (var j = 0; j < sources.length; j += 1) {
        var value = firstValue(sources[j], priority[i].aliases);
        if (value) return { date: toIsoDate(value), field: priority[i].label };
      }
    }
    var fallback = firstValue(outcome, ["dispositionDate", "disposition_date"]);
    return fallback ? { date: toIsoDate(fallback), field: "disposition_date_fallback" } : { date: "", field: "" };
  }

  function toIsoDate(value) {
    if (!value) return "";
    var date = new Date(String(value).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(date.getTime())) date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function addMonths(dateString, months) {
    var date = new Date(dateString + "T00:00:00");
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  function fallbackResult(caseData) {
    var completion = fallbackCompletionDateResult(caseData);
    var charge = getCharges(caseData)[0] || {};
    var state = normalize(getState(caseData));
    var level = clean(charge.chargeLevel || charge.degree || charge.level).toUpperCase();
    var text = normalize((charge.chargeName || charge.offense_name || "") + " " + (charge.statuteCode || charge.offenseCode || charge.charge_code || ""));
    var months = state === "ohio" || state === "oh" ? (/2921\.43/.test(text) ? 84 : (/\bF3\b/.test(level) ? 36 : 12)) : fallbackStateRules.generic.felonyMonths;
    var date = completion.date ? addMonths(completion.date, months) : "";
    return { estimatedEligibleDate: date, eligibilityDate: date, completionDate: completion.date, completionDateField: completion.field, waitingPeriodMonths: months, waitingPeriodYears: months / 12, waitingPeriodText: months === 36 ? "3 years" : months / 12 + " years", status: date && daysUntil(date) <= 0 ? STATUS.ELIGIBLE_NOW : (date ? STATUS.ELIGIBLE_FUTURE : STATUS.MORE_INFO), source: "RecordWatchRules fallback" };
  }

  function calculateEligibilityResult(caseData) {
    var engine = getEngine();
    if (engine && typeof engine.resolveEligibilityForCase === "function") return engine.resolveEligibilityForCase(caseData || {});
    return fallbackResult(caseData || {});
  }

  function calculateEligibilityDate(caseData) { return calculateEligibilityResult(caseData).estimatedEligibleDate || ""; }
  function getCompletionDateResult(caseData) { var engine = getEngine(); return engine && engine.getCompletionDateResult ? engine.getCompletionDateResult(caseData || {}) : fallbackCompletionDateResult(caseData || {}); }

  function getRiskFlags(caseData) {
    var result = calculateEligibilityResult(caseData);
    return result.riskFlags || [];
  }

  function getMissingRequirements(caseData) {
    var result = calculateEligibilityResult(caseData);
    return result.missingRequirements || [];
  }

  function calculateCaseStatus(caseData) {
    var result = calculateEligibilityResult(caseData);
    return result.status || result.statusLabel || STATUS.MORE_INFO;
  }

  function calculateEligibilityConfidence(caseData) {
    var result = calculateEligibilityResult(caseData);
    return { level: result.confidence || (result.needsReview ? "needs_review" : "medium"), reason: result.confidenceReason || "Estimate based on available RecordWatch data." };
  }

  function getRecommendedStatus(caseData) {
    var result = calculateEligibilityResult(caseData);
    if (result.riskFlags && result.riskFlags.length) return "Review risk flags before filing and consider legal review.";
    if (result.missingRequirements && result.missingRequirements.length) return "Gather missing requirements before relying on the eligibility estimate.";
    if (result.isEligibleNow) return "Prepare a court packet and verify local filing rules.";
    if (result.isNotYetEligible) return "Track requirements and wait until the estimated eligibility date.";
    return "Update missing case details for a better estimate.";
  }

  function daysUntil(dateString) {
    if (!dateString) return null;
    var target = new Date(dateString + "T00:00:00");
    if (Number.isNaN(target.getTime())) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
  }

  function formatDate(dateString) {
    if (!dateString) return "Not available";
    var date = new Date(dateString + "T00:00:00");
    if (Number.isNaN(date.getTime())) return "Not available";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  window.RecordWatchRules = {
    stateRules: fallbackStateRules,
    calculateCaseStatus: calculateCaseStatus,
    calculateEligibilityDate: calculateEligibilityDate,
    calculateEligibilityResult: calculateEligibilityResult,
    getCompletionDateResult: getCompletionDateResult,
    getMissingRequirements: getMissingRequirements,
    getRiskFlags: getRiskFlags,
    getRecommendedStatus: getRecommendedStatus,
    calculateEligibilityConfidence: calculateEligibilityConfidence,
    daysUntil: daysUntil,
    formatDate: formatDate
  };
}());
