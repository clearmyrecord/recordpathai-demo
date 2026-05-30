(function () {
  "use strict";

  const STORAGE_KEY = "recordPathWorkflowState";
  const STEPS = [
    { id: "eligibility", label: "Check Eligibility", href: "eligibility.html" },
    { id: "record-details", label: "Record Details", href: "record-details.html" },
    { id: "packet", label: "Packet Generation", href: "packet.html" }
  ];

  function parseJSON(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (_error) { return fallback; }
  }

  function normalizeStateValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const upper = raw.toUpperCase();
    if (upper === "OHIO") return "OH";
    if (upper === "NEVADA") return "NV";
    if (upper === "CALIFORNIA") return "CA";
    if (upper === "ARIZONA") return "AZ";
    if (upper === "TEXAS") return "TX";
    if (upper === "FLORIDA") return "FL";
    return upper;
  }

  function hasText(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
  }

  function readPacketData() {
    if (window.RecordPathDataBridge && typeof RecordPathDataBridge.loadPacketData === "function") {
      try {
        const data = RecordPathDataBridge.loadPacketData();
        if (typeof RecordPathDataBridge.derivePacketData === "function") RecordPathDataBridge.derivePacketData(data);
        return data || {};
      } catch (error) {
        console.warn("Workflow packet data load skipped:", error);
      }
    }
    return parseJSON(localStorage.getItem("recordPathPacketData"), {});
  }

  function getEligibilityIntake() {
    return parseJSON(localStorage.getItem("recordPathEligibilityIntake"), {});
  }

  function deriveEligibilityComplete() {
    const intake = getEligibilityIntake();
    const petitioner = intake.petitioner || {};
    const fullName = petitioner.full_name || localStorage.getItem("fullName") || [localStorage.getItem("firstName"), localStorage.getItem("lastName")].filter(Boolean).join(" ");
    const caseState = normalizeStateValue(intake.case?.state || localStorage.getItem("caseState") || localStorage.getItem("state"));
    const hasContact = hasText(fullName) || hasText(petitioner.email) || hasText(localStorage.getItem("email"));
    return Boolean(hasContact && caseState);
  }

  function hasUsableCharge(charge) {
    if (!charge || typeof charge !== "object") return false;
    return [
      charge.charge_name,
      charge.offense_name,
      charge.charge_code,
      charge.case_number,
      charge.court_name,
      charge.disposition,
      charge.final_disposition
    ].some(hasText);
  }

  function deriveRecordDetailsComplete() {
    const data = readPacketData();
    const charges = Array.isArray(data.charges) ? data.charges : [];
    const hasCharge = charges.some(hasUsableCharge);
    const hasCaseNumber = hasText(data.court?.case_number) || hasText(localStorage.getItem("caseNumber"));
    const hasCourtRouting = hasText(data.court?.state) || hasText(data.meta?.source_state) || hasText(localStorage.getItem("caseState"));
    return Boolean((hasCharge || hasCaseNumber) && hasCourtRouting);
  }

  function baseState() {
    return {
      eligibilityCompleted: false,
      recordDetailsCompleted: false,
      packetGenerated: false,
      updatedAt: null
    };
  }

  function getStoredState() {
    return Object.assign(baseState(), parseJSON(localStorage.getItem(STORAGE_KEY), {}));
  }

  function getState() {
    const state = getStoredState();
    if (!state.eligibilityCompleted && deriveEligibilityComplete()) state.eligibilityCompleted = true;
    if (!state.recordDetailsCompleted && state.eligibilityCompleted && deriveRecordDetailsComplete()) state.recordDetailsCompleted = true;
    if (!state.packetGenerated && hasText(localStorage.getItem("recordPathPacketGeneratedAt"))) state.packetGenerated = true;
    return state;
  }

  function saveState(partial) {
    const next = Object.assign(getStoredState(), partial || {}, { updatedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function markEligibilityComplete(extra) {
    return saveState(Object.assign({ eligibilityCompleted: true }, extra || {}));
  }

  function markRecordDetailsComplete(extra) {
    return saveState(Object.assign({ eligibilityCompleted: true, recordDetailsCompleted: true }, extra || {}));
  }

  function markPacketGenerated() {
    return saveState({ packetGenerated: true, packetGeneratedAt: new Date().toISOString() });
  }

  function isStepLocked(stepId) {
    const state = getState();
    if (stepId === "record-details") return !state.eligibilityCompleted;
    if (stepId === "packet") return !state.eligibilityCompleted || !state.recordDetailsCompleted;
    return false;
  }

  function firstIncompleteHrefFor(stepId) {
    const state = getState();
    if (stepId === "record-details" && !state.eligibilityCompleted) return "eligibility.html";
    if (stepId === "packet") {
      if (!state.eligibilityCompleted) return "eligibility.html";
      if (!state.recordDetailsCompleted) return "record-details.html";
    }
    return null;
  }

  function guardPage(stepId) {
    const redirect = firstIncompleteHrefFor(stepId);
    if (!redirect) return true;
    sessionStorage.setItem("recordPathWorkflowRedirectReason", stepId);
    window.location.replace(redirect);
    return false;
  }

  function getStepStatus(stepId, currentStep) {
    const state = getState();
    if (stepId === "eligibility" && state.eligibilityCompleted) return "completed";
    if (stepId === "record-details" && state.recordDetailsCompleted) return "completed";
    if (stepId === currentStep) return "current";
    if (isStepLocked(stepId)) return "locked";
    return stepId === currentStep ? "current" : "available";
  }

  function renderProgress(currentStep) {
    const host = document.querySelector("[data-workflow-progress]");
    if (!host) return;
    const state = getState();
    const completed = [state.eligibilityCompleted, state.recordDetailsCompleted, state.packetGenerated].filter(Boolean).length;
    host.innerHTML = `
      <div class="workflow-progress-card" aria-label="Consumer workflow progress">
        <div class="workflow-progress-header">
          <span class="workflow-progress-kicker">Consumer workflow</span>
          <strong>${completed} of ${STEPS.length} steps completed</strong>
        </div>
        <ol class="workflow-steps">
          ${STEPS.map(function (step, index) {
            const status = getStepStatus(step.id, currentStep);
            const locked = status === "locked";
            const statusLabel = status === "completed" ? "Completed" : status === "current" ? "Current" : locked ? "Locked" : "Available";
            return `<li class="workflow-step is-${status}">
              <a href="${step.href}" data-workflow-link="${step.id}" aria-disabled="${locked ? "true" : "false"}">
                <span class="workflow-step-number">${index + 1}</span>
                <span class="workflow-step-text"><span>${step.label}</span><small>${statusLabel}</small></span>
              </a>
            </li>`;
          }).join("")}
        </ol>
      </div>`;
    wireWorkflowLinks(host);
  }

  function decorateNavigation() {
    document.querySelectorAll("[data-workflow-link]").forEach(function (link) {
      const step = link.getAttribute("data-workflow-link");
      const locked = isStepLocked(step);
      link.classList.toggle("is-locked", locked);
      link.setAttribute("aria-disabled", locked ? "true" : "false");
      if (locked) link.setAttribute("title", "Complete the previous workflow step first.");
      else link.removeAttribute("title");
    });
  }

  function wireWorkflowLinks(root) {
    (root || document).querySelectorAll("[data-workflow-link]").forEach(function (link) {
      if (link.dataset.workflowGuardAttached === "true") return;
      link.dataset.workflowGuardAttached = "true";
      link.addEventListener("click", function (event) {
        const step = link.getAttribute("data-workflow-link");
        const redirect = firstIncompleteHrefFor(step);
        if (!redirect) return;
        event.preventDefault();
        window.location.href = redirect;
      });
    });
    decorateNavigation();
  }

  function getMissingPacketPrerequisites() {
    const state = getState();
    const missing = [];
    if (!state.eligibilityCompleted) missing.push("Complete Check Eligibility before packet generation.");
    if (!state.recordDetailsCompleted) missing.push("Complete Record Details before packet generation.");
    const data = readPacketData();
    const charges = Array.isArray(data.charges) ? data.charges : [];
    if (!charges.some(hasUsableCharge) && !hasText(data.court?.case_number)) missing.push("Add at least one charge or case number.");
    return missing;
  }

  window.RecordPathWorkflow = {
    STEPS,
    getState,
    saveState,
    markEligibilityComplete,
    markRecordDetailsComplete,
    markPacketGenerated,
    isStepLocked,
    firstIncompleteHrefFor,
    guardPage,
    renderProgress,
    decorateNavigation,
    wireWorkflowLinks,
    getMissingPacketPrerequisites
  };

  document.addEventListener("DOMContentLoaded", function () {
    wireWorkflowLinks(document);
    decorateNavigation();
  });
}());
