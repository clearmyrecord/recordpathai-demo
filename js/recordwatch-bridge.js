(function () {
  "use strict";

  var PROFILE_KEY = "recordwatchProfile";
  var CASES_KEY = "recordwatchCases";
  var ACTIVE_CASE_KEY = "recordwatchActiveCaseId";

  function nowIso() { return new Date().toISOString(); }

  function readJSON(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function lower(value) { return clean(value).toLowerCase(); }
  function comparable(value) {
    var stateMap = { oh: "ohio", nv: "nevada", ca: "california", az: "arizona", tx: "texas", fl: "florida" };
    var normalized = lower(value).replace(/\s+/g, " ");
    return stateMap[normalized] || normalized;
  }

  function currentUserId(caseData) {
    if (window.RecordPathUserStore && RecordPathUserStore.getCurrentUser()) return RecordPathUserStore.getCurrentUser().id;
    return (caseData && caseData.personal && (caseData.personal.email || caseData.personal.fullName)) || localStorage.getItem("email") || "demo-user";
  }

  function firstValue(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i += 1) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && clean(value) !== "") return value;
    }
    return "";
  }

  function getElementValue(id) {
    var el = document.getElementById(id);
    if (!el) return "";
    return el.type === "checkbox" ? el.checked : clean(el.value);
  }

  function mergeDefined(target, source) {
    Object.keys(source || {}).forEach(function (key) {
      var value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
        mergeDefined(target[key], value);
        return;
      }
      if (value !== undefined && value !== null && clean(value) !== "") target[key] = value;
    });
    return target;
  }

  function normalizeLevel(level) {
    var value = clean(level).toUpperCase();
    if (!value) return "";
    if (value === "M" || value.indexOf("M") === 0 || value === "MM") return "Misdemeanor";
    if (value.indexOf("F") === 0) return "Felony";
    return clean(level);
  }

  function normalizeCase(caseData) {
    var now = nowIso();
    var normalized = caseData || {};
    normalized.id = normalized.id || "rw-case-" + Date.now();
    normalized.createdAt = normalized.createdAt || now;
    normalized.updatedAt = now;
    normalized.personal = normalized.personal || {};
    normalized.arrest = normalized.arrest || {};
    normalized.court = normalized.court || {};
    normalized.charges = Array.isArray(normalized.charges) ? normalized.charges : [];
    normalized.outcome = normalized.outcome || {};
    normalized.sentencing = normalized.sentencing || {};
    normalized.monitoring = normalized.monitoring || {};
    normalized.source = normalized.source || "RecordPathAI";
    return normalized;
  }

  function ensureRecordWatchDataShape() {
    var profile = readJSON(PROFILE_KEY, {});
    var cases = readJSON(CASES_KEY, []);
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) profile = {};
    if (!Array.isArray(cases)) cases = [];
    cases = cases.map(normalizeCase);
    writeJSON(PROFILE_KEY, profile);
    writeJSON(CASES_KEY, cases);
    return { profile: profile, cases: cases };
  }

  function saveProfileFromEligibility(formData) {
    var shape = ensureRecordWatchDataShape();
    var data = formData || {};
    var fullName = clean(firstValue(data, ["fullName", "full_name", "name"])) || [firstValue(data, ["firstName", "first_name"]), firstValue(data, ["lastName", "last_name"])].map(clean).filter(Boolean).join(" ");
    var profile = mergeDefined(shape.profile, {
      fullName: fullName,
      dateOfBirth: firstValue(data, ["dateOfBirth", "dob", "birthDate"]),
      email: firstValue(data, ["email"]),
      phone: firstValue(data, ["phone"]),
      residenceState: firstValue(data, ["residenceState", "residence_state", "state"]),
      updatedAt: nowIso()
    });
    return writeJSON(PROFILE_KEY, profile);
  }

  function caseMatchScore(existingCase, partialCase) {
    var a = normalizeCase(existingCase);
    var b = normalizeCase(partialCase);
    var aCharge = (a.charges || [])[0] || {};
    var bCharge = (b.charges || [])[0] || {};
    var fields = [
      [a.court.caseNumber, b.court.caseNumber],
      [a.court.courtName, b.court.courtName],
      [a.court.county, b.court.county],
      [a.court.caseState, b.court.caseState],
      [aCharge.chargeName, bCharge.chargeName]
    ];
    return fields.reduce(function (score, pair) {
      return score + (pair[0] && pair[1] && comparable(pair[0]) === comparable(pair[1]) ? 1 : 0);
    }, 0);
  }

  function findDuplicateIndex(cases, partialCase) {
    var partialCourt = partialCase.court || {};
    var partialCharge = (partialCase.charges || [])[0] || {};
    return cases.findIndex(function (item) {
      var hasStrongId = clean(partialCourt.caseNumber) && clean(item.court && item.court.caseNumber);
      var score = caseMatchScore(item, partialCase);
      if (hasStrongId) return score >= 3;
      return score >= 4 || (score >= 3 && clean(partialCharge.chargeName));
    });
  }

  function mapChargeFromRecordPath(charge) {
    charge = charge || {};
    return {
      chargeName: firstValue(charge, ["charge_name", "chargeName", "offense", "charge"]),
      statuteCode: firstValue(charge, ["charge_code", "statuteCode", "offenseCode"]),
      chargeLevel: firstValue(charge, ["chargeLevel"]) || normalizeLevel(firstValue(charge, ["level", "degree"])),
      degree: firstValue(charge, ["degree", "level"]),
      violentOffense: firstValue(charge, ["violentOffense", "isViolentOffense"]),
      sexOffense: firstValue(charge, ["sexOffense", "isSexOffense", "isSexOffenseRegistry"]),
      domesticViolence: firstValue(charge, ["domesticViolence", "isDomesticViolenceConviction"]),
      trafficOffense: firstValue(charge, ["trafficOffense", "isTraffic"]),
      drugOffense: firstValue(charge, ["drugOffense"]),
      sentenceCompletionDate: firstValue(charge, ["sentence_completion_date", "sentenceCompletionDate"]),
      probationCompletedDate: firstValue(charge, ["probation_completed_date", "probationCompletedDate", "probation_end_date", "probationEndDate"]),
      dischargeDate: firstValue(charge, ["discharge_date", "dischargeDate"]),
      finalDischargeDate: firstValue(charge, ["final_discharge_date", "finalDischargeDate"]),
      completionDate: firstValue(charge, ["completion_date", "completionDate"]),
      pendingCharges: firstValue(charge, ["pendingCharges", "pending_charges"]),
      f3FelonyCount: firstValue(charge, ["f3_felony_count", "f3FelonyCount"])
    };
  }

  function mapCaseFromRecordDetails(formData) {
    var data = formData || {};
    var charges = Array.isArray(data.charges) ? data.charges : [data];
    var first = charges[0] || {};
    return normalizeCase({
      id: data.id,
      personal: readJSON(PROFILE_KEY, {}),
      court: {
        caseState: firstValue(first, ["case_state", "caseState", "state"]),
        county: firstValue(first, ["court_county", "county"]),
        courtName: firstValue(first, ["court_name", "courtName", "court"]),
        caseNumber: firstValue(first, ["case_number", "caseNumber"]),
        judge: firstValue(first, ["judge_name", "judge"]),
        prosecutor: firstValue(first, ["prosecutor_agency", "prosecutor"]),
        defenseAttorney: firstValue(first, ["defense_attorney", "defenseAttorney"])
      },
      arrest: {
        arrestDate: firstValue(first, ["arrest_date", "offense_date"]),
        arrestingAgency: firstValue(first, ["arresting_agency", "arrestingAgency"]),
        bookingNumber: firstValue(first, ["booking_number", "bookingNumber"]),
        detentionFacility: firstValue(first, ["detention_facility", "detentionFacility"]),
        arrestState: firstValue(first, ["arrest_state", "case_state", "caseState"]),
        arrestCounty: firstValue(first, ["arrest_county", "court_county", "county"])
      },
      charges: charges.map(mapChargeFromRecordPath).filter(function (charge) {
        return charge.chargeName || charge.statuteCode || charge.degree || charge.chargeLevel;
      }),
      outcome: {
        outcome: firstValue(first, ["final_disposition", "outcome", "disposition"]),
        dispositionDate: firstValue(first, ["disposition_date", "dispositionDate"]),
        sentenceCompletionDate: firstValue(first, ["sentence_completion_date", "sentenceCompletionDate"]),
        probationCompletedDate: firstValue(first, ["probation_completed_date", "probationCompletedDate", "probation_end_date", "probationEndDate"]),
        dischargeDate: firstValue(first, ["discharge_date", "dischargeDate"]),
        finalDischargeDate: firstValue(first, ["final_discharge_date", "finalDischargeDate", "discharge_date", "dischargeDate"]),
        completionDate: firstValue(first, ["completion_date", "completionDate"]),
        caseClosedDate: firstValue(first, ["caseClosedDate", "case_closed_date", "discharge_date"])
      },
      sentencing: {
        releaseDate: firstValue(first, ["release_date", "releaseDate"]),
        probationStartDate: firstValue(first, ["probation_start_date", "probationStartDate"]),
        probationEndDate: firstValue(first, ["probation_end_date", "probationEndDate"]),
        communityControlEndDate: firstValue(first, ["community_control_end_date", "communityControlEndDate"]),
        finePaidDate: firstValue(first, ["fine_paid_date", "finePaidDate"]),
        restitutionPaidDate: firstValue(first, ["restitution_paid_date", "restitutionPaidDate"]),
        finesPaid: firstValue(first, ["finesPaid", "fines_paid", "all_fines_paid"]),
        restitutionPaid: firstValue(first, ["restitutionPaid", "restitution_paid"]),
        courtCostsPaid: firstValue(first, ["courtCostsPaid", "court_costs_paid"])
      },
      source: "RecordPathAI record-details.html"
    });
  }


  function getCurrentEligibilityResult(caseData) {
    var active = caseData || null;
    if (!active) {
      var shape = ensureRecordWatchDataShape();
      active = shape.cases.find(function (item) { return item.id === localStorage.getItem(ACTIVE_CASE_KEY); }) || shape.cases[shape.cases.length - 1] || null;
    }

    if (active && window.RecordPathEligibilityEngine && typeof window.RecordPathEligibilityEngine.resolveEligibilityForCase === "function") {
      var resolved = window.RecordPathEligibilityEngine.resolveEligibilityForCase(active);
      return {
        estimatedEligibleDate: resolved.estimatedEligibleDate || "",
        completionDate: resolved.dateUsedForCalculation || "",
        completionDateField: resolved.dateUsedForCalculationField || "",
        waitingPeriodText: resolved.requiredWaitingPeriodLabel || "",
        waitingPeriodMonths: resolved.requiredWaitingPeriod ? Number(resolved.requiredWaitingPeriod.years || 0) * 12 + Number(resolved.requiredWaitingPeriod.months || 0) : 0,
        eligibilityStatus: resolved.eligibilityStatus || "needs_review",
        likelyEligible: Boolean(resolved.likelyEligible),
        reasons: resolved.reasons || [],
        confidence: resolved.confidence || "needs_review",
        confidenceReason: resolved.confidenceReason || "RecordPathAI provides an estimate based on the information entered and available rules.",
        courtProfile: resolved.courtProfile || null,
        ruleSet: resolved.ruleSet || null,
        packetTemplate: resolved.packetTemplate || null,
        dateUsedForCalculation: resolved.dateUsedForCalculation || "",
        rawResult: resolved
      };
    }

    if (active && window.RecordWatchRules && typeof window.RecordWatchRules.calculateEligibilityResult === "function") {
      return window.RecordWatchRules.calculateEligibilityResult(active);
    }

    var stored = readJSON("recordPathResolvedEligibility", {});
    var storedDate = clean(stored.eligibility_date || stored.estimatedEligibleDate || localStorage.getItem("estimatedEligibleDate"));
    return {
      estimatedEligibleDate: storedDate,
      completionDate: clean(stored.date_used_for_calculation || stored.completion_date),
      completionDateField: clean(stored.completion_date_field),
      waitingPeriodText: clean(stored.required_waiting_period || stored.waiting_period),
      waitingPeriodMonths: 0,
      eligibilityStatus: clean(stored.eligibility_status) || (storedDate ? "needs_review" : ""),
      likelyEligible: false,
      reasons: stored.eligibility_reasons || [],
      confidence: clean(stored.eligibility_confidence) || "needs_review",
      confidenceReason: clean(stored.eligibility_confidence_reason),
      courtProfile: null,
      ruleSet: null,
      packetTemplate: null,
      dateUsedForCalculation: clean(stored.date_used_for_calculation || stored.completion_date)
    };
  }

  function persistResolvedEligibility(caseData, result, userId) {
    if (!caseData || !result) return;
    var raw = result.rawResult || result;
    var profile = result.courtProfile || raw.courtProfile || {};
    var ruleSet = result.ruleSet || raw.ruleSet || {};
    var packetTemplate = result.packetTemplate || raw.packetTemplate || {};
    var storage = {
      case_id: caseData.id || caseData.caseId || "",
      user_id: userId || currentUserId(caseData),
      court_id: profile.court_id || "",
      rule_set_id: ruleSet.rule_set_id || "",
      local_profile_id: profile.local_profile_id || "",
      relief_type: raw.reliefType || result.reliefType || "",
      eligibility_status: result.eligibilityStatus || "needs_review",
      eligibility_date: result.estimatedEligibleDate || "",
      estimatedEligibleDate: result.estimatedEligibleDate || "",
      eligibility_confidence: result.confidence || "needs_review",
      eligibility_confidence_reason: result.confidenceReason || "",
      eligibility_reasons: result.reasons || [],
      required_waiting_period: result.waitingPeriodText || raw.requiredWaitingPeriodLabel || "",
      waiting_period: result.waitingPeriodText || raw.requiredWaitingPeriodLabel || "",
      completion_date: result.completionDate || result.dateUsedForCalculation || "",
      completion_date_field: result.completionDateField || "",
      date_used_for_calculation: result.dateUsedForCalculation || result.completionDate || "",
      packet_template_id: packetTemplate.packet_template_id || "",
      updated_at: nowIso()
    };
    caseData.eligibility = storage;
    caseData.eligibilityResult = raw;
    localStorage.setItem("recordPathResolvedEligibility", JSON.stringify(storage));
    if (storage.eligibility_date) localStorage.setItem("estimatedEligibleDate", storage.eligibility_date);
  }

  function registerRecordWatchEligibility(caseData) {
    if (!caseData || !window.RecordWatchNotifications) return;
    var result = getCurrentEligibilityResult(caseData);
    var eligibilityDate = result && result.estimatedEligibleDate || "";
    var userId = currentUserId(caseData);
    persistResolvedEligibility(caseData, result, userId);
    if (!eligibilityDate) return;
    var workflow = {};
    try { workflow = JSON.parse(localStorage.getItem("recordPathWorkflowState")) || {}; } catch (error) { workflow = {}; }
    window.RecordWatchNotifications.registerEligibilityEvent({
      userId: userId,
      caseId: caseData.id,
      eligibilityDate: eligibilityDate,
      eligibilityReason: result.eligibilityStatus || "needs_review",
      waitingPeriod: result.waitingPeriodText || "",
      completionDate: result.completionDate || result.dateUsedForCalculation,
      completionDateField: result.completionDateField,
      eligibilityConfidence: result.confidence,
      eligibilityConfidenceReason: result.confidenceReason,
      courtId: result.courtProfile && result.courtProfile.court_id,
      ruleSetId: result.ruleSet && result.ruleSet.rule_set_id,
      localProfileId: result.courtProfile && result.courtProfile.local_profile_id,
      packetTemplateId: result.packetTemplate && result.packetTemplate.packet_template_id,
      dateUsedForCalculation: result.dateUsedForCalculation || result.completionDate,
      eligibilityCompletedAt: workflow.eligibilityCompletedAt || workflow.updatedAt || null,
      recordDetailsCompletedAt: workflow.recordDetailsCompletedAt || null,
      paidAt: localStorage.getItem("recordPathPacketPaymentComplete") === "true" ? new Date().toISOString() : null,
      packetGeneratedAt: localStorage.getItem("recordPathPacketGeneratedAt") || null
    });
    try {
      var cases = readJSON(CASES_KEY, []);
      var index = cases.findIndex(function (item) { return item && item.id === caseData.id; });
      if (index >= 0) {
        cases[index] = caseData;
        writeJSON(CASES_KEY, cases);
      }
    } catch (error) {}
  }

  function saveCaseFromRecordDetails(formData) {
    var shape = ensureRecordWatchDataShape();
    var mapped = mapCaseFromRecordDetails(formData);
    var index = findDuplicateIndex(shape.cases, mapped);
    if (index >= 0) {
      mapped.id = shape.cases[index].id;
      mapped.createdAt = shape.cases[index].createdAt;
      shape.cases[index] = mergeDefined(shape.cases[index], mapped);
      shape.cases[index].updatedAt = nowIso();
      localStorage.setItem(ACTIVE_CASE_KEY, shape.cases[index].id);
      writeJSON(CASES_KEY, shape.cases);
      registerRecordWatchEligibility(shape.cases[index]);
      return shape.cases[index];
    }
    shape.cases.push(mapped);
    localStorage.setItem(ACTIVE_CASE_KEY, mapped.id);
    writeJSON(CASES_KEY, shape.cases);
    registerRecordWatchEligibility(mapped);
    return mapped;
  }

  function getOrCreateActiveCase() {
    var shape = ensureRecordWatchDataShape();
    var activeId = localStorage.getItem(ACTIVE_CASE_KEY);
    var active = shape.cases.find(function (item) { return item.id === activeId; }) || shape.cases[shape.cases.length - 1];
    if (active) {
      localStorage.setItem(ACTIVE_CASE_KEY, active.id);
      return active;
    }
    active = normalizeCase({ personal: shape.profile, source: "RecordWatch background tracking" });
    shape.cases.push(active);
    localStorage.setItem(ACTIVE_CASE_KEY, active.id);
    writeJSON(CASES_KEY, shape.cases);
    return active;
  }

  function updateActiveCase(partialData) {
    var shape = ensureRecordWatchDataShape();
    var active = getOrCreateActiveCase();
    var index = shape.cases.findIndex(function (item) { return item.id === active.id; });
    shape.cases[index] = normalizeCase(mergeDefined(active, partialData || {}));
    writeJSON(CASES_KEY, shape.cases);
    registerRecordWatchEligibility(shape.cases[index]);
    return shape.cases[index];
  }

  function syncExistingRecordPathData() {
    var profile = {
      firstName: getElementValue("firstName") || localStorage.getItem("firstName"),
      lastName: getElementValue("lastName") || localStorage.getItem("lastName"),
      fullName: getElementValue("fullName") || localStorage.getItem("fullName"),
      dateOfBirth: getElementValue("dateOfBirth") || localStorage.getItem("dateOfBirth"),
      email: getElementValue("email") || localStorage.getItem("email"),
      phone: getElementValue("phone") || localStorage.getItem("phone"),
      residenceState: getElementValue("residenceState") || localStorage.getItem("residenceState")
    };
    saveProfileFromEligibility(profile);

    if (window.RecordPathDataBridge && typeof window.RecordPathDataBridge.loadPacketData === "function") {
      var packet = window.RecordPathDataBridge.loadPacketData();
      if (packet && Array.isArray(packet.charges) && packet.charges.length) saveCaseFromRecordDetails({ charges: packet.charges });
    }
    return ensureRecordWatchDataShape();
  }

  function getRecordWatchSummary() {
    var shape = ensureRecordWatchDataShape();
    var cases = shape.cases;
    var active = cases.find(function (item) { return item.id === localStorage.getItem(ACTIVE_CASE_KEY); }) || cases[cases.length - 1] || null;
    var status = active && window.RecordWatchRules ? window.RecordWatchRules.calculateCaseStatus(active) : (active ? "More information needed" : "More information needed");
    var missing = active && window.RecordWatchRules ? window.RecordWatchRules.getMissingRequirements(active) : ["Case details"];
    var nextAction = active && window.RecordWatchRules ? window.RecordWatchRules.getRecommendedStatus(active) : "Start with eligibility, then add record details.";
    return {
      trackingEnabled: true,
      profile: shape.profile,
      activeCase: active,
      totalCases: cases.length,
      estimatedEligibilityStatus: status,
      missingRequirements: missing,
      nextRecommendedAction: nextAction,
      dashboardUrl: "recordwatch-dashboard.html"
    };
  }

  window.RecordWatchBridge = {
    saveProfileFromEligibility: saveProfileFromEligibility,
    saveCaseFromRecordDetails: saveCaseFromRecordDetails,
    syncExistingRecordPathData: syncExistingRecordPathData,
    getOrCreateActiveCase: getOrCreateActiveCase,
    getCurrentEligibilityResult: getCurrentEligibilityResult,
    updateActiveCase: updateActiveCase,
    getRecordWatchSummary: getRecordWatchSummary,
    ensureRecordWatchDataShape: ensureRecordWatchDataShape
  };
}());
