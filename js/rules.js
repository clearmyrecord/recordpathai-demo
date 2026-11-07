(function () {
  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
  const MONTH_MS = YEAR_MS / 12;

  function toDate(value) {
    if (!value) return null;
    const d = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;

    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function elapsedSince(dateValue) {
    const date = toDate(dateValue);
    if (!date) return { years: 0, months: 0, ms: 0 };
    const ms = Date.now() - date.getTime();
    return {
      years: ms / YEAR_MS,
      months: ms / MONTH_MS,
      ms
    };
  }

  function addReason(list, message) {
    list.push(message);
  }

  function buildResult({
    eligible,
    status,
    state,
    reliefType,
    reasons = [],
    waitingPeriod = null,
    earliestEligibleDate = null,
    manualReview = false
  }) {
    return {
      eligible,
      status,
      state,
      reliefType,
      reasons,
      waitingPeriod,
      earliestEligibleDate,
      manualReview
    };
  }

  function formatDateISO(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addToDate(baseDateValue, years = 0, months = 0) {
    const d = toDate(baseDateValue);
    if (!d) return null;
    const copy = new Date(d.getTime());
    copy.setFullYear(copy.getFullYear() + years);
    copy.setMonth(copy.getMonth() + months);
    return formatDateISO(copy);
  }

  function normalizeOutcome(value) {
    return (value || "").trim().toLowerCase();
  }

  function normalizeDegree(value) {
    return (value || "").trim().toUpperCase();
  }

  function normalizeState(value) {
    const v = (value || "").trim().toUpperCase();
    const map = {
      OHIO: "OH",
      NEVADA: "NV",
      CALIFORNIA: "CA",
      ARIZONA: "AZ",
      TEXAS: "TX",
      FLORIDA: "FL"
    };
    return map[v] || v;
  }

  function isOhioNonConviction(outcome) {
    return [
      "dismissed",
      "dismissal",
      "not guilty",
      "acquitted",
      "no bill",
      "pardon",
      "intervention in lieu"
    ].includes(normalizeOutcome(outcome));
  }

  function isNevadaNonConviction(outcome) {
    return [
      "dismissed",
      "dismissal",
      "not guilty",
      "acquitted",
      "decriminalized",
      "no bill"
    ].includes(normalizeOutcome(outcome));
  }

  function inferArizonaClass(record) {
    const raw = [
      record.azClass,
      record.azOffenseClass,
      record.degree,
      record.chargeLevel,
      record.notes
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (raw.includes("class 2 felony")) return "AZ_F2";
    if (raw.includes("class 3 felony")) return "AZ_F3";
    if (raw.includes("class 4 felony")) return "AZ_F4";
    if (raw.includes("class 5 felony")) return "AZ_F5";
    if (raw.includes("class 6 felony")) return "AZ_F6";
    if (raw.includes("class 1 misdemeanor")) return "AZ_M1";
    if (raw.includes("class 2 misdemeanor")) return "AZ_M2";
    if (raw.includes("class 3 misdemeanor")) return "AZ_M3";

    return "";
  }

  function evaluateOhio(record) {
    // The legacy calculator previously treated disposition as final discharge
    // and labeled Ohio cases 'likely eligible' without a docket or sentence check.
    // Never use a single flat record to authorize a filing or $50 checkout.
    const helper=window.RecordPathOhioReview;
    if(!helper){
      return buildResult({
        eligible:false,status:"needs_review",state:"OH",
        reliefType:"court_review_required",manualReview:true,
        reasons:["Ohio review rules unavailable. The judgment date is not verified final discharge."]
      });
    }
    const charge={
      charge_name:record.chargeName||record.offenseName||"",
      charge_code:record.chargeCode||record.statute||"",
      level:record.degree||record.level||"",
      final_disposition:record.outcome||"",
      disposition_date:record.dispositionDate||"",
      final_discharge_date:record.finalDischargeDate||"",
      final_discharge_evidence_status:record.finalDischargeEvidenceStatus||"",
      final_discharge_evidence_source:record.finalDischargeEvidenceSource||"",
      no_bill_report_to_court_date:record.noBillReportToCourtDate||""
    };
    const remedy=(record.reliefType||"sealing").toLowerCase()==="expungement"?"expungement":"sealing";
    const timing=helper.approximateTiming(charge,remedy,new Date().toISOString().slice(0,10));
    return buildResult({
      eligible:false,status:"needs_review",state:"OH",
      reliefType:remedy,manualReview:true,
      earliestEligibleDate:timing.date||null,
      reasons:["Preliminary timing only: "+timing.status+". Official final charge, docket, sentence completion, whole-record exclusions and court review remain required. No payment or filing authorized."]
    });
  }

  function evaluateNevada(record) {
    const reasons = [];
    const outcome = normalizeOutcome(record.outcome);
    const dischargeDate = record.dischargeDate || record.dispositionDate;
    const dischargeElapsed = elapsedSince(dischargeDate);

    if (isNevadaNonConviction(outcome)) {
      addReason(reasons, "Nevada non-conviction matters are generally immediately sealable.");
      return buildResult({
        eligible: true,
        status: "likely_eligible",
        state: "NV",
        reliefType: "seal_non_conviction",
        reasons,
        earliestEligibleDate: record.dispositionDate || record.dischargeDate || null
      });
    }

    if (outcome !== "convicted" && outcome !== "guilty") {
      addReason(reasons, "Outcome not recognized. Manual review needed.");
      return buildResult({
        eligible: false,
        status: "needs_review",
        state: "NV",
        reliefType: "unknown",
        reasons,
        manualReview: true
      });
    }

    if (record.isCrimeAgainstChild || record.isSexOffense || record.isFelonyDUI || record.isHomeInvasionDeadlyWeapon) {
      addReason(reasons, "This Nevada offense appears permanently excluded from sealing.");
      return buildResult({
        eligible: false,
        status: "ineligible",
        state: "NV",
        reliefType: "conviction",
        reasons
      });
    }

    let waitYears = 0;
    let waitingPeriodLabel = "";

    if (record.nvCategory === "standard_misdemeanor") {
      waitYears = 1;
      waitingPeriodLabel = "1 year after case closes";
    } else if (record.nvCategory === "listed_misdemeanor") {
      waitYears = 2;
      waitingPeriodLabel = "2 years after case closes";
    } else if (record.nvCategory === "dui_or_dv") {
      waitYears = 7;
      waitingPeriodLabel = "7 years after case closes";
    } else if (record.nvCategory === "felony") {
      waitYears = 5;
      waitingPeriodLabel = "5 years after case closes";
    } else if (record.nvCategory === "violent_or_category_a") {
      waitYears = 10;
      waitingPeriodLabel = "10 years after case closes";
    } else {
      addReason(reasons, "Nevada category not mapped. Manual review needed.");
      return buildResult({
        eligible: false,
        status: "needs_review",
        state: "NV",
        reliefType: "conviction",
        reasons,
        manualReview: true
      });
    }

    const eligible = dischargeElapsed.years >= waitYears;
    const eligibleDate = addToDate(dischargeDate, waitYears, 0);

    addReason(
      reasons,
      eligible
        ? `Nevada waiting period appears satisfied (${waitingPeriodLabel}).`
        : `Nevada waiting period not yet satisfied (${waitingPeriodLabel}).`
    );

    return buildResult({
      eligible,
      status: eligible ? "likely_eligible" : "not_eligible_yet",
      state: "NV",
      reliefType: "conviction",
      reasons,
      waitingPeriod: waitingPeriodLabel,
      earliestEligibleDate: eligibleDate
    });
  }

  function evaluateArizona(record) {
    const reasons = [];
    const outcome = normalizeOutcome(record.outcome);
    const dischargeDate = record.dischargeDate || record.dispositionDate;
    const dischargeElapsed = elapsedSince(dischargeDate);
    const azClass = inferArizonaClass(record);

    if (record.pendingCharges) {
      addReason(reasons, "Arizona set-aside timing is not clean while other matters may still be pending.");
      return buildResult({
        eligible: false,
        status: "needs_review",
        state: "AZ",
        reliefType: "set_aside",
        reasons,
        manualReview: true
      });
    }

    if (["dismissed", "dismissal", "not guilty", "acquitted", "no bill"].includes(outcome)) {
      addReason(reasons, "Arizona non-conviction matters may be addressed without the conviction waiting period.");
      return buildResult({
        eligible: true,
        status: "likely_eligible",
        state: "AZ",
        reliefType: "non_conviction_relief",
        reasons,
        earliestEligibleDate: record.dispositionDate || record.dischargeDate || null,
        manualReview: true
      });
    }

    if (outcome !== "convicted" && outcome !== "guilty") {
      addReason(reasons, "Outcome not recognized. Manual review needed.");
      return buildResult({
        eligible: false,
        status: "needs_review",
        state: "AZ",
        reliefType: "unknown",
        reasons,
        manualReview: true
      });
    }

    if (!azClass) {
      addReason(reasons, "Arizona offense class is missing. Exact waiting period cannot be calculated.");
      return buildResult({
        eligible: false,
        status: "needs_review",
        state: "AZ",
        reliefType: "set_aside",
        reasons,
        manualReview: true
      });
    }

    let waitYears = 0;
    let waitingPeriodLabel = "";

    if (azClass === "AZ_F2" || azClass === "AZ_F3") {
      waitYears = 10;
      waitingPeriodLabel = "10 years after sentence completion";
    } else if (azClass === "AZ_F4" || azClass === "AZ_F5" || azClass === "AZ_F6") {
      waitYears = 5;
      waitingPeriodLabel = "5 years after sentence completion";
    } else if (azClass === "AZ_M1") {
      waitYears = 3;
      waitingPeriodLabel = "3 years after sentence completion";
    } else if (azClass === "AZ_M2" || azClass === "AZ_M3") {
      waitYears = 2;
      waitingPeriodLabel = "2 years after sentence completion";
    }

    const eligible = dischargeElapsed.years >= waitYears;
    const eligibleDate = addToDate(dischargeDate, waitYears, 0);

    addReason(
      reasons,
      eligible
        ? `Arizona waiting period appears satisfied (${waitingPeriodLabel}).`
        : `Arizona waiting period not yet satisfied (${waitingPeriodLabel}).`
    );

    return buildResult({
      eligible,
      status: eligible ? "likely_eligible" : "not_eligible_yet",
      state: "AZ",
      reliefType: "set_aside",
      reasons,
      waitingPeriod: waitingPeriodLabel,
      earliestEligibleDate: eligibleDate,
      manualReview: true
    });
  }

  function evaluateCalifornia(record) {
    const reasons = [];
    const outcome = normalizeOutcome(record.outcome);
    const dischargeDate = record.dischargeDate || record.dispositionDate;
    const dischargeElapsed = elapsedSince(dischargeDate);

    if (record.pendingCharges) {
      addReason(reasons, "California relief generally requires no active pending criminal matters.");
      return buildResult({
        eligible: false,
        status: "not_eligible_yet",
        state: "CA",
        reliefType: "dismissal_or_reduction",
        reasons
      });
    }

    if (["dismissed", "dismissal", "not guilty", "acquitted"].includes(outcome)) {
      addReason(reasons, "California non-conviction relief may be available now.");
      return buildResult({
        eligible: true,
        status: "likely_eligible",
        state: "CA",
        reliefType: "non_conviction_relief",
        reasons,
        earliestEligibleDate: record.dispositionDate || record.dischargeDate || null,
        manualReview: true
      });
    }

    if (outcome !== "convicted" && outcome !== "guilty") {
      addReason(reasons, "Outcome not recognized. Manual review needed.");
      return buildResult({
        eligible: false,
        status: "needs_review",
        state: "CA",
        reliefType: "unknown",
        reasons,
        manualReview: true
      });
    }

    if (record.caReliefTrack === "1203.42") {
      const eligible = dischargeElapsed.years >= 2;
      const eligibleDate = addToDate(dischargeDate, 2, 0);

      addReason(
        reasons,
        eligible
          ? "California 1203.42 timing appears satisfied."
          : "California 1203.42 typically requires 2 years after sentence completion."
      );

      return buildResult({
        eligible,
        status: eligible ? "likely_eligible" : "not_eligible_yet",
        state: "CA",
        reliefType: "1203.42",
        reasons,
        waitingPeriod: "2 years after sentence completion",
        earliestEligibleDate: eligibleDate,
        manualReview: true
      });
    }

    if (record.caNoProbation === true) {
      const baseDate = record.dispositionDate || record.dischargeDate;
      const elapsed = elapsedSince(baseDate);
      const eligible = elapsed.years >= 1;
      const eligibleDate = addToDate(baseDate, 1, 0);

      addReason(
        reasons,
        eligible
          ? "California no-probation misdemeanor timing appears satisfied."
          : "California no-probation misdemeanor relief commonly uses a 1-year timing path."
      );

      return buildResult({
        eligible,
        status: eligible ? "likely_eligible" : "not_eligible_yet",
        state: "CA",
        reliefType: "1203.4a",
        reasons,
        waitingPeriod: "1 year from judgment",
        earliestEligibleDate: eligibleDate,
        manualReview: true
      });
    }

    addReason(reasons, "California relief path depends on probation status and statute track. Manual review is recommended.");
    return buildResult({
      eligible: !!dischargeDate,
      status: dischargeDate ? "likely_eligible" : "needs_review",
      state: "CA",
      reliefType: "dismissal_or_reduction",
      reasons,
      earliestEligibleDate: dischargeDate || null,
      manualReview: true
    });
  }

  function evaluateRecordEligibility(record) {
    const state = normalizeState(record.caseState);

    if (!state) {
      return buildResult({
        eligible: false,
        status: "needs_review",
        state: "",
        reliefType: "unknown",
        reasons: ["Case state is missing. Eligibility must be based on where the case was filed, not where the user lives."],
        manualReview: true
      });
    }

    if (state === "OH") return evaluateOhio(record);
    if (state === "NV") return evaluateNevada(record);
    if (state === "AZ") return evaluateArizona(record);
    if (state === "CA") return evaluateCalifornia(record);

    return buildResult({
      eligible: false,
      status: "needs_review",
      state,
      reliefType: "unknown",
      reasons: [`No rules engine loaded yet for ${state}.`],
      manualReview: true
    });
  }

  window.CMRRules = {
    evaluateRecordEligibility
  };
})();
