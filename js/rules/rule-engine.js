(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./date-utils"), require("./rule-resolver"));
  } else {
    root.RecordPathEligibilityEngine = factory(root.RecordPathRuleDateUtils, root.RecordPathRuleResolver);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function (dateUtils, ruleResolver) {
  "use strict";

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function lower(value) { return clean(value).toLowerCase(); }
  function isYes(value) { return value === true || ["true", "yes", "y", "1"].indexOf(lower(value)) !== -1; }
  function firstValue(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && clean(value) !== "") return value;
    }
    return "";
  }

  function getCompletionDateResult(normalizedCase) {
    var charge = normalizedCase.primaryCharge || {};
    var outcomeObject = (normalizedCase.originalCaseData && normalizedCase.originalCaseData.outcome) || {};
    var sentencing = normalizedCase.sentencing || {};
    var sources = [charge, outcomeObject, sentencing, normalizedCase.originalCaseData || {}];
    var priority = [
      { label: "sentence_completion_date", aliases: ["sentenceCompletionDate", "sentence_completion_date"] },
      { label: "probation_completed_date", aliases: ["probationCompletedDate", "probation_completed_date", "probationEndDate", "probation_end_date"] },
      { label: "discharge_date", aliases: ["dischargeDate", "discharge_date"] },
      { label: "completion_date", aliases: ["completionDate", "completion_date"] },
      { label: "final_discharge_date", aliases: ["finalDischargeDate", "final_discharge_date"] },
      { label: "case_closed_date", aliases: ["caseClosedDate", "case_closed_date"] }
    ];

    for (var i = 0; i < priority.length; i += 1) {
      for (var j = 0; j < sources.length; j += 1) {
        var raw = firstValue(sources[j], priority[i].aliases);
        var iso = dateUtils.toIsoDate(raw);
        if (iso) return { date: iso, field: priority[i].label, raw: raw };
      }
    }

    var disposition = dateUtils.toIsoDate(charge.dispositionDate || firstValue(outcomeObject, ["dispositionDate", "disposition_date"]));
    if (disposition) return { date: disposition, field: "disposition_date_fallback", raw: disposition };
    return { date: "", field: "", raw: "" };
  }

  function getRiskFlags(normalizedCase) {
    var eligibility = normalizedCase.eligibility || {};
    var flags = [];
    (normalizedCase.charges || []).forEach(function (charge, index) {
      var prefix = charge.name || "Charge " + (index + 1);
      if (isYes(charge.violentOffense) || isYes(eligibility.felony_violence_offense)) flags.push(prefix + ": felony violence offense flag");
      if (isYes(charge.sexOffense) || isYes(eligibility.sex_offense_registry)) flags.push(prefix + ": sex offense registry flag");
      if (isYes(charge.domesticViolence)) flags.push(prefix + ": domestic violence flag");
      if (isYes(charge.trafficOffense) || /traffic/i.test(charge.name + " " + charge.statuteCode)) flags.push(prefix + ": traffic offense flag");
      if (isYes(charge.pendingCharges) || isYes(eligibility.has_pending_cases)) flags.push(prefix + ": pending charges flag");
    });
    return flags;
  }

  function getMissingRequirements(normalizedCase, completion) {
    var missing = [];
    var outcome = lower(normalizedCase.outcome);
    if (!outcome) missing.push("Case outcome/disposition");
    if (outcome !== "pending" && !completion.date) missing.push("Sentence completion, probation completion, discharge, or final completion date");
    if (!normalizedCase.court.caseNumber) missing.push("Case number");
    if (!normalizedCase.court.courtName) missing.push("Court name");
    if (!normalizedCase.charges.length || !normalizedCase.primaryCharge.name) missing.push("Charge information");
    return missing;
  }

  function statusFromResult(eligibilityDate, risks, missing, outcome) {
    if (outcome === "pending") return "Pending case";
    if (outcome === "sealed" || outcome === "expunged") return "Already sealed/expunged";
    if (risks.some(function (flag) { return /sex offense|violence|traffic|pending/i.test(flag); })) return "Likely ineligible";
    if (!eligibilityDate || missing.some(function (item) { return /date|outcome|disposition/i.test(item); })) return "More information needed";
    return dateUtils.daysUntil(eligibilityDate) <= 0 ? "Eligible now" : "Eligible on future date";
  }

  function resolveEligibilityForCase(caseData) {
    var resolved = ruleResolver.resolveRuleForCase(caseData || {});
    var normalized = resolved.normalizedCase;
    var rule = resolved.rule || {};
    var completion = getCompletionDateResult(normalized);
    var eligibilityDate = completion.date ? dateUtils.addMonths(completion.date, rule.waitingPeriodMonths || 0) : "";
    var risks = getRiskFlags(normalized);
    var missing = getMissingRequirements(normalized, completion);
    var outcome = lower(normalized.outcome);
    var status = statusFromResult(eligibilityDate, risks, missing, outcome);
    var needsReview = status === "More information needed" || status === "Likely ineligible";
    var days = dateUtils.daysUntil(eligibilityDate);

    return {
      status: status,
      statusLabel: status === "Eligible on future date" ? "Not yet eligible" : status,
      mode: status === "Eligible now" ? "eligible" : (status === "Eligible on future date" ? "not_eligible" : "unclear"),
      isEligibleNow: status === "Eligible now",
      isNotYetEligible: status === "Eligible on future date",
      needsReview: needsReview,
      estimatedEligibleDate: eligibilityDate,
      eligibilityDate: eligibilityDate,
      formattedEligibilityDate: dateUtils.formatDate(eligibilityDate),
      completionDate: completion.date,
      completionDateField: completion.field,
      waitingPeriodMonths: rule.waitingPeriodMonths,
      waitingPeriodYears: rule.waitingPeriodYears,
      waitingPeriodText: rule.waitingPeriodText,
      ruleCitation: rule.ruleCitation,
      reliefType: rule.reliefType,
      courtProfile: resolved.courtProfile,
      flags: risks.concat(missing),
      missingRequirements: missing,
      riskFlags: risks,
      confidence: missing.length || risks.length ? "needs_review" : "high",
      confidenceReason: missing.length || risks.length ? "Missing requirements or risk flags require review before relying on this estimate." : "Court, charge level, completion date, and state rule inputs were resolved by the centralized eligibility engine.",
      daysUntilEligible: days,
      source: "RecordPathEligibilityEngine.resolveEligibilityForCase"
    };
  }

  return { resolveEligibilityForCase: resolveEligibilityForCase, getCompletionDateResult: function (caseData) { return getCompletionDateResult(ruleResolver.normalizeCaseData(caseData || {})); } };
}));
