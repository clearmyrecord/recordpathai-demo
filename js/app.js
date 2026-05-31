(function () {
  const STORAGE_KEY = "cmr_app_state_v2";

  const defaultState = {
    user: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address1: "",
      address2: "",
      city: "",
      residenceState: "",
      zip: ""
    },
    records: [],
    currentRecordId: null
  };

  function uid() {
    return "rec_" + Math.random().toString(36).slice(2, 10);
  }

  function cloneDefaultState() {
    return JSON.parse(JSON.stringify(defaultState));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaultState();

      const parsed = JSON.parse(raw);
      return {
        ...cloneDefaultState(),
        ...parsed,
        user: {
          ...cloneDefaultState().user,
          ...(parsed.user || {})
        },
        records: Array.isArray(parsed.records) ? parsed.records : [],
        currentRecordId: parsed.currentRecordId || null
      };
    } catch (err) {
      console.error("Failed to load app state", err);
      return cloneDefaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }

  function getCurrentRecord() {
    if (!appState.currentRecordId) return null;
    return appState.records.find(r => r.id === appState.currentRecordId) || null;
  }

  function getRecordById(id) {
    return appState.records.find(r => r.id === id) || null;
  }

  function createEmptyRecord() {
    return {
      id: uid(),
      caseState: "",
      filingCourtName: "",
      filingCounty: "",
      caseNumber: "",
      chargeName: "",
      statute: "",
      degree: "",
      outcome: "",
      offenseDate: "",
      dispositionDate: "",
      dischargeDate: "",
      notes: "",
      pendingCharges: false,

      // Ohio flags
      isTraffic: false,
      isTheftInOffice: false,
      isFirstOrSecondDegreeFelony: false,
      isSexOffenseRegistry: false,
      victimUnder13: false,
      isFelonyViolenceNonSex: false,
      isDomesticViolenceConviction: false,
      dvMisdemeanorSealable: false,
      totalFelonies: 0,
      totalF3: 0,

      // Nevada flags
      nvCategory: "",
      isCrimeAgainstChild: false,
      isSexOffense: false,
      isFelonyDUI: false,
      isHomeInvasionDeadlyWeapon: false,

      eligibility: null
    };
  }

  function ensureCurrentRecord() {
    let record = getCurrentRecord();

    if (!record) {
      record = createEmptyRecord();
      appState.records.push(record);
      appState.currentRecordId = record.id;
      saveState();
    }

    return record;
  }

  function upsertCurrentRecord(partial) {
    const record = ensureCurrentRecord();
    Object.assign(record, partial);
    saveState();
    return record;
  }

  function replaceRecords(records) {
    appState.records = records;
    appState.currentRecordId = records[0]?.id || null;
    saveState();
  }

  function evaluateRecord(record) {
    if (!record) return null;

    if (window.RecordPathEligibilityEngine && typeof window.RecordPathEligibilityEngine.resolveEligibilityForCase === "function") {
      const resolved = window.RecordPathEligibilityEngine.resolveEligibilityForCase(record);
      const result = {
        eligible: Boolean(resolved.likelyEligible),
        status: resolved.eligibilityStatus,
        state: resolved.normalizedCase && resolved.normalizedCase.caseState,
        reliefType: resolved.reliefType,
        reasons: resolved.reasons || [],
        waitingPeriod: resolved.requiredWaitingPeriodLabel,
        earliestEligibleDate: resolved.estimatedEligibleDate,
        manualReview: resolved.eligibilityStatus === "needs_review",
        resolvedEligibility: resolved
      };
      record.eligibility = result;
      return result;
    }

    if (!window.CMRRules || typeof window.CMRRules.evaluateRecordEligibility !== "function") {
      return null;
    }

    const result = window.CMRRules.evaluateRecordEligibility(record);
    record.eligibility = result;
    return result;
  }

  function evaluateCurrentRecord() {
    const record = getCurrentRecord();
    if (!record) return null;

    const result = evaluateRecord(record);
    saveState();
    return result;
  }

  function evaluateAllRecords() {
    appState.records.forEach(record => {
      evaluateRecord(record);
    });
    saveState();
  }

  function boolFromFormValue(form, name) {
    const el = form.querySelector(`[name="${name}"]`);
    return !!(el && el.checked);
  }

  function val(form, name) {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : "";
  }

  function num(form, name) {
    const raw = val(form, name);
    return raw === "" ? 0 : Number(raw);
  }

  function safe(value, fallback = "") {
    return (value ?? "").toString().trim() || fallback;
  }

  function normalizeDegree(raw) {
    const value = safe(raw).toUpperCase();

    if (!value) return "";
    if (["MM", "M", "F5", "F4", "F3", "F2", "F1"].includes(value)) return value;
    if (value.includes("MINOR")) return "MM";
    if (value.includes("MISDEMEANOR")) return "M";
    if (value.includes("FELONY 5")) return "F5";
    if (value.includes("FELONY 4")) return "F4";
    if (value.includes("FELONY 3")) return "F3";
    if (value.includes("FELONY 2")) return "F2";
    if (value.includes("FELONY 1")) return "F1";

    return value;
  }

  function normalizeOutcome(raw) {
    const value = safe(raw).toLowerCase();

    if (!value) return "";
    if (value === "guilty") return "convicted";
    if (value === "no contest") return "convicted";
    if (value === "convicted") return "convicted";
    if (value === "dismissed") return "dismissed";
    if (value === "not guilty") return "not guilty";
    if (value === "acquitted") return "acquitted";
    if (value === "no bill") return "no bill";
    if (value === "pardon") return "pardon";
    if (value === "intervention in lieu") return "intervention in lieu";

    return value;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bindEligibilityForm() {
    const form = document.querySelector("#eligibility-form");
    if (!form) return;

    const current = getCurrentRecord();
    if (current) {
      populateEligibilityForm(form, current);
      renderEligibilityResult(current.eligibility);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const record = upsertCurrentRecord({
        caseState: val(form, "caseState").toUpperCase(),
        filingCourtName: val(form, "filingCourtName"),
        filingCounty: val(form, "filingCounty"),
        caseNumber: val(form, "caseNumber"),
        chargeName: val(form, "chargeName"),
        statute: val(form, "statute"),
        degree: normalizeDegree(val(form, "degree")),
        outcome: normalizeOutcome(val(form, "outcome")),
        dischargeDate: val(form, "dischargeDate"),
        pendingCharges: boolFromFormValue(form, "pendingCharges"),

        isTraffic: boolFromFormValue(form, "isTraffic"),
        isTheftInOffice: boolFromFormValue(form, "isTheftInOffice"),
        isFirstOrSecondDegreeFelony: boolFromFormValue(form, "isFirstOrSecondDegreeFelony"),
        isSexOffenseRegistry: boolFromFormValue(form, "isSexOffenseRegistry"),
        victimUnder13: boolFromFormValue(form, "victimUnder13"),
        isFelonyViolenceNonSex: boolFromFormValue(form, "isFelonyViolenceNonSex"),
        isDomesticViolenceConviction: boolFromFormValue(form, "isDomesticViolenceConviction"),
        dvMisdemeanorSealable: boolFromFormValue(form, "dvMisdemeanorSealable"),
        totalFelonies: num(form, "totalFelonies"),
        totalF3: num(form, "totalF3"),

        nvCategory: val(form, "nvCategory"),
        isCrimeAgainstChild: boolFromFormValue(form, "isCrimeAgainstChild"),
        isSexOffense: boolFromFormValue(form, "isSexOffense"),
        isFelonyDUI: boolFromFormValue(form, "isFelonyDUI"),
        isHomeInvasionDeadlyWeapon: boolFromFormValue(form, "isHomeInvasionDeadlyWeapon")
      });

      const result = evaluateCurrentRecord();
      renderEligibilityResult(result);

      console.log("Saved record", record);
    });

    const continueBtn = document.querySelector("#eligibility-continue");
    if (continueBtn) {
      continueBtn.addEventListener("click", function () {
        form.requestSubmit();
        window.location.href = "record-details.html";
      });
    }
  }

  function populateEligibilityForm(form, record) {
    [
      "caseState",
      "filingCourtName",
      "filingCounty",
      "caseNumber",
      "chargeName",
      "statute",
      "dischargeDate",
      "nvCategory"
    ].forEach(name => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.value = record[name] || "";
    });

    const degreeEl = form.querySelector(`[name="degree"]`);
    if (degreeEl) degreeEl.value = record.degree || "";

    const outcomeEl = form.querySelector(`[name="outcome"]`);
    if (outcomeEl) outcomeEl.value = record.outcome || "";

    [
      "pendingCharges",
      "isTraffic",
      "isTheftInOffice",
      "isFirstOrSecondDegreeFelony",
      "isSexOffenseRegistry",
      "victimUnder13",
      "isFelonyViolenceNonSex",
      "isDomesticViolenceConviction",
      "dvMisdemeanorSealable",
      "isCrimeAgainstChild",
      "isSexOffense",
      "isFelonyDUI",
      "isHomeInvasionDeadlyWeapon"
    ].forEach(name => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.checked = !!record[name];
    });

    ["totalFelonies", "totalF3"].forEach(name => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.value = record[name] ?? 0;
    });
  }

  function renderEligibilityResult(result) {
    const box = document.querySelector("#eligibility-result");
    if (!box) return;

    if (!result) {
      box.innerHTML = `<p>No eligibility result yet.</p>`;
      return;
    }

    const reasonsHtml = (result.reasons || [])
      .map(reason => `<li>${escapeHtml(reason)}</li>`)
      .join("");

    box.innerHTML = `
      <div class="result-card status-${escapeHtml(result.status)}">
        <h3>Eligibility Result</h3>
        <p><strong>Case state:</strong> ${escapeHtml(result.state || "Unknown")}</p>
        <p><strong>Status:</strong> ${escapeHtml(result.status)}</p>
        <p><strong>Likely eligible:</strong> ${result.eligible ? "Yes" : "No"}</p>
        <p><strong>Waiting period:</strong> ${escapeHtml(result.waitingPeriod || "N/A")}</p>
        <p><strong>Earliest date:</strong> ${escapeHtml(result.earliestEligibleDate || "N/A")}</p>
        <ul>${reasonsHtml}</ul>
      </div>
    `;
  }

  function bindUserProfileForm() {
    const form = document.querySelector("#user-profile-form");
    if (!form) return;

    Object.entries(appState.user).forEach(([key, value]) => {
      const el = form.querySelector(`[name="${key}"]`);
      if (el) el.value = value || "";
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      appState.user = {
        firstName: val(form, "firstName"),
        lastName: val(form, "lastName"),
        email: val(form, "email"),
        phone: val(form, "phone"),
        address1: val(form, "address1"),
        address2: val(form, "address2"),
        city: val(form, "city"),
        residenceState: val(form, "residenceState").toUpperCase(),
        zip: val(form, "zip")
      };

      saveState();
      alert("Saved.");
    });
  }

  function bindRecordDetailsBridge() {
    const offenseList = document.querySelector("#offenseList");
    const continueBtn = document.querySelector("#continueBtn");

    if (!offenseList || !continueBtn) return;

    continueBtn.addEventListener("click", function () {
      const cards = Array.from(document.querySelectorAll(".rd-offense"));

      if (!cards.length) return;

      const records = cards.map((card, index) => {
        const row = {};
        card.querySelectorAll("input, textarea, select").forEach((field) => {
          row[field.name] = field.value.trim();
        });

        const chargeName = safe(row[`charge_name_${index}`]);
        const statute = safe(row[`offense_code_${index}`]);
        const degree = normalizeDegree(row[`charge_level_${index}`]);
        const outcome = normalizeOutcome(row[`disposition_${index}`]);
        const caseNumber = safe(row[`case_number_${index}`]);
        const dispositionDate = safe(row[`conviction_date_${index}`]);
        const dischargeDate = safe(row[`probation_completed_date_${index}`]);
        const filingCourtName = safe(row[`court_${index}`]);
        const filingCounty = safe(row[`county_${index}`]);
        const caseState = safe(row[`state_${index}`]).toUpperCase();
        const notes = safe(row[`notes_${index}`]);

        const record = createEmptyRecord();

        record.caseState = caseState;
        record.filingCourtName = filingCourtName;
        record.filingCounty = filingCounty;
        record.caseNumber = caseNumber;
        record.chargeName = chargeName;
        record.statute = statute;
        record.degree = degree;
        record.outcome = outcome;
        record.dispositionDate = dispositionDate;
        record.dischargeDate = dischargeDate;
        record.notes = notes;

        record.isFirstOrSecondDegreeFelony = degree === "F1" || degree === "F2";
        record.isDomesticViolenceConviction = chargeName.toLowerCase().includes("domestic violence");
        record.totalFelonies = ["F1", "F2", "F3", "F4", "F5"].includes(degree) ? 1 : 0;
        record.totalF3 = degree === "F3" ? 1 : 0;

        return record;
      });

      replaceRecords(records);
      evaluateAllRecords();
    });
  }

  function bindPacketPage() {
    const packetBox = document.querySelector("#packet-summary");
    if (!packetBox) return;

    const record = getCurrentRecord();

    if (!record) {
      packetBox.innerHTML = `<p>No record found.</p>`;
      return;
    }

    packetBox.innerHTML = `
      <div class="packet-card">
        <h2>Packet Review</h2>

        <p><strong>Residence state:</strong> ${escapeHtml(appState.user.residenceState || "Not entered")}</p>
        <p><strong>Case state:</strong> ${escapeHtml(record.caseState || "Not entered")}</p>
        <p><strong>Filing court:</strong> ${escapeHtml(record.filingCourtName || "Not entered")}</p>
        <p><strong>County:</strong> ${escapeHtml(record.filingCounty || "Not entered")}</p>
        <p><strong>Case number:</strong> ${escapeHtml(record.caseNumber || "Not entered")}</p>
        <p><strong>Charge:</strong> ${escapeHtml(record.chargeName || "Not entered")}</p>
        <p><strong>Outcome:</strong> ${escapeHtml(record.outcome || "Not entered")}</p>

        <hr />

        <h3>Eligibility</h3>
        <p><strong>Evaluated under:</strong> ${escapeHtml(record.eligibility?.state || record.caseState || "Unknown")}</p>
        <p><strong>Status:</strong> ${escapeHtml(record.eligibility?.status || "Not evaluated")}</p>
        <p><strong>Likely eligible:</strong> ${record.eligibility?.eligible ? "Yes" : "No"}</p>
        <p><strong>Waiting period:</strong> ${escapeHtml(record.eligibility?.waitingPeriod || "N/A")}</p>

        <h3>Important Fix</h3>
        <p>This packet is now tied to the <strong>case state</strong>, not the user’s home address.</p>
      </div>
    `;
  }

  const appState = loadState();

  document.addEventListener("DOMContentLoaded", function () {
    bindUserProfileForm();
    bindEligibilityForm();
    bindRecordDetailsBridge();
    bindPacketPage();
  });

  window.CMRApp = {
    state: appState,
    getCurrentRecord,
    getRecordById,
    upsertCurrentRecord,
    evaluateCurrentRecord,
    evaluateAllRecords,
    replaceRecords,
    saveState
  };
})();
