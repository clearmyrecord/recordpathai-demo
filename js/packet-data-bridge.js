(function () {
  "use strict";

  const STORAGE_KEY = "recordPathPacketData";
  const PROJECT_NAME = "RecordPathAI";
  const SCHEMA_VERSION = 1;

  function nowIso() {
    return new Date().toISOString();
  }

  function monthNameFromDate(date) {
    return date.toLocaleString("en-US", { month: "long" });
  }

  function createEmptyPacketData() {
    return {
      meta: {
        project_name: PROJECT_NAME,
        schema_version: SCHEMA_VERSION,
        created_at: "",
        updated_at: "",
        source_state: "",
        source_county: ""
      },

      petitioner: {
        first_name: "",
        middle_name: "",
        last_name: "",
        full_name: "",
        dob: "",
        ssn_full: "",
        ssn_last4: "",
        phone: "",
        email: "",
        address: {
          line1: "",
          line2: "",
          city: "",
          state: "",
          zip: "",
          county: ""
        }
      },

      attorney: {
        is_self_represented: true,
        name: "",
        bar_number: "",
        phone: "",
        email: "",
        address: {
          line1: "",
          line2: "",
          city: "",
          state: "",
          zip: ""
        }
      },

      court: {
        state: "",
        county: "",
        name: "",
        department: "",
        docket_number: "",
        case_number: "",
        case_type: "",
        address: {
          line1: "",
          line2: "",
          city: "",
          state: "",
          zip: ""
        }
      },

      judge_name: "",

      eligibility: {
        state_ruleset: "",
        filing_type: "",
        is_eligible: false,
        eligibility_status: "",
        eligibility_reason: "",
        estimated_eligible_on: "",
        waiting_period_complete: false,
        has_pending_cases: false,
        has_outstanding_fines: false,
        has_open_warrants: false,
        requires_prosecutor_notice: false,
        requires_hearing: false,
        requires_fingerprints: false,
        requires_certified_disposition: false,
        notes: ""
      },

      case: {
        filing_date: "",
        hearing_date: "",
        incident_count: 0,
        conviction_count: 0,
        dismissal_count: 0,
        overall_disposition_summary: "",
        petition_reason: "",
        rehabilitation_statement: "",
        supporting_statement: ""
      },

      charges: [],

      agencies: {
        to_serve: [],
        to_seal_records: "",
        arresting_agencies: [],
        prosecutor_agencies: [],
        courts: []
      },

      checkboxes: {
        petitioner_self: false,
        petitioner_attorney: false,
        no_pending_cases: false,
        all_fines_paid: false,
        charge_dismissed: false,
        charge_convicted: false,
        first_time_offense: false,
        repeat_offender: false
      },

      signatures: {
        petition_signed_day: "",
        petition_signed_month: "",
        petition_signed_year: "",
        affidavit_signed_day: "",
        affidavit_signed_month: "",
        affidavit_signed_year: "",
        order_judge_signed_day: "",
        order_judge_signed_month_year: "",
        petitioner_signature_name: "",
        attorney_signature_name: "",
        district_attorney_delegate_signature: "",
        district_attorney_delegate_bar_number: ""
      },

      generated: {
        current_date: "",
        current_day: "",
        current_month: "",
        current_year: "",
        prepared_by_name: "",
        prepared_by_role: ""
      }
    };
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (Array.isArray(sourceValue)) {
        target[key] = sourceValue;
      } else if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue)
      ) {
        if (!targetValue || typeof targetValue !== "object" || Array.isArray(targetValue)) {
          target[key] = {};
        }
        deepMerge(target[key], sourceValue);
      } else {
        target[key] = sourceValue;
      }
    });

    return target;
  }

  function ensureMeta(data) {
    if (!data.meta) data.meta = {};
    if (!data.meta.project_name) data.meta.project_name = PROJECT_NAME;
    if (!data.meta.schema_version) data.meta.schema_version = SCHEMA_VERSION;
    if (!data.meta.created_at) data.meta.created_at = nowIso();
    data.meta.updated_at = nowIso();
  }

  function normalizeJudgeName(data) {
    if (!data || typeof data !== "object") return;
    if (!data.court || typeof data.court !== "object") data.court = {};
    if (!Array.isArray(data.charges)) data.charges = [];

    const normalize = (value) => normalizeString(value).trim();
    const first = data.charges[0] || {};
    const fromCourt = normalize(data.court.judge_name);
    const fromTopLevel = normalize(data.judge_name);
    const fromCharge = normalize(first.judge_name);
    const resolved = fromCourt || fromTopLevel || fromCharge;

    if (!resolved) return;
    data.court.judge_name = resolved;
    data.judge_name = resolved;
    if (!fromCharge && first && typeof first === "object") {
      first.judge_name = resolved;
    }
  }

  function loadPacketData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const base = createEmptyPacketData();

      if (!raw) {
        ensureMeta(base);
        savePacketData(base);
        return base;
      }

      const parsed = JSON.parse(raw);
      const merged = deepMerge(base, parsed || {});
      normalizeJudgeName(merged);
      ensureMeta(merged);

      if (!Array.isArray(merged.charges)) merged.charges = [];
      savePacketData(merged);
      return merged;
    } catch (err) {
      console.error("Failed to load packet data:", err);
      const fallback = createEmptyPacketData();
      ensureMeta(fallback);
      savePacketData(fallback);
      return fallback;
    }
  }

  function savePacketData(data) {
    normalizeJudgeName(data);
    ensureMeta(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  function isIndexKey(key) {
    return /^\d+$/.test(key);
  }

  function setValueByPath(obj, path, value) {
    if (!obj || !path) return;

    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      const nextKey = keys[i + 1];
      const nextIsIndex = isIndexKey(nextKey);

      if (isIndexKey(key)) {
        const index = Number(key);

        if (!Array.isArray(current)) return;

        if (isLast) {
          current[index] = value;
          return;
        }

        if (current[index] == null) {
          current[index] = nextIsIndex ? [] : {};
        }

        current = current[index];
        continue;
      }

      if (isLast) {
        current[key] = value;
        return;
      }

      if (current[key] == null) {
        current[key] = nextIsIndex ? [] : {};
      }

      current = current[key];
    }
  }

  function getValueByPath(obj, path) {
    if (!obj || !path) return undefined;

    return path.split(".").reduce((acc, key) => {
      if (acc == null) return undefined;
      return isIndexKey(key) ? acc[Number(key)] : acc[key];
    }, obj);
  }

  function normalizeString(value) {
    return value == null ? "" : String(value);
  }

  function digitsOnly(value) {
    return normalizeString(value).replace(/\D/g, "");
  }

  function buildFullName(data) {
    const p = data.petitioner || {};
    p.full_name = [p.first_name, p.middle_name, p.last_name]
      .map((part) => normalizeString(part).trim())
      .filter(Boolean)
      .join(" ");
  }

  function buildSsnLast4(data) {
    const digits = digitsOnly(data.petitioner && data.petitioner.ssn_full);
    data.petitioner.ssn_last4 = digits ? digits.slice(-4) : "";
  }

  function syncSelfRepresentedAttorney(data) {
    const selfRep = !!(data.attorney && data.attorney.is_self_represented);

    data.checkboxes.petitioner_self = selfRep;
    data.checkboxes.petitioner_attorney = !selfRep;

    if (!selfRep) return;

    data.attorney.name = data.petitioner.full_name || "";
    data.attorney.phone = data.petitioner.phone || "";
    data.attorney.email = data.petitioner.email || "";

    data.attorney.address.line1 = data.petitioner.address.line1 || "";
    data.attorney.address.line2 = data.petitioner.address.line2 || "";
    data.attorney.address.city = data.petitioner.address.city || "";
    data.attorney.address.state = data.petitioner.address.state || "";
    data.attorney.address.zip = data.petitioner.address.zip || "";
  }

  function buildEligibilityCheckboxes(data) {
    data.checkboxes.no_pending_cases = !data.eligibility.has_pending_cases;
    data.checkboxes.all_fines_paid = !data.eligibility.has_outstanding_fines;
  }

  function buildChargeSummaries(data) {
    const charges = Array.isArray(data.charges) ? data.charges : [];

    data.case.incident_count = charges.length;
    data.case.conviction_count = charges.filter((c) => !!c.is_convicted).length;
    data.case.dismissal_count = charges.filter((c) => !!c.is_dismissed).length;

    if (!charges.length) {
      data.case.overall_disposition_summary = "";
      data.checkboxes.charge_dismissed = false;
      data.checkboxes.charge_convicted = false;
      return;
    }

    const first = charges[0] || {};
    data.checkboxes.charge_dismissed = !!first.is_dismissed;
    data.checkboxes.charge_convicted = !!first.is_convicted;

    const dispositions = charges
      .map((c) => c.final_disposition || c.disposition || "")
      .filter(Boolean);

    data.case.overall_disposition_summary = dispositions.join("; ");
  }

  function buildAgencySummaries(data) {
    const charges = Array.isArray(data.charges) ? data.charges : [];

    const arrestingAgencies = [...new Set(
      charges.map((c) => normalizeString(c.arresting_agency).trim()).filter(Boolean)
    )];

    const prosecutorAgencies = [...new Set(
      charges.map((c) => normalizeString(c.prosecutor_agency).trim()).filter(Boolean)
    )];

    const courts = [...new Set(
      charges.map((c) => normalizeString(c.court_name).trim()).filter(Boolean)
    )];

    data.agencies.arresting_agencies = arrestingAgencies;
    data.agencies.prosecutor_agencies = prosecutorAgencies;
    data.agencies.courts = courts;

    const combined = [...new Set([
      ...arrestingAgencies,
      ...prosecutorAgencies,
      ...courts
    ])];

    data.agencies.to_serve = combined;
    data.agencies.to_seal_records = combined.join("; ");
  }

  function buildSignatureNames(data) {
    data.signatures.petitioner_signature_name = data.petitioner.full_name || "";

    if (data.attorney.is_self_represented) {
      data.signatures.attorney_signature_name = data.petitioner.full_name || "";
    } else {
      data.signatures.attorney_signature_name = data.attorney.name || "";
    }
  }

  function buildGeneratedDates(data) {
    const now = new Date();
    const month = monthNameFromDate(now);
    const day = String(now.getDate());
    const year = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    data.generated.current_date = `${mm}/${dd}/${year}`;
    data.generated.current_day = day;
    data.generated.current_month = month;
    data.generated.current_year = year;

    if (!data.signatures.petition_signed_day) data.signatures.petition_signed_day = day;
    if (!data.signatures.petition_signed_month) data.signatures.petition_signed_month = month;
    if (!data.signatures.petition_signed_year) data.signatures.petition_signed_year = year;

    if (!data.signatures.affidavit_signed_day) data.signatures.affidavit_signed_day = day;
    if (!data.signatures.affidavit_signed_month) data.signatures.affidavit_signed_month = month;
    if (!data.signatures.affidavit_signed_year) data.signatures.affidavit_signed_year = year;
  }

  function derivePacketData(data) {
    normalizeJudgeName(data);
    buildFullName(data);
    buildSsnLast4(data);
    syncSelfRepresentedAttorney(data);
    buildEligibilityCheckboxes(data);
    buildChargeSummaries(data);
    buildAgencySummaries(data);
    buildSignatureNames(data);
    buildGeneratedDates(data);
    normalizeJudgeName(data);

    return data;
  }

  function getInputValue(input) {
    if (input.type === "checkbox") return !!input.checked;
    if (input.type === "number") return input.value === "" ? "" : Number(input.value);
    if (input.tagName === "SELECT" && input.multiple) {
      return Array.from(input.selectedOptions).map((opt) => opt.value);
    }
    return input.value;
  }

  function setInputValue(input, value) {
    if (input.type === "checkbox") {
      input.checked = !!value;
      return;
    }

    if (input.tagName === "SELECT" && input.multiple && Array.isArray(value)) {
      Array.from(input.options).forEach((opt) => {
        opt.selected = value.includes(opt.value);
      });
      return;
    }

    // Support older drafts that stored the full name (e.g. "New York")
    // while keeping residence completely separate from the filing jurisdiction.
    if (input.id === "residenceState" && input.tagName === "SELECT" &&
        value !== undefined && value !== null && String(value).trim() !== "") {
      const text = String(value).trim().toLowerCase();
      const match = Array.from(input.options).find(option =>
        option.value.toLowerCase() === text ||
        option.textContent.trim().toLowerCase() === text);
      if (match) {
        input.value = match.value;
        return;
      }
    }
    input.value = value == null ? "" : value;
  }

  function bindPathInputs(root, data) {
    const inputs = root.querySelectorAll("[data-path]");

    inputs.forEach((input) => {
      const path = input.dataset.path;
      const existing = getValueByPath(data, path);
      if (existing !== undefined) {
        setInputValue(input, existing);
      }

      const handler = () => {
        const current = loadPacketData();
        setValueByPath(current, path, getInputValue(input));
        derivePacketData(current);
        savePacketData(current);
        refreshComputedFields(document, current);
        emitDataUpdated(current);
      };

      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });
  }

  function refreshComputedFields(root, data) {
    const computedNodes = root.querySelectorAll("[data-computed-path]");
    computedNodes.forEach((node) => {
      const path = node.dataset.computedPath;
      const value = getValueByPath(data, path);
      node.textContent = value == null ? "" : String(value);
    });

    const valueNodes = root.querySelectorAll("[data-value-path]");
    valueNodes.forEach((node) => {
      const path = node.dataset.valuePath;
      const value = getValueByPath(data, path);
      if ("value" in node) {
        node.value = value == null ? "" : value;
      } else {
        node.textContent = value == null ? "" : String(value);
      }
    });
  }

  function emitDataUpdated(data) {
    document.dispatchEvent(new CustomEvent("recordpath:data-updated", {
      detail: { data }
    }));
  }

  function ensureCharge(data, index) {
    if (!Array.isArray(data.charges)) data.charges = [];

    while (data.charges.length <= index) {
      data.charges.push({
        id: "",
        charge_name: "",
        charge_code: "",
        level: "",
        offense_classification: "",
        arrest_date: "",
        citation_date: "",
        offense_date: "",
        disposition: "",
        disposition_date: "",
        sentencing_date: "",
        release_date: "",
        probation_end_date: "",
        waiting_period_end_date: "",
        case_number: "",
        court_name: "",
        court_county: "",
        arresting_agency: "",
        prosecutor_agency: "",
        final_disposition: "",
        is_dismissed: false,
        is_convicted: false,
        is_sealable: false,
        ineligible_reason: "",
        fine_amount_due: "",
        restitution_due: "",
        notes: ""
      });
    }

    return data.charges[index];
  }

  function addCharge(initialValues) {
    const data = loadPacketData();
    const index = data.charges.length;
    ensureCharge(data, index);

    if (initialValues && typeof initialValues === "object") {
      Object.assign(data.charges[index], initialValues);
    }

    derivePacketData(data);
    savePacketData(data);
    emitDataUpdated(data);
    return index;
  }

  function removeCharge(index) {
    const data = loadPacketData();

    if (!Array.isArray(data.charges)) data.charges = [];
    if (index < 0 || index >= data.charges.length) return data;

    data.charges.splice(index, 1);
    derivePacketData(data);
    savePacketData(data);
    emitDataUpdated(data);
    return data;
  }

  function clearPacketData() {
    const data = createEmptyPacketData();
    ensureMeta(data);
    derivePacketData(data);
    savePacketData(data);
    emitDataUpdated(data);
    return data;
  }

  function importPacketData(rawObject) {
    const base = createEmptyPacketData();
    const merged = deepMerge(base, rawObject || {});
    ensureMeta(merged);
    derivePacketData(merged);
    savePacketData(merged);
    emitDataUpdated(merged);
    return merged;
  }

  function exportPacketData(pretty = true) {
    const data = loadPacketData();
    derivePacketData(data);
    savePacketData(data);
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  function bindJsonTextarea(textarea) {
    if (!textarea) return;

    const data = loadPacketData();
    textarea.value = JSON.stringify(data, null, 2);

    const syncOut = () => {
      const latest = loadPacketData();
      textarea.value = JSON.stringify(latest, null, 2);
    };

    document.addEventListener("recordpath:data-updated", syncOut);

    textarea.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(textarea.value);
        importPacketData(parsed);
      } catch (err) {
        console.error("Invalid JSON import:", err);
        alert("Invalid JSON.");
      }
    });
  }

  function initPage(root = document) {
    const data = loadPacketData();
    derivePacketData(data);
    savePacketData(data);
    bindPathInputs(root, data);
    refreshComputedFields(root, data);
    emitDataUpdated(data);
    return data;
  }

  window.RecordPathDataBridge = {
    STORAGE_KEY,
    createEmptyPacketData,
    loadPacketData,
    savePacketData,
    clearPacketData,
    importPacketData,
    exportPacketData,
    derivePacketData,
    setValueByPath,
    getValueByPath,
    ensureCharge,
    addCharge,
    removeCharge,
    bindJsonTextarea,
    initPage
  };
})();
