(function () {
  "use strict";

  var ARCHIVE_KEY = "recordwatchArchivedCaseIds";
  var PAUSED_KEY = "recordwatchPausedReminderCaseIds";

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (error) { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value; }
  function esc(value) { return String(value || "").replace(/[&<>'"]/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]; }); }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function caseKey(caseData) { return clean(caseData && (caseData.id || caseData.caseId || caseData.caseNumber || caseData.court && caseData.court.caseNumber)); }
  function caseNumber(caseData) { return clean(caseData && (caseData.caseNumber || caseData.court && caseData.court.caseNumber)); }
  function courtName(caseData) { return clean(caseData && (caseData.courtName || caseData.court || caseData.court && (caseData.court.courtName || caseData.court.name))); }
  function countyState(caseData) {
    var court = caseData && caseData.court || {};
    return [caseData && (caseData.county || court.county), caseData && (caseData.caseState || court.caseState || court.state)].filter(Boolean).join(", ");
  }
  function chargeSummary(caseData) {
    var charges = Array.isArray(caseData && caseData.charges) ? caseData.charges : [];
    return charges.map(function (charge) { return [charge.chargeName || charge.offense_name || charge.offense, charge.degree || charge.chargeLevel || charge.level].filter(Boolean).join(" — "); }).filter(Boolean).join("; ") || clean(caseData && caseData.chargeName) || "No charges entered";
  }
  function archivedIds() { return readJSON(ARCHIVE_KEY, []); }
  function pausedIds() { return readJSON(PAUSED_KEY, []); }
  function isArchived(caseData) { return archivedIds().indexOf(caseKey(caseData)) !== -1; }
  function isPaused(caseData) { return pausedIds().indexOf(caseKey(caseData)) !== -1; }
  function setPaused(caseData, paused) {
    var key = caseKey(caseData);
    var ids = pausedIds().filter(function (id) { return id !== key; });
    if (paused && key) ids.push(key);
    writeJSON(PAUSED_KEY, ids);
    return ids;
  }
  function resolveEligibility(caseData) {
    if (window.RecordPathEligibilityEngine && typeof RecordPathEligibilityEngine.resolveEligibilityForCase === "function") return RecordPathEligibilityEngine.resolveEligibilityForCase(caseData);
    if (window.RecordWatchRules && RecordWatchRules.calculateEligibilityResult) return RecordWatchRules.calculateEligibilityResult(caseData);
    return { estimatedEligibleDate: caseData && caseData.estimatedEligibleDate || "" };
  }
  function formatDate(value) {
    if (window.RecordPathDateUtils && RecordPathDateUtils.formatDate) return RecordPathDateUtils.formatDate(value);
    if (window.RecordWatchRules && RecordWatchRules.formatDate) return RecordWatchRules.formatDate(value);
    return value || "Not available";
  }
  function dedupe(cases) {
    var seen = {};
    return (cases || []).filter(function (caseData) {
      var key = caseKey(caseData);
      if (!key || seen[key] || isArchived(caseData)) return false;
      seen[key] = true;
      return true;
    });
  }
  function normalizeAccountCase(row) {
    if (!row) return null;
    if (row.court && typeof row.court === "object") return row;
    return {
      id: row.id || row.caseId || row.caseNumber,
      caseId: row.id || row.caseId,
      caseNumber: row.caseNumber,
      court: { courtName: row.court || row.courtName || "", county: row.county || "", caseState: row.caseState || "" },
      outcome: { outcome: row.eligibilityStatus || "" },
      charges: row.charges || [],
      estimatedEligibleDate: row.estimatedEligibleDate || "",
      packetStatus: row.packetStatus || "Not generated",
      paymentStatus: row.paymentStatus || "Unpaid",
      updatedAt: row.updatedAt
    };
  }
  async function loadSavedCases() {
    var local = window.RecordWatchMonitor ? RecordWatchMonitor.loadCases() : readJSON("recordwatchCases", []);
    var account = [];
    if (window.RecordPathUserStore) {
      try { account = (await RecordPathUserStore.getCasesAsync()).map(normalizeAccountCase).filter(Boolean); } catch (error) { account = (RecordPathUserStore.getCases ? RecordPathUserStore.getCases() : []).map(normalizeAccountCase).filter(Boolean); }
    }
    return dedupe(local.concat(account));
  }
  async function deleteCase(caseData) {
    var key = caseKey(caseData);
    if (!key) return;
    var ids = archivedIds().filter(function (id) { return id !== key; });
    ids.push(key);
    writeJSON(ARCHIVE_KEY, ids);
    var local = readJSON("recordwatchCases", []).filter(function (item) { return caseKey(item) !== key; });
    writeJSON("recordwatchCases", local);
    if (window.RecordPathSupabase && /^[0-9a-f-]{36}$/i.test(key)) {
      try {
        var supabase = await RecordPathSupabase.getClient();
        await supabase.from("cases").delete().eq("id", key);
        if (window.RecordPathUserStore && RecordPathUserStore.getCasesAsync) await RecordPathUserStore.getCasesAsync();
      } catch (error) { console.warn("Saved case archive fallback:", error.message); }
    }
  }
  function url(page, caseData) {
    var key = encodeURIComponent(caseKey(caseData));
    return page + (key ? "?caseId=" + key : "");
  }
  function cardHtml(caseData, options) {
    var result = resolveEligibility(caseData);
    var status = window.RecordWatchRules && RecordWatchRules.calculateCaseStatus ? RecordWatchRules.calculateCaseStatus(caseData) : (caseData.eligibilityStatus || "Needs review");
    var paused = isPaused(caseData);
    return '<article class="case-card saved-case-card" data-saved-case-id="' + esc(caseKey(caseData)) + '">' +
      '<div class="case-header"><div><p class="eyebrow-mini">Saved / monitored case</p><h3>' + esc(courtName(caseData) || "Saved case") + '</h3><p class="muted">' + esc([caseNumber(caseData), countyState(caseData)].filter(Boolean).join(" • ") || "Case details saved") + '</p></div><span class="status-badge">' + esc(paused ? "Reminders paused" : status) + '</span></div>' +
      '<div class="detail-list"><div class="detail-row"><strong>Eligibility date</strong><span>' + esc(formatDate(result.estimatedEligibleDate || caseData.estimatedEligibleDate)) + '</span></div><div class="detail-row"><strong>Source of truth</strong><span>' + esc(result.source || "RecordWatch") + '</span></div><div class="detail-row"><strong>Charges</strong><span>' + esc(chargeSummary(caseData)) + '</span></div></div>' +
      '<div class="hero-actions"><a class="btn" href="' + esc(url("record-details.html", caseData)) + '" data-resume-case>Resume</a><a class="btn secondary" href="' + esc(url("recordwatch-dashboard.html", caseData)) + '" data-open-recordwatch>Open RecordWatch</a><a class="btn secondary" href="' + esc(url("record-details.html", caseData)) + '" data-edit-record-details>Edit Record Details</a><a class="btn secondary" href="' + esc(url("packet.html", caseData)) + '" data-open-packet>Open Packet</a><button class="btn secondary" type="button" data-toggle-reminders="' + esc(caseKey(caseData)) + '">' + (paused ? "Resume Reminders" : "Pause Reminders") + '</button><button class="btn danger" type="button" data-delete-case="' + esc(caseKey(caseData)) + '">Delete / Archive</button></div>' +
      '</article>';
  }
  async function render(container, options) {
    options = options || {};
    var node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return [];
    var cases = await loadSavedCases();
    var selectedId = clean(options.caseId || new URLSearchParams(window.location.search).get("caseId"));
    var notice = options.noticeNode || null;
    if (selectedId && !cases.some(function (item) { return caseKey(item) === selectedId || caseNumber(item) === selectedId; }) && notice) {
      notice.textContent = "We could not find that saved case. Showing all saved RecordWatch cases instead.";
    }
    node.innerHTML = cases.length ? cases.map(function (caseData) { return cardHtml(caseData, options); }).join("") : '<div class="empty-state"><h2>No saved cases yet</h2><p>Start at eligibility, continue through record details, or use Advanced Case Intake to create a monitored case.</p><a class="btn" href="recordwatch-intake.html?new=1">Advanced Case Intake</a></div>';
    node.querySelectorAll("[data-toggle-reminders]").forEach(function (button) {
      button.addEventListener("click", function () {
        var current = cases.find(function (item) { return caseKey(item) === button.dataset.toggleReminders; });
        setPaused(current, !isPaused(current));
        render(node, options);
        document.dispatchEvent(new CustomEvent("recordwatch:case-reminder-toggle", { detail: { caseId: button.dataset.toggleReminders } }));
      });
    });
    node.querySelectorAll("[data-delete-case]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var current = cases.find(function (item) { return caseKey(item) === button.dataset.deleteCase; });
        if (!current || !confirm("Archive this saved case from RecordWatch? Ledger and payment history will not be deleted.")) return;
        await deleteCase(current);
        await render(node, options);
        document.dispatchEvent(new CustomEvent("recordwatch:case-archived", { detail: { caseId: button.dataset.deleteCase } }));
      });
    });
    return cases;
  }

  window.RecordPathSavedCaseCards = { render: render, loadSavedCases: loadSavedCases, deleteCase: deleteCase, setPaused: setPaused, isPaused: isPaused, resolveEligibility: resolveEligibility, caseKey: caseKey };
}());
