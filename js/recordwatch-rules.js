(function () {
  "use strict";

  const STATUS = {
    ELIGIBLE_NOW: "Eligible now",
    ELIGIBLE_FUTURE: "Eligible on future date",
    LIKELY_INELIGIBLE: "Likely ineligible",
    MORE_INFO: "More information needed",
    PENDING: "Pending case",
    ALREADY_RELIEVED: "Already sealed/expunged"
  };

  // These are MVP placeholder calculations and must be verified against current state and county law before production use.
  // The structure is intentionally configurable so real state rules, court APIs, repositories, and e-filing logic can replace it later.
  const stateRules = {
    generic: { dismissalMonths: 1, misdemeanorMonths: 12, felonyMonths: 36, diversionMonths: 12, pardonMonths: 0 },
    ohio: { dismissalMonths: 1, misdemeanorMonths: 12, felonyMonths: 36, diversionMonths: 12, pardonMonths: 0 },
    nevada: { dismissalMonths: 1, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12, pardonMonths: 0 },
    california: { dismissalMonths: 1, misdemeanorMonths: 12, felonyMonths: 48, diversionMonths: 12, pardonMonths: 0 },
    arizona: { dismissalMonths: 1, misdemeanorMonths: 24, felonyMonths: 48, diversionMonths: 12, pardonMonths: 0 },
    texas: { dismissalMonths: 1, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12, pardonMonths: 0 },
    florida: { dismissalMonths: 1, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12, pardonMonths: 0 }
  };

  const dismissalOutcomes = ["dismissed", "not guilty", "acquitted", "no bill"];
  const relievedOutcomes = ["sealed", "expunged"];
  const convictionOutcomes = ["convicted", "plea", "set aside"];
  const diversionOutcomes = ["diversion / intervention", "diversion", "intervention"];

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getRules(caseData) {
    const state = normalize(caseData?.court?.caseState || caseData?.courtInfo?.caseState || caseData?.caseState || caseData?.state);
    return stateRules[state] || stateRules.generic;
  }

  function getOutcome(caseData) {
    return normalize(caseData?.outcome?.outcome || caseData?.outcomeInfo?.outcome || caseData?.outcome);
  }

  function getCharges(caseData) {
    return Array.isArray(caseData?.charges) ? caseData.charges : [];
  }

  function hasChargeFlag(caseData, key) {
    return getCharges(caseData).some((charge) => normalize(charge?.[key]) === "yes" || charge?.[key] === true);
  }

  function isFelony(caseData) {
    return getCharges(caseData).some((charge) => normalize(charge.chargeLevel) === "felony" || normalize(charge.degree).startsWith("f"));
  }

  function isMisdemeanor(caseData) {
    return getCharges(caseData).some((charge) => {
      const level = normalize(charge.chargeLevel);
      const degree = normalize(charge.degree);
      return level.includes("misdemeanor") || degree === "mm" || degree.startsWith("m");
    });
  }

  function getAnchorDate(caseData) {
    const outcome = caseData?.outcome || caseData?.outcomeInfo || {};
    return outcome.finalDischargeDate || outcome.caseClosedDate || outcome.dispositionDate || "";
  }

  function addMonths(dateString, months) {
    const date = parseLocalDate(dateString);
    if (!date) return "";
    date.setMonth(date.getMonth() + months);
    return toISODate(date);
  }

  function parseLocalDate(dateString) {
    if (!dateString) return null;
    const parts = String(dateString).split("-").map(Number);
    if (parts.length === 3 && parts.every(Boolean)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const parsed = new Date(dateString);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function toISODate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function calculateEligibilityDate(caseData) {
    const outcome = getOutcome(caseData);
    if (!outcome || outcome === "pending" || relievedOutcomes.includes(outcome)) return "";

    const anchorDate = getAnchorDate(caseData);
    if (!anchorDate) return "";

    const rules = getRules(caseData);
    if (dismissalOutcomes.includes(outcome)) return addMonths(anchorDate, rules.dismissalMonths);
    if (diversionOutcomes.includes(outcome)) return addMonths(anchorDate, rules.diversionMonths);
    if (outcome === "pardon") return addMonths(anchorDate, rules.pardonMonths);
    if (convictionOutcomes.includes(outcome) && isFelony(caseData)) return addMonths(anchorDate, rules.felonyMonths);
    if (convictionOutcomes.includes(outcome) && isMisdemeanor(caseData)) return addMonths(anchorDate, rules.misdemeanorMonths);
    if (convictionOutcomes.includes(outcome)) return addMonths(anchorDate, rules.misdemeanorMonths);

    return addMonths(anchorDate, rules.misdemeanorMonths);
  }

  function getMissingRequirements(caseData) {
    const missing = [];
    const outcome = caseData?.outcome || caseData?.outcomeInfo || {};
    const sentencing = caseData?.sentencing || caseData?.sentencingInfo || {};

    if (!getOutcome(caseData)) missing.push("Case outcome/disposition");
    if (!getAnchorDate(caseData) && getOutcome(caseData) !== "pending" && !relievedOutcomes.includes(getOutcome(caseData))) {
      missing.push("Disposition, case closed, or final discharge date");
    }
    if (!caseData?.court?.caseNumber && !caseData?.courtInfo?.caseNumber && !caseData?.caseNumber) missing.push("Case number");
    if (!caseData?.court?.courtName && !caseData?.courtInfo?.courtName && !caseData?.court) missing.push("Court name");
    if (!getCharges(caseData).length) missing.push("Charge details");

    const courtCostsPaid = normalize(sentencing.courtCostsPaid || outcome.courtCostsPaid);
    const finesPaid = normalize(sentencing.finesPaid || outcome.finesPaid);
    const restitutionPaid = normalize(sentencing.restitutionPaid || outcome.restitutionPaid);

    if (!courtCostsPaid || courtCostsPaid === "unknown" || courtCostsPaid === "no") missing.push("Confirm court costs are paid or not required");
    if (!finesPaid || finesPaid === "unknown" || finesPaid === "no") missing.push("Confirm fines are paid or not required");
    if (!restitutionPaid || restitutionPaid === "unknown" || restitutionPaid === "no") missing.push("Confirm restitution is paid or not required");

    return missing;
  }

  function getRiskFlags(caseData) {
    const flags = [];
    if (hasChargeFlag(caseData, "violentOffense")) flags.push("Violent offense flag requires legal review");
    if (hasChargeFlag(caseData, "sexOffense")) flags.push("Sex offense flag requires legal review");
    if (hasChargeFlag(caseData, "domesticViolence")) flags.push("Domestic violence related flag requires legal review");
    if (hasChargeFlag(caseData, "trafficOffense")) flags.push("Traffic offense may have special rules");
    return flags;
  }

  function calculateCaseStatus(caseData) {
    const outcome = getOutcome(caseData);
    if (outcome === "pending") return STATUS.PENDING;
    if (relievedOutcomes.includes(outcome)) return STATUS.ALREADY_RELIEVED;
    if (getRiskFlags(caseData).some((flag) => flag.includes("requires legal review"))) return STATUS.LIKELY_INELIGIBLE;
    if (!getAnchorDate(caseData)) return STATUS.MORE_INFO;

    const eligibilityDate = calculateEligibilityDate(caseData);
    if (!eligibilityDate) return STATUS.MORE_INFO;
    return daysUntil(eligibilityDate) <= 0 ? STATUS.ELIGIBLE_NOW : STATUS.ELIGIBLE_FUTURE;
  }

  function getRecommendedStatus(caseData) {
    const status = calculateCaseStatus(caseData);
    const missing = getMissingRequirements(caseData);
    const risks = getRiskFlags(caseData);
    const eligibilityDate = calculateEligibilityDate(caseData);

    if (status === STATUS.PENDING) return "Wait for disposition and update the case outcome.";
    if (risks.length) return "Review risk flags with a qualified legal professional before filing.";
    if (missing.length) return "Gather missing information and confirm payment/completion requirements.";
    if (status === STATUS.ELIGIBLE_NOW) return "Prepare a court packet and verify current local filing requirements.";
    if (status === STATUS.ELIGIBLE_FUTURE) return `Track requirements and wait until ${formatDate(eligibilityDate)}.`;
    if (status === STATUS.ALREADY_RELIEVED) return "Monitor courts, repositories, background checks, and data brokers for corrected records.";
    return "Collect more case details before estimating eligibility.";
  }

  function daysUntil(dateString) {
    const target = parseLocalDate(dateString);
    if (!target) return null;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.ceil((target.getTime() - start.getTime()) / 86400000);
  }

  function formatDate(dateString) {
    const date = parseLocalDate(dateString);
    if (!date) return "Not available";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  window.RecordWatchRules = {
    STATUS,
    stateRules,
    calculateCaseStatus,
    calculateEligibilityDate,
    getMissingRequirements,
    getRiskFlags,
    getRecommendedStatus,
    daysUntil,
    formatDate
  };
})();
