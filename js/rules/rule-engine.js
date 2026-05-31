(function (root) {
  "use strict";
  function resolveEligibilityForCase(caseData) { return root.RecordPathRuleResolver.resolveEligibilityForCase(caseData || {}); }
  function toStorageRecord(result, userId, caseId) {
    result = result || {};
    var profile = result.courtProfile || {};
    var rule = result.ruleSet || {};
    var packet = result.packetTemplate || {};
    return {
      case_id: caseId || (result.normalizedCase && result.normalizedCase.caseId) || "",
      user_id: userId || "",
      court_id: profile.court_id || "",
      rule_set_id: rule.rule_set_id || "",
      local_profile_id: profile.local_profile_id || "",
      relief_type: result.reliefType || "",
      eligibility_status: result.eligibilityStatus || "needs_review",
      eligibility_date: result.estimatedEligibleDate || "",
      eligibility_confidence: result.confidence || "needs_review",
      eligibility_reasons: result.reasons || [],
      required_waiting_period: result.requiredWaitingPeriodLabel || "",
      date_used_for_calculation: result.dateUsedForCalculation || "",
      packet_template_id: packet.packet_template_id || "",
      updated_at: new Date().toISOString()
    };
  }
  root.RecordPathEligibilityEngine = { resolveEligibilityForCase: resolveEligibilityForCase, toStorageRecord: toStorageRecord };
  root.resolveEligibilityForCase = resolveEligibilityForCase;
}(typeof window !== "undefined" ? window : globalThis));
