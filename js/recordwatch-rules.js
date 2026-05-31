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

  var DATE_FIELDS = [
    ["sentenceCompletionDate", ["sentenceCompletionDate", "sentence_completion_date"]],
    ["probationCompletedDate", ["probationCompletedDate", "probation_completed_date", "probationEndDate", "probation_end_date"]],
    ["dischargeDate", ["dischargeDate", "discharge_date"]],
    ["finalDischargeDate", ["finalDischargeDate", "final_discharge_date"]],
    ["completionDate", ["completionDate", "completion_date", "caseClosedDate", "case_closed_date"]]
  ];

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function normalize(value) { return clean(value).toLowerCase(); }
  function firstValue(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && clean(value) !== "") return value;
    }
    return "";
  }
  function toIsoDate(value) {
    if (window.RecordPathRuleDateUtils) return window.RecordPathRuleDateUtils.toIsoDate(value);
    if (!value) return "";
    var date = new Date(String(value).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(date.getTime())) date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  function addMonths(dateString, months) {
    var iso = toIsoDate(dateString);
    if (!iso) return "";
    var date = new Date(iso + "T00:00:00");
    date.setMonth(date.getMonth() + Number(months || 0));
    return date.toISOString().slice(0, 10);
  }
  function getCharges(caseData) { return Array.isArray(caseData && caseData.charges) ? caseData.charges : []; }
  function getOutcome(caseData) {
    var outcome = caseData && caseData.outcome;
    if (outcome && typeof outcome === "object") return normalize(firstValue(outcome, ["outcome", "disposition", "final_disposition"]));
    return normalize(outcome || caseData && (caseData.disposition || caseData.final_disposition));
  }
  function readDateCandidate(caseData, keys) {
    var sources = [caseData || {}, (caseData && caseData.outcome) || {}, (caseData && caseData.sentencing) || {}].concat(getCharges(caseData));
    for (var i = 0; i < sources.length; i += 1) {
      var iso = toIsoDate(firstValue(sources[i], keys));
      if (iso) return iso;
    }
    return "";
  }

  function getCompletionDateResult(caseData) {
    for (var i = 0; i < DATE_FIELDS.length; i += 1) {
      var iso = readDateCandidate(caseData, DATE_FIELDS[i][1]);
      if (iso) return { completionDate: iso, completionDateField: DATE_FIELDS[i][0] };
    }
    return { completionDate: "", completionDateField: "" };
  }

  function normalizeLevel(value) {
    if (window.RecordPathRuleDateUtils) return window.RecordPathRuleDateUtils.normalizeOffenseLevel(value);
    var text = clean(value).toUpperCase();
    if (/F3|FELONY\s*3/.test(text)) return "F3";
    if (/F4|FELONY\s*4/.test(text)) return "F4";
    if (/F5|FELONY\s*5/.test(text)) return "F5";
    if (/F1|FELONY\s*1/.test(text)) return "F1";
    if (/F2|FELONY\s*2/.test(text)) return "F2";
    if (/MINOR\s*MISDEMEANOR|\bMM\b/.test(text)) return "MM";
    if (/MISDEMEANOR|\bM\d?\b/.test(text)) return "M";
    return text;
  }
  function getHighestLevel(caseData) {
    var charges = getCharges(caseData);
    for (var i = 0; i < charges.length; i += 1) {
      var level = normalizeLevel(firstValue(charges[i], ["offenseLevel", "offense_level", "level", "degree", "chargeLevel", "charge_level"]));
      if (level) return level;
    }
    return normalizeLevel(firstValue(caseData || {}, ["offenseLevel", "offense_level", "level", "degree", "chargeLevel", "charge_level"]));
  }

  function mapCentralResult(result) {
    result = result || {};
    var period = result.requiredWaitingPeriod || {};
    var completionDate = result.dateUsedForCalculation || "";
    return {
      estimatedEligibleDate: result.estimatedEligibleDate || "",
      completionDate: completionDate,
      completionDateUsed: completionDate,
      completionDateField: result.dateUsedForCalculationField || "",
      waitingPeriodText: result.requiredWaitingPeriodLabel || "",
      requiredWaitingPeriodLabel: result.requiredWaitingPeriodLabel || "",
      waitingPeriodMonths: Number(period.years || 0) * 12 + Number(period.months || 0),
      eligibilityStatus: result.eligibilityStatus || "needs_review",
      likelyEligible: Boolean(result.likelyEligible),
      reasons: result.reasons || [],
      missingRequirements: result.missingRequirements || [],
      disqualifyingReasons: result.disqualifyingReasons || [],
      confidence: result.confidence || "needs_review",
      confidenceReason: result.confidenceReason || "RecordPathAI provides an estimate based on the information entered and available rules.",
      courtProfile: result.courtProfile || null,
      ruleSet: result.ruleSet || null,
      packetTemplate: result.packetTemplate || null,
      dateUsedForCalculation: completionDate,
      rawResult: result
    };
  }

  function calculateFallbackEligibilityResult(caseData) {
    var completion = getCompletionDateResult(caseData);
    var level = getHighestLevel(caseData);
    var outcome = getOutcome(caseData);
    var months = 12;
    var waitingPeriodText = "1 year";
    var reasons = [];
    var disqualifyingReasons = [];
    var missingRequirements = [];

    if (!completion.completionDate && !["pending", "sealed", "expunged"].includes(outcome)) missingRequirements.push("Final completion/discharge date");
    if (!outcome) missingRequirements.push("Case outcome/disposition");
    if (!level) missingRequirements.push("Offense level");
    if (outcome === "pending") disqualifyingReasons.push("Pending criminal proceedings must be resolved before filing.");
    if (level === "F1" || level === "F2") disqualifyingReasons.push(level + " conviction is excluded from this fallback estimate.");
    if (level === "F3") { months = 36; waitingPeriodText = "3 years"; }
    else if (level === "MM") { months = 6; waitingPeriodText = "6 months"; }
    else if (level === "F4" || level === "F5" || level.charAt(0) === "M") { months = 12; waitingPeriodText = "1 year"; }

    var estimated = completion.completionDate ? addMonths(completion.completionDate, months) : "";
    var days = daysUntil(estimated);
    var eligibilityStatus = "needs_review";
    var likelyEligible = false;
    if (disqualifyingReasons.length) eligibilityStatus = "not_eligible";
    else if (missingRequirements.length) eligibilityStatus = "needs_review";
    else if (days !== null && days <= 0) { eligibilityStatus = "likely_eligible"; likelyEligible = true; }
    else if (days !== null) eligibilityStatus = "not_yet_eligible";
    reasons.push(likelyEligible ? "Based on the final completion/discharge date entered, your waiting period appears satisfied." : "RecordWatch fallback eligibility estimate should be reviewed against court-specific rules.");
    return {
      estimatedEligibleDate: estimated,
      completionDate: completion.completionDate,
      completionDateUsed: completion.completionDate,
      completionDateField: completion.completionDateField,
      waitingPeriodText: waitingPeriodText,
      requiredWaitingPeriodLabel: waitingPeriodText,
      waitingPeriodMonths: months,
      eligibilityStatus: eligibilityStatus,
      likelyEligible: likelyEligible,
      reasons: reasons,
      missingRequirements: missingRequirements,
      disqualifyingReasons: disqualifyingReasons,
      confidence: eligibilityStatus === "needs_review" ? "needs_review" : "medium",
      confidenceReason: "Fallback estimate uses final completion/discharge date priority and should be reviewed against court-specific rules.",
      courtProfile: null,
      ruleSet: null,
      packetTemplate: null,
      dateUsedForCalculation: completion.completionDate
    };
  }

  function calculateEligibilityResult(caseData) {
    if (window.RecordPathEligibilityEngine && typeof window.RecordPathEligibilityEngine.resolveEligibilityForCase === "function") {
      return mapCentralResult(window.RecordPathEligibilityEngine.resolveEligibilityForCase(caseData || {}));
    }
    return calculateFallbackEligibilityResult(caseData || {});
  }

  function calculateEligibilityDate(caseData) { return calculateEligibilityResult(caseData).estimatedEligibleDate || ""; }
  function getMissingRequirements(caseData) { return calculateEligibilityResult(caseData).missingRequirements || []; }
  function getRiskFlags(caseData) { return calculateEligibilityResult(caseData).disqualifyingReasons || []; }

  function calculateCaseStatus(caseData) {
    var result = calculateEligibilityResult(caseData);
    if (result.eligibilityStatus === "likely_eligible") return STATUS.ELIGIBLE_NOW;
    if (result.eligibilityStatus === "not_yet_eligible") return STATUS.ELIGIBLE_FUTURE;
    if (result.eligibilityStatus === "not_eligible" || result.eligibilityStatus === "disqualified") return STATUS.LIKELY_INELIGIBLE;
    return STATUS.MORE_INFO;
  }

  function calculateEligibilityConfidence(caseData) {
    var result = calculateEligibilityResult(caseData);
    return { level: result.confidence || "needs_review", reason: result.confidenceReason || "RecordPathAI provides an estimate based on the information entered and available rules." };
  }

  function getRecommendedStatus(caseData) {
    var result = calculateEligibilityResult(caseData);
    if (result.eligibilityStatus === "likely_eligible") return "Prepare a court packet and verify local filing rules.";
    if (result.eligibilityStatus === "not_yet_eligible") return "Track requirements and wait until the estimated eligibility date.";
    if ((result.disqualifyingReasons || []).length) return "Review disqualifying or blocking flags before filing.";
    if ((result.missingRequirements || []).length) return "Gather missing requirements before relying on the eligibility estimate.";
    return "Update missing case details for a better estimate.";
  }

  function daysUntil(dateString) {
    if (window.RecordPathRuleDateUtils) return window.RecordPathRuleDateUtils.daysUntil(dateString);
    if (!dateString) return null;
    var target = new Date(dateString + "T00:00:00");
    if (Number.isNaN(target.getTime())) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
  }

  function formatDate(dateString) {
    if (window.RecordPathRuleDateUtils) return window.RecordPathRuleDateUtils.formatDate(dateString);
    if (!dateString) return "Not available";
    var date = new Date(dateString + "T00:00:00");
    if (Number.isNaN(date.getTime())) return "Not available";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  window.RecordWatchRules = {
    STATUS: STATUS,
    getCompletionDateResult: getCompletionDateResult,
    calculateEligibilityResult: calculateEligibilityResult,
    resolveEligibilityForCase: function (caseData) { return calculateEligibilityResult(caseData).rawResult || calculateEligibilityResult(caseData); },
    calculateCaseStatus: calculateCaseStatus,
    calculateEligibilityDate: calculateEligibilityDate,
    getMissingRequirements: getMissingRequirements,
    getRiskFlags: getRiskFlags,
    getRecommendedStatus: getRecommendedStatus,
    calculateEligibilityConfidence: calculateEligibilityConfidence,
    daysUntil: daysUntil,
    formatDate: formatDate
  };
}());
