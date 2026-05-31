(function (root) {
  "use strict";
  var utils = root.RecordPathRuleDateUtils;
  var LEGAL_DISCLAIMER = "RecordPathAI is not a law firm and does not provide legal advice. Eligibility results are estimates based on the information entered and available rules.";

  function isYes(value) { var text = utils.compact(value); return value === true || ["yes", "true", "1", "y"].indexOf(text) !== -1; }
  function asArray(value) { return Array.isArray(value) ? value : (value ? [value] : []); }
  function firstValue(source, keys) { return utils.firstValue(source || {}, keys); }
  function collectCharges(input) {
    var charges = Array.isArray(input.charges) ? input.charges : [];
    if (!charges.length && (input.charge || input.offense || input.offenseCode || input.offenseLevel || input.level || input.degree)) charges = [input];
    return charges.map(function (charge) {
      charge = charge || {};
      return {
        chargeName: firstValue(charge, ["chargeName", "charge_name", "offense", "offense_name", "charge"]),
        offenseCode: firstValue(charge, ["offenseCode", "offense_code", "statuteCode", "statute_code", "charge_code"]),
        offenseLevel: utils.normalizeOffenseLevel(firstValue(charge, ["offenseLevel", "offense_level", "level", "degree", "chargeLevel", "charge_level", "offense_classification"])),
        disposition: utils.normalizeOutcome(firstValue(charge, ["disposition", "final_disposition", "outcome"]) || input.disposition || input.outcome),
        pendingCharges: isYes(charge.pendingCharges || charge.pending_charges),
        flags: charge
      };
    });
  }
  function normalizeCase(input) {
    input = input || {};
    var court = input.court || {};
    var outcome = input.outcome && typeof input.outcome === "object" ? input.outcome : {};
    var firstCharge = (Array.isArray(input.charges) && input.charges[0]) || {};
    var normalized = {
      caseId: firstValue(input, ["caseId", "case_id", "id"]) || firstValue(court, ["caseNumber", "case_number"]),
      caseState: utils.normalizeState(firstValue(input, ["caseState", "case_state", "state"]) || firstValue(court, ["caseState", "case_state", "state"])),
      county: utils.normalizeCounty(firstValue(input, ["county", "caseCounty", "court_county"]) || firstValue(court, ["county", "caseCounty", "court_county"])),
      city: firstValue(input, ["city"]) || firstValue(court, ["city"]),
      courtName: firstValue(input, ["courtName", "court_name", "court"]) || firstValue(court, ["courtName", "court_name", "name", "court"]),
      courtType: utils.normalizeCourtType(firstValue(input, ["courtType", "court_type"]) || firstValue(court, ["courtType", "court_type", "case_type"])),
      courtSlug: firstValue(input, ["courtSlug", "court_slug", "court_id"]),
      reliefType: utils.normalizeReliefType(firstValue(input, ["reliefType", "relief_type"]) || firstValue(input.eligibility || {}, ["relief_type", "filing_type"]) || "conviction_sealing"),
      charges: collectCharges(input),
      disposition: utils.normalizeOutcome(firstValue(input, ["disposition", "final_disposition"]) || (typeof input.outcome === "string" ? input.outcome : "") || firstValue(outcome, ["outcome", "disposition"]) || firstValue(firstCharge, ["final_disposition", "disposition", "outcome"])),
      dispositionDate: utils.toIsoDate(firstValue(input, ["dispositionDate", "disposition_date"]) || firstValue(outcome, ["dispositionDate", "disposition_date"])),
      sentenceCompletionDate: utils.toIsoDate(firstValue(input, ["sentenceCompletionDate", "sentence_completion_date"]) || firstValue(outcome, ["sentenceCompletionDate", "sentence_completion_date"]) || firstValue(firstCharge, ["sentenceCompletionDate", "sentence_completion_date"])),
      probationCompletedDate: utils.toIsoDate(firstValue(input, ["probationCompletedDate", "probation_completed_date"]) || firstValue(outcome, ["probationCompletedDate", "probation_completed_date"]) || firstValue(firstCharge, ["probationCompletedDate", "probation_completed_date", "probation_end_date", "probationEndDate"])),
      dischargeDate: utils.toIsoDate(firstValue(input, ["dischargeDate", "discharge_date"]) || firstValue(outcome, ["dischargeDate", "discharge_date"]) || firstValue(firstCharge, ["dischargeDate", "discharge_date"])),
      finalDischargeDate: utils.toIsoDate(firstValue(input, ["finalDischargeDate", "final_discharge_date"]) || firstValue(outcome, ["finalDischargeDate", "final_discharge_date"]) || firstValue(firstCharge, ["finalDischargeDate", "final_discharge_date"])),
      completionDate: utils.toIsoDate(firstValue(input, ["completionDate", "completion_date"]) || firstValue(outcome, ["completionDate", "completion_date", "caseClosedDate", "case_closed_date"]) || firstValue(firstCharge, ["completionDate", "completion_date", "caseClosedDate", "case_closed_date"])),
      pendingCharges: isYes(input.pendingCharges || input.pending_charges || firstValue(input.eligibility || {}, ["has_pending_cases"])) || isYes(firstCharge.pending_charges),
      disqualifyingFlags: Object.assign({}, input.disqualifyingFlags || input.disqualifying_flags || {}, input.eligibility || {})
    };
    if (!normalized.disposition && normalized.charges[0]) normalized.disposition = normalized.charges[0].disposition;
    return normalized;
  }
  function hasFlag(flags, keys) { return keys.some(function (key) { return isYes(flags[key]); }); }
  function highestChargeLevel(charges) { return (charges || []).map(function (c) { return c.offenseLevel; }).find(Boolean) || ""; }
  function evaluateOhioConvictionSealing(normalized, courtProfile, ruleSet) {
    var reasons = [];
    var missing = [];
    var disqualifying = [];
    var flags = normalized.disqualifyingFlags || {};
    var level = highestChargeLevel(normalized.charges);
    var dateUsed = utils.getFirstDate(normalized, ruleSet.date_source_priority);
    var disposition = normalized.disposition;
    if (!disposition) missing.push("Case outcome/disposition");
    if (disposition && disposition !== "convicted") missing.push("Unclear outcome for conviction sealing; enter a convicted/guilty disposition or choose the correct relief type.");
    if (!dateUsed.value) missing.push("Final completion/discharge date");
    if (!level) missing.push("Offense level");
    if (normalized.pendingCharges || hasFlag(flags, ["pendingCriminalProceedings", "pending_criminal_proceedings", "has_pending_cases"])) disqualifying.push("Pending criminal proceedings must be resolved before filing.");
    if (level === "F1" || hasFlag(flags, ["f1Conviction", "f1_conviction"])) disqualifying.push("F1 conviction is excluded from this sealing estimate.");
    if (level === "F2" || hasFlag(flags, ["f2Conviction", "f2_conviction"])) disqualifying.push("F2 conviction is excluded from this sealing estimate.");
    var f3Count = Number(flags.f3FelonyCount || flags.f3_felony_count || flags.totalF3 || flags.total_f3 || 0);
    if (level === "F3" && f3Count >= 3) disqualifying.push("Three or more F3 felony convictions require review and are not treated as eligible by this rule.");
    if (hasFlag(flags, ["felonyOffenseOfViolence", "felony_offense_of_violence", "felony_violence_offense"])) disqualifying.push("Felony offense of violence flag requires review.");
    if (hasFlag(flags, ["sexOffense", "sex_offense", "sexOffenseRegistry", "sex_offense_registry", "registration_offense"])) disqualifying.push("Sex offense or registration offense flag requires review.");
    if (hasFlag(flags, ["victimUnder13", "victim_under_13"])) disqualifying.push("Victim under 13 flag requires review unless a statutory exception applies.");
    if (hasFlag(flags, ["domesticViolence", "domestic_violence", "domesticViolenceM1M2", "domestic_violence_m1_m2"])) disqualifying.push("Domestic violence M1/M2 or similar municipal offense requires review.");
    if (hasFlag(flags, ["trafficOffense", "traffic_offense", "isTraffic", "excluded_traffic_offense"])) disqualifying.push("Excluded traffic offense flag requires review.");
    if (hasFlag(flags, ["publicOfficeTheft", "public_office_theft", "public_office_theft_offense"])) disqualifying.push("Public-office theft offense is excluded from this estimate.");
    var period = ruleSet.waiting_periods[level] || (level && level.charAt(0) === "M" ? ruleSet.waiting_periods.M : null);
    if (!period && level && ["F1", "F2"].indexOf(level) === -1) missing.push("Mapped waiting period for offense level " + level);
    var eligibleDate = dateUsed.value && period ? utils.addPeriod(dateUsed.value, period) : "";
    var days = utils.daysUntil(eligibleDate);
    var status = "needs_review";
    var likelyEligible = false;
    if (disqualifying.length) status = "not_eligible";
    else if (missing.length) status = "needs_review";
    else if (days !== null && days <= 0) { status = "likely_eligible"; likelyEligible = true; }
    else if (days !== null) status = "not_yet_eligible";
    if (likelyEligible) reasons.push("Based on the court, charge level, outcome, and final discharge date entered, your waiting period appears satisfied.");
    else if (status === "not_yet_eligible") reasons.push("The required waiting period has not ended yet.");
    else if (disqualifying.length) reasons.push("One or more disqualifying or blocking flags were found.");
    else reasons.push("Additional information is needed before relying on this estimate.");
    if (courtProfile && courtProfile.local_requirements_complete === false) reasons.push("We found the statewide eligibility rule, but local filing requirements may still need review.");
    reasons.push(LEGAL_DISCLAIMER);
    return { eligibilityStatus: status, likelyEligible: likelyEligible, requiredWaitingPeriod: period || null, requiredWaitingPeriodLabel: period ? period.label : "", dateUsedForCalculation: dateUsed.value, dateUsedForCalculationField: dateUsed.key, estimatedEligibleDate: eligibleDate, reasons: reasons, missingRequirements: missing, disqualifyingReasons: disqualifying, confidence: status === "likely_eligible" && courtProfile ? "high" : (status === "needs_review" ? "needs_review" : "medium"), confidenceReason: courtProfile ? "Court profile, statewide rule set, charge level, outcome, and final discharge fields were evaluated by the centralized rule engine." : "Statewide rule fallback was used; local court procedure should be reviewed." };
  }
  function needsReviewResult(normalized, reason) { var displayReason = reason === "No court-specific rule profile is available yet." ? "We do not have a court-specific rule profile for this court yet. You can still save your case, but eligibility should be reviewed before relying on this estimate." : reason; return { normalizedCase: normalized, courtProfile: null, ruleSet: null, reliefType: normalized.reliefType, eligibilityStatus: "needs_review", likelyEligible: false, requiredWaitingPeriod: null, requiredWaitingPeriodLabel: "", dateUsedForCalculation: "", estimatedEligibleDate: "", reasons: [displayReason, LEGAL_DISCLAIMER], missingRequirements: ["Court-specific rule profile"], disqualifyingReasons: [], confidence: "needs_review", confidenceReason: displayReason, packetTemplate: null, filingInstructions: "", recordWatchReminderDate: "" }; }
  function resolveEligibilityForCase(input) {
    var normalized = normalizeCase(input);
    var court = root.RecordPathCourtRegistry && root.RecordPathCourtRegistry.resolveCourt({ state: normalized.caseState, county: normalized.county, city: normalized.city, courtName: normalized.courtName || normalized.courtSlug, courtType: normalized.courtType, court_id: normalized.courtSlug });
    if (!court) return needsReviewResult(normalized, "No court-specific rule profile is available yet.");
    var profile = root.RecordPathCourtProfiles && root.RecordPathCourtProfiles[court.local_profile_id];
    var ruleSet = root.RecordPathStateRules && root.RecordPathStateRules[court.rule_set_id];
    if (!profile || !ruleSet) return needsReviewResult(normalized, "No court-specific rule profile is available yet.");
    if (court.supported_relief_types.indexOf(normalized.reliefType) === -1) return needsReviewResult(normalized, "This court profile does not yet support the selected relief type.");
    var evaluation = ruleSet.rule_set_id === "ohio_conviction_sealing_2953_32" ? evaluateOhioConvictionSealing(normalized, profile, ruleSet) : needsReviewResult(normalized, "No statewide rule evaluator is available yet.");
    return Object.assign({ normalizedCase: normalized, courtProfile: Object.assign({}, court, profile), ruleSet: ruleSet, reliefType: normalized.reliefType, packetTemplate: { packet_template_id: profile.packet_template_id, packet_name: profile.packet_name, source_pdf: profile.source_pdf, mapping_json: profile.mapping_json, required_attachments: profile.required_attachments || [] }, filingInstructions: profile.filing_instructions || "", recordWatchReminderDate: evaluation.estimatedEligibleDate || "" }, evaluation);
  }
  root.RecordPathRuleResolver = { normalizeCase: normalizeCase, resolveEligibilityForCase: resolveEligibilityForCase, legalDisclaimer: LEGAL_DISCLAIMER };
}(typeof window !== "undefined" ? window : globalThis));
