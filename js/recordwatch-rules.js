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

  // These are MVP placeholder calculations and must be verified against current state and county law before production use.
  var stateRules = {
    Ohio: { dismissedMonths: 0, misdemeanorMonths: 12, felonyMonths: 36, diversionMonths: 12 },
    Nevada: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 84, diversionMonths: 12 },
    California: { dismissedMonths: 0, misdemeanorMonths: 12, felonyMonths: 48, diversionMonths: 12 },
    Arizona: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 },
    Texas: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 },
    Florida: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 },
    generic: { dismissedMonths: 0, misdemeanorMonths: 24, felonyMonths: 60, diversionMonths: 12 }
  };

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getState(caseData) {
    return (caseData && caseData.court && caseData.court.caseState) ||
      (caseData && caseData.arrest && caseData.arrest.arrestState) ||
      (caseData && caseData.personal && caseData.personal.residenceState) || "";
  }

  function getRules(caseData) {
    var state = getState(caseData);
    return stateRules[state] || stateRules[toTitleCase(state)] || stateRules.generic;
  }

  function toTitleCase(value) {
    return String(value || "").toLowerCase().replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function getOutcome(caseData) {
    return normalize(caseData && caseData.outcome && caseData.outcome.outcome);
  }

  function getCharges(caseData) {
    return Array.isArray(caseData && caseData.charges) ? caseData.charges : [];
  }

  function isYes(value) {
    return normalize(value) === "yes" || value === true;
  }

  function hasFelony(caseData) {
    return getCharges(caseData).some(function (charge) {
      return normalize(charge.chargeLevel) === "felony" || normalize(charge.degree).charAt(0) === "f";
    });
  }

  function hasMisdemeanor(caseData) {
    return getCharges(caseData).some(function (charge) {
      var level = normalize(charge.chargeLevel);
      var degree = normalize(charge.degree);
      return level === "misdemeanor" || level === "minor misdemeanor" || degree.charAt(0) === "m";
    });
  }

  function getAnchorDate(caseData) {
    var outcome = (caseData && caseData.outcome) || {};
    return outcome.finalDischargeDate || outcome.caseClosedDate || outcome.dispositionDate || "";
  }

  function addMonths(dateString, months) {
    if (!dateString && months !== 0) return "";
    var date = dateString ? new Date(dateString + "T00:00:00") : new Date();
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  function calculateEligibilityDate(caseData) {
    var outcome = getOutcome(caseData);
    if (outcome === "pending" || outcome === "sealed" || outcome === "expunged") return "";

    var anchor = getAnchorDate(caseData);
    if (!anchor) return "";

    var rules = getRules(caseData);
    var months = rules.misdemeanorMonths;
    if (["dismissed", "not guilty", "acquitted", "no bill", "pardon", "set aside"].indexOf(outcome) !== -1) {
      months = rules.dismissedMonths;
    } else if (outcome === "diversion / intervention") {
      months = rules.diversionMonths;
    } else if (hasFelony(caseData)) {
      months = rules.felonyMonths;
    } else if (hasMisdemeanor(caseData)) {
      months = rules.misdemeanorMonths;
    }
    return addMonths(anchor, months);
  }

  function getMissingRequirements(caseData) {
    var missing = [];
    var outcome = (caseData && caseData.outcome) || {};
    var sentencing = (caseData && caseData.sentencing) || {};

    if (!outcome.outcome) missing.push("Case outcome/disposition");
    if (!["pending", "sealed", "expunged"].includes(getOutcome(caseData)) && !getAnchorDate(caseData)) {
      missing.push("Disposition, case closed, or final discharge date");
    }
    if (!caseData || !caseData.court || !caseData.court.caseNumber) missing.push("Case number");
    if (!caseData || !caseData.court || !caseData.court.courtName) missing.push("Court name");
    if (!getCharges(caseData).length || !getCharges(caseData)[0].chargeName) missing.push("Charge information");

    [
      ["Court costs paid", sentencing.courtCostsPaid],
      ["Fines paid", sentencing.finesPaid],
      ["Restitution paid", sentencing.restitutionPaid]
    ].forEach(function (item) {
      if (!item[1] || normalize(item[1]) === "no" || normalize(item[1]) === "unknown") {
        missing.push(item[0]);
      }
    });

    return missing;
  }

  function getRiskFlags(caseData) {
    var flags = [];
    getCharges(caseData).forEach(function (charge, index) {
      var prefix = charge.chargeName || "Charge " + (index + 1);
      if (isYes(charge.violentOffense)) flags.push(prefix + ": violent offense flag");
      if (isYes(charge.sexOffense)) flags.push(prefix + ": sex offense flag");
      if (isYes(charge.domesticViolence)) flags.push(prefix + ": domestic violence flag");
    });
    return flags;
  }

  function calculateCaseStatus(caseData) {
    var outcome = getOutcome(caseData);
    if (outcome === "pending") return STATUS.PENDING;
    if (outcome === "sealed" || outcome === "expunged") return STATUS.ALREADY_RELIEVED;

    var riskFlags = getRiskFlags(caseData);
    if (riskFlags.some(function (flag) { return flag.indexOf("sex offense") !== -1; })) {
      return STATUS.LIKELY_INELIGIBLE;
    }

    var eligibilityDate = calculateEligibilityDate(caseData);
    if (!eligibilityDate) return STATUS.MORE_INFO;

    var delta = daysUntil(eligibilityDate);
    if (delta <= 0) return STATUS.ELIGIBLE_NOW;
    return STATUS.ELIGIBLE_FUTURE;
  }


  function calculateEligibilityConfidence(caseData) {
    var missing = getMissingRequirements(caseData);
    var risks = getRiskFlags(caseData);
    var outcome = getOutcome(caseData);
    var hasDate = Boolean(calculateEligibilityDate(caseData));
    var charges = getCharges(caseData);
    var hasState = Boolean(getState(caseData));
    var hasChargeLevel = charges.some(function (charge) { return charge.chargeLevel || charge.degree; });
    if (!hasDate || outcome === "pending" || !outcome || risks.length || missing.some(function (item) { return /date|outcome|disposition|paid/i.test(item); })) {
      return { level: "needs_review", reason: "Missing key dates, unclear disposition, pending status, completion details, or disqualifying flags require review before relying on this estimate." };
    }
    if (hasState && hasChargeLevel && !missing.length && !risks.length) {
      return { level: "high", reason: "Required dates, case state, charge level, outcome, and completion fields are present with no disqualifying flags detected." };
    }
    return { level: "medium", reason: "There is enough information to estimate a date, but optional court, payment, or case details should still be verified." };
  }

  function getRecommendedStatus(caseData) {
    var status = calculateCaseStatus(caseData);
    var missing = getMissingRequirements(caseData);
    var risks = getRiskFlags(caseData);

    if (status === STATUS.PENDING) return "Wait for disposition and update the case outcome.";
    if (status === STATUS.ALREADY_RELIEVED) return "Monitor background-check and data-broker records for correction.";
    if (risks.length) return "Review risk flags before filing and consider legal review.";
    if (missing.length) return "Gather missing requirements before relying on the eligibility estimate.";
    if (status === STATUS.ELIGIBLE_NOW) return "Prepare a court packet and verify local filing rules.";
    if (status === STATUS.ELIGIBLE_FUTURE) return "Track requirements and wait until the estimated eligibility date.";
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
    stateRules: stateRules,
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
