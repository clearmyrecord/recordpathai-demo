(function () {
  "use strict";
  function normalize(value) { return String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-"); }
  function resolveStateRule(caseData) {
    var court = caseData && caseData.court || {};
    var raw = normalize(court.caseState || caseData.caseState || court.state || caseData.state);
    var rules = window.RecordPathStateRules || {};
    return Object.keys(rules).map(function (key) { return rules[key]; }).find(function (rule) {
      return (rule.aliases || []).map(normalize).indexOf(raw) !== -1 || normalize(rule.id) === raw;
    }) || { id: raw || "generic", defaultWaitingMonths: 24, waitingMonths: { dismissed: 0, misdemeanor: 24, felony: 60, diversion: 12 } };
  }
  function resolve(caseData) {
    return { stateRule: resolveStateRule(caseData), courtProfile: window.RecordPathCourtRegistry ? RecordPathCourtRegistry.findProfile(caseData) : null };
  }
  window.RecordPathRuleResolver = { resolveStateRule: resolveStateRule, resolve: resolve };
}());
