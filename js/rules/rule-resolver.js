(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./state-rules/ohio"), require("./state-rules/nevada"), require("./state-rules/north-carolina"), require("./court-registry"));
  } else {
    root.RecordPathRuleResolver = factory(
      root.RecordPathStateRules && root.RecordPathStateRules.ohio,
      root.RecordPathStateRules && root.RecordPathStateRules.nevada,
      root.RecordPathStateRules && root.RecordPathStateRules.northCarolina,
      root.RecordPathCourtRegistry
    );
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function (ohioRules, nevadaRules, northCarolinaRules, courtRegistry) {
  "use strict";

  var rulesByState = { oh: ohioRules, ohio: ohioRules, nv: nevadaRules, nevada: nevadaRules, nc: northCarolinaRules, "north carolina": northCarolinaRules };

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function lower(value) { return clean(value).toLowerCase().replace(/\s+/g, " "); }
  function firstValue(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && clean(value) !== "") return value;
    }
    return "";
  }

  function normalizeState(value) {
    var text = lower(value);
    var map = { ohio: "oh", oh: "oh", nevada: "nv", nv: "nv", "north carolina": "nc", nc: "nc" };
    return map[text] || text;
  }

  function getCharges(caseData) {
    if (Array.isArray(caseData && caseData.charges)) return caseData.charges;
    if (caseData && caseData.charge) return [caseData.charge];
    return [];
  }

  function normalizeCharge(charge) {
    charge = charge || {};
    return {
      name: firstValue(charge, ["chargeName", "charge_name", "offense_name", "offenseName", "offense", "charge"]),
      statuteCode: firstValue(charge, ["statuteCode", "offenseCode", "charge_code", "statute_citation", "code"]),
      offenseCode: firstValue(charge, ["offenseCode", "statuteCode", "charge_code", "statute_citation", "code"]),
      level: firstValue(charge, ["level", "degree", "chargeLevel", "charge_level", "offense_classification"]),
      degree: firstValue(charge, ["degree", "level", "chargeLevel", "charge_level"]),
      disposition: firstValue(charge, ["disposition", "final_disposition", "outcome"]),
      dispositionDate: firstValue(charge, ["dispositionDate", "disposition_date"]),
      sentenceCompletionDate: firstValue(charge, ["sentenceCompletionDate", "sentence_completion_date"]),
      probationCompletedDate: firstValue(charge, ["probationCompletedDate", "probation_completed_date", "probationEndDate", "probation_end_date"]),
      dischargeDate: firstValue(charge, ["dischargeDate", "discharge_date"]),
      completionDate: firstValue(charge, ["completionDate", "completion_date"]),
      finalDischargeDate: firstValue(charge, ["finalDischargeDate", "final_discharge_date"]),
      caseClosedDate: firstValue(charge, ["caseClosedDate", "case_closed_date"]),
      violentOffense: firstValue(charge, ["violentOffense", "isViolentOffense", "felony_violence_offense"]),
      sexOffense: firstValue(charge, ["sexOffense", "isSexOffense", "sex_offense_registry"]),
      domesticViolence: firstValue(charge, ["domesticViolence", "isDomesticViolenceConviction"]),
      trafficOffense: firstValue(charge, ["trafficOffense", "isTraffic"]),
      pendingCharges: firstValue(charge, ["pending_charges", "pendingCharges"])
    };
  }

  function normalizeCaseData(caseData) {
    caseData = caseData || {};
    var court = caseData.court || {};
    var outcome = caseData.outcome || {};
    var sentencing = caseData.sentencing || {};
    var eligibility = caseData.eligibility || {};
    var charges = getCharges(caseData).map(normalizeCharge);
    var primaryCharge = charges[0] || normalizeCharge({});
    var state = normalizeState(firstValue(court, ["caseState", "state"]) || firstValue(caseData, ["caseState", "state"]) || firstValue(eligibility, ["state_ruleset"]));
    var normalized = {
      id: caseData.id || caseData.caseId || firstValue(court, ["caseNumber", "case_number"]),
      court: {
        state: state,
        caseState: state,
        county: firstValue(court, ["county", "court_county"]),
        courtName: firstValue(court, ["courtName", "name", "court"]),
        name: firstValue(court, ["name", "courtName", "court"]),
        caseNumber: firstValue(court, ["caseNumber", "case_number"])
      },
      charges: charges,
      primaryCharge: primaryCharge,
      outcome: firstValue(outcome, ["outcome", "disposition", "final_disposition"]) || primaryCharge.disposition || firstValue(eligibility, ["disposition"]),
      sentencing: sentencing,
      eligibility: eligibility,
      originalCaseData: caseData
    };
    return normalized;
  }

  function resolveRuleForCase(caseData) {
    var normalized = normalizeCaseData(caseData);
    var profile = courtRegistry && courtRegistry.matchProfile ? courtRegistry.matchProfile(normalized) : null;
    var stateKey = normalized.court.state;
    var stateRules = rulesByState[stateKey] || rulesByState[lower(stateKey)];
    if (!stateRules || typeof stateRules.resolve !== "function") {
      stateRules = ohioRules;
    }
    var rule = stateRules.resolve(normalized);
    if (profile && profile.defaultRuleCitation) {
      rule.ruleCitation = profile.defaultRuleCitation;
    }
    return { normalizedCase: normalized, courtProfile: profile, rule: rule };
  }

  return { resolveRuleForCase: resolveRuleForCase, normalizeCaseData: normalizeCaseData, normalizeState: normalizeState };
}));
