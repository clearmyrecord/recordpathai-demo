(function () {
  "use strict";

  var DELETE_MESSAGE = "Delete this saved case? This will remove it from your dashboard and RecordWatch list. This does not delete any official court records.";

  function esc(value) { return String(value || "").replace(/[&<>'"]/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]; }); }
  function idOf(caseData) { return caseData && (caseData.case_id || caseData.caseId || caseData.id || caseData.caseNumber); }
  function fmtDate(value) {
    if (!value) return "Not available";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  function statusClass(value) {
    var text = String(value || "not screened").toLowerCase();
    if (text.includes("eligible") && !text.includes("not")) return "eligible";
    if (text.includes("review") || text.includes("need")) return "needs-review";
    if (text.includes("generated") || text.includes("paid") || text.includes("ready")) return "generated";
    if (text.includes("archive")) return "archived";
    return "not-screened";
  }
  function field(label, value) { return '<div class="saved-case-meta"><strong>' + esc(label) + '</strong><span>' + esc(value || "Not entered") + '</span></div>'; }
  function withCase(url, caseData) { return url + "?caseId=" + encodeURIComponent(idOf(caseData) || ""); }
  function normalize(caseData) { return window.RecordPathUserStore && RecordPathUserStore.normalizeCase ? RecordPathUserStore.normalizeCase(caseData) : (caseData || {}); }

  function emptyState() {
    return '<div class="empty-state saved-case-empty"><h2>No saved cases yet</h2><p>Start an eligibility check or enter record details to save your first case.</p><div class="hero-actions"><a class="btn" href="eligibility.html">Start Eligibility Check</a><a class="btn secondary" href="record-details.html">Enter Record Details</a></div></div>';
  }

  function card(caseData, options) {
    var item = normalize(caseData);
    var id = idOf(item);
    var eligibility = item.eligibilityStatus || "Not Screened";
    var packet = item.packetStatus || "Not Generated";
    var recordWatch = item.recordWatchStatus || "Not Activated";
    var actions = options && options.recordWatchMode ?
      '<button class="btn" type="button" data-case-action="open" data-case-id="' + esc(id) + '">Open</button>' +
      '<button class="btn secondary" type="button" data-case-action="edit" data-case-id="' + esc(id) + '">Edit</button>' +
      '<button class="btn secondary" type="button" data-case-action="packet" data-case-id="' + esc(id) + '">Packet</button>' +
      '<button class="btn secondary" type="button" data-case-action="toggle-reminders" data-case-id="' + esc(id) + '">' + (recordWatch === "Paused" ? "Resume Reminders" : "Pause Reminders") + '</button>' +
      '<button class="btn danger" type="button" data-case-action="delete" data-case-id="' + esc(id) + '">Delete / Archive</button>' :
      '<button class="btn" type="button" data-case-action="resume" data-case-id="' + esc(id) + '">Resume</button>' +
      '<button class="btn secondary" type="button" data-case-action="edit" data-case-id="' + esc(id) + '">Edit Record Details</button>' +
      '<button class="btn secondary" type="button" data-case-action="packet" data-case-id="' + esc(id) + '">Open Packet</button>' +
      '<button class="btn secondary" type="button" data-case-action="recordwatch" data-case-id="' + esc(id) + '">Open RecordWatch</button>' +
      '<button class="btn danger" type="button" data-case-action="delete" data-case-id="' + esc(id) + '">Delete</button>';
    return '<article class="saved-case-card" data-case-id="' + esc(id) + '">' +
      '<div class="saved-case-header"><div><p class="eyebrow-mini">Case Number</p><h3 class="saved-case-title">' + esc(item.caseNumber || id || "No case number") + '</h3></div><span class="case-status-badge ' + statusClass(eligibility) + '">' + esc(eligibility) + '</span></div>' +
      '<div class="saved-case-status-row"><span class="case-status-badge ' + statusClass(packet) + '">Packet: ' + esc(packet) + '</span><span class="case-status-badge ' + statusClass(recordWatch) + '">RecordWatch: ' + esc(recordWatch) + '</span></div>' +
      '<div class="saved-case-detail-grid">' +
      field("Court", item.courtName || item.court) +
      field("County / State", [item.county, item.caseState].filter(Boolean).join(", ")) +
      field("Primary Charge", item.primaryCharge || (item.charges || [])[0]) +
      field("Estimated Eligibility Date", fmtDate(item.estimatedEligibleDate)) +
      field("Last Updated", fmtDate(item.lastUpdated || item.updatedAt)) +
      '</div><div class="saved-case-actions">' + actions + '</div></article>';
  }

  function render(container, cases, options) {
    if (!container) return;
    container.classList.add("saved-case-grid");
    container.innerHTML = cases && cases.length ? cases.map(function (item) { return card(item, options || {}); }).join("") : emptyState();
  }

  async function handleAction(action, caseId, rerender) {
    if (!window.RecordPathUserStore) return;
    var item = await RecordPathUserStore.setActiveCase(caseId);
    if (!item && action !== "delete") {
      alert("We could not find that saved case. Please choose another case from your dashboard.");
      return;
    }
    if (action === "resume" || action === "open") window.location.href = RecordPathUserStore.getNextStepForCase(item) + "?caseId=" + encodeURIComponent(caseId);
    if (action === "edit") window.location.href = withCase("record-details.html", item);
    if (action === "packet") window.location.href = withCase("packet.html", item);
    if (action === "recordwatch") window.location.href = withCase("recordwatch-dashboard.html", item);
    if (action === "toggle-reminders") {
      var currentReminderStatus = window.RecordWatchMonitor && RecordWatchMonitor.getReminderStatus ? RecordWatchMonitor.getReminderStatus(caseId) : "active";
      var nextStatus = item.recordWatchStatus === "Paused" || currentReminderStatus === "paused" ? "Active" : "Paused";
      await RecordPathUserStore.updateCase(caseId, { recordWatchStatus: nextStatus });
      if (window.RecordWatchMonitor && RecordWatchMonitor.setReminderStatus) RecordWatchMonitor.setReminderStatus(caseId, nextStatus.toLowerCase());
      if (rerender) rerender();
    }
    if (action === "delete") {
      if (!confirm(DELETE_MESSAGE)) return;
      await RecordPathUserStore.deleteCase(caseId);
      if (rerender) rerender();
    }
  }

  function bind(container, rerender) {
    if (!container) return;
    container.addEventListener("click", function (event) {
      var button = event.target.closest("[data-case-action]");
      if (!button) return;
      handleAction(button.dataset.caseAction, button.dataset.caseId, rerender).catch(function (error) {
        console.error(error);
        alert(error.message || "We could not update that saved case.");
      });
    });
  }

  window.RecordPathSavedCaseCards = { render: render, bind: bind, handleAction: handleAction, formatDate: fmtDate, emptyState: emptyState };
}());
