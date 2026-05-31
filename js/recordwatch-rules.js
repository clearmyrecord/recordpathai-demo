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

  function firstValue(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  }

  function getCompletionDateResult(caseData) {
    var outcome = (caseData && caseData.outcome) || {};
    var sentencing = (caseData && caseData.sentencing) || {};
    var charges = getCharges(caseData);
    var charge = charges[0] || {};
    var scopes = [caseData || {}, outcome, sentencing, charge];
    var priority = [
      { key: "sentence_completion_date", label: "sentence_completion_date", aliases: ["sentence_completion_date", "sentenceCompletionDate"] },
      { key: "probation_completed_date", label: "probation_completed_date", aliases: ["probation_completed_date", "probationCompletedDate", "probation_end_date", "probationEndDate"] },
      { key: "discharge_date", label: "discharge_date", aliases: ["discharge_date", "dischargeDate"] },
      { key: "completion_date", label: "completion_date", aliases: ["completion_date", "completionDate"] },
      { key: "final_discharge_date", label: "final_discharge_date", aliases: ["final_discharge_date", "finalDischargeDate"] }
    ];

    for (var i = 0; i < priority.length; i += 1) {
      for (var j = 0; j < scopes.length; j += 1) {
        var value = firstValue(scopes[j], priority[i].aliases);
        if (value) return { date: value, field: priority[i].label };
      }
    }

    var fallback = firstValue(outcome, ["dispositionDate", "disposition_date"]);
    if (fallback) return { date: fallback, field: "disposition_date_fallback" };
    return { date: "", field: "" };
  }

  function getAnchorDate(caseData) {
    return getCompletionDateResult(caseData).date;
  }

  function addMonths(dateString, months) {
    if (!dateString && months !== 0) return "";
    var date = dateString ? new Date(dateString + "T00:00:00") : new Date();
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  function getPacketCompatibleWaitingMonths(caseData) {
    var outcome = getOutcome(caseData);
    var charges = getCharges(caseData);
    var charge = charges[0] || {};
    var state = normalize(getState(caseData));
    var levelRaw = normalize(charge.chargeLevel || charge.degree || charge.level || charge.offense_classification).toUpperCase();
    var chargeText = normalize((charge.chargeName || charge.offense_name || charge.offense || "") + " " + (charge.statuteCode || charge.charge_code || charge.offenseCode || ""));

    if (["dismissed", "not guilty", "acquitted", "no bill", "pardon", "set aside"].indexOf(outcome) !== -1) return 0;
    if (outcome === "diversion / intervention") return 12;
    if (state === "ohio" || state === "oh") {
      if (/2921\.43/.test(chargeText) || /soliciting improper compensation/.test(chargeText)) return 84;
      if (/\bF3\b/.test(levelRaw)) return 36;
      return 12;
    }

    var rules = getRules(caseData);
    if (hasFelony(caseData)) return rules.felonyMonths;
    if (hasMisdemeanor(caseData)) return rules.misdemeanorMonths;
    return rules.misdemeanorMonths;
  }

  function formatWaitingPeriod(months) {
    if (months === 0) return "No waiting period";
    if (months % 12 === 0) return (months / 12) + " " + (months === 12 ? "year" : "years");
    return months + " months";
  }

  function calculateEligibilityResult(caseData) {
    var outcome = getOutcome(caseData);
    if (outcome === "pending" || outcome === "sealed" || outcome === "expunged") {
      return { estimatedEligibleDate: "", eligibilityDate: "", completionDate: "", completionDateField: "", waitingPeriodMonths: 0, waitingPeriodText: "Not applicable", source: "RecordWatchRules" };
    }

    if (window.RecordPathEligibilityEngine && typeof RecordPathEligibilityEngine.resolveEligibilityForCase === "function") {
      var centralized = RecordPathEligibilityEngine.resolveEligibilityForCase(caseData);
      if (centralized && (centralized.estimatedEligibleDate || centralized.waitingPeriodMonths !== null)) return centralized;
    }

    var completion = getCompletionDateResult(caseData);
    if (!completion.date) {
      return { estimatedEligibleDate: "", eligibilityDate: "", completionDate: "", completionDateField: "", waitingPeriodMonths: null, waitingPeriodText: "Not available", source: "RecordWatchRules" };
    }

    var months = getPacketCompatibleWaitingMonths(caseData);
    var date = addMonths(completion.date, months);
    return {
      estimatedEligibleDate: date,
      eligibilityDate: date,
      completionDate: completion.date,
      completionDateField: completion.field,
      waitingPeriodMonths: months,
      waitingPeriodYears: months % 12 === 0 ? months / 12 : null,
      waitingPeriodText: formatWaitingPeriod(months),
      source: "RecordWatchRules packet-compatible"
    };
  }

  function calculateEligibilityDate(caseData) {
    return calculateEligibilityResult(caseData).estimatedEligibleDate;
  }

  function getMissingRequirements(caseData) {
    var missing = [];
    var outcome = (caseData && caseData.outcome) || {};
    var sentencing = (caseData && caseData.sentencing) || {};

    if (!outcome.outcome) missing.push("Case outcome/disposition");
    if (!["pending", "sealed", "expunged"].includes(getOutcome(caseData)) && !getAnchorDate(caseData)) {
      missing.push("Sentence completion, probation completion, discharge, or final completion date");
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
