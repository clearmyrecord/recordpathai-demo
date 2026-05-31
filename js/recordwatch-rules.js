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

  function resolve(caseData) {
    if (window.RecordPathEligibilityEngine && typeof window.RecordPathEligibilityEngine.resolveEligibilityForCase === "function") {
      return window.RecordPathEligibilityEngine.resolveEligibilityForCase(caseData || {});
    }
    return { eligibilityStatus: "needs_review", estimatedEligibleDate: "", reasons: ["Central eligibility engine is not loaded."], missingRequirements: ["Eligibility engine"], disqualifyingReasons: [], confidence: "needs_review", confidenceReason: "Central eligibility engine is not loaded." };
  }

  function calculateEligibilityDate(caseData) {
    return resolve(caseData).estimatedEligibleDate || "";
  }

  function getMissingRequirements(caseData) {
    return resolve(caseData).missingRequirements || [];
  }

  function getRiskFlags(caseData) {
    return resolve(caseData).disqualifyingReasons || [];
  }

  function calculateCaseStatus(caseData) {
    var result = resolve(caseData);
    if (result.eligibilityStatus === "likely_eligible") return STATUS.ELIGIBLE_NOW;
    if (result.eligibilityStatus === "not_yet_eligible") return STATUS.ELIGIBLE_FUTURE;
    if (result.eligibilityStatus === "not_eligible" || result.eligibilityStatus === "disqualified") return STATUS.LIKELY_INELIGIBLE;
    return STATUS.MORE_INFO;
  }

  function calculateEligibilityConfidence(caseData) {
    var result = resolve(caseData);
    return { level: result.confidence || "needs_review", reason: result.confidenceReason || "RecordPathAI provides an estimate based on the information entered and available rules." };
  }

  function getRecommendedStatus(caseData) {
    var result = resolve(caseData);
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
    resolveEligibilityForCase: resolve,
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
