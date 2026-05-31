(function () {
  "use strict";

  var TASK_KEYS = [
    "courtDocketChecked",
    "stateRepositoryChecked",
    "certifiedDispositionRequested",
    "backgroundCheckChecked",
    "dataBrokerChecked",
    "disputePacketGenerated",
    "followUpNeeded",
    "correctedVerified"
  ];

  function parseJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function loadProfile() { return parseJSON("recordwatchProfile", {}); }
  function loadCases() {
    var cases = parseJSON("recordwatchCases", []);
    if (window.RecordWatchBridge && typeof RecordWatchBridge.registerRecordWatchEligibility === "function") {
      cases.forEach(function (caseData) { RecordWatchBridge.registerRecordWatchEligibility(caseData); });
      localStorage.setItem("recordwatchCases", JSON.stringify(cases));
    }
    return cases;
  }
  function loadTasks() { return parseJSON("recordwatchTasks", {}); }
  function saveTasks(tasks) { localStorage.setItem("recordwatchTasks", JSON.stringify(tasks || {})); }
  function loadReminderStatuses() { return parseJSON("recordwatchReminderStatuses", {}); }
  function saveReminderStatuses(statuses) { localStorage.setItem("recordwatchReminderStatuses", JSON.stringify(statuses || {})); }
  function getReminderStatus(caseId) { return loadReminderStatuses()[caseId] || "active"; }
  function setReminderStatus(caseId, status) { var statuses = loadReminderStatuses(); statuses[caseId] = status || "active"; saveReminderStatuses(statuses); return statuses[caseId]; }

  function generateDefaultTasks(caseId) {
    var defaults = {};
    TASK_KEYS.forEach(function (key) { defaults[key] = false; });
    if (caseId) {
      var tasks = loadTasks();
      tasks[caseId] = Object.assign({}, defaults, tasks[caseId] || {});
      saveTasks(tasks);
      return tasks[caseId];
    }
    return defaults;
  }

  function getCaseTasks(caseId) {
    var tasks = loadTasks();
    if (!tasks[caseId]) return generateDefaultTasks(caseId);
    tasks[caseId] = Object.assign(generateDefaultTasks(), tasks[caseId]);
    saveTasks(tasks);
    return tasks[caseId];
  }

  function updateTask(caseId, taskKey, completed) {
    var tasks = loadTasks();
    tasks[caseId] = Object.assign(generateDefaultTasks(), tasks[caseId] || {});
    tasks[caseId][taskKey] = Boolean(completed);
    saveTasks(tasks);
    return tasks[caseId];
  }

  function calculateMonitoringStatus(caseData, tasks) {
    var caseTasks = tasks || getCaseTasks(caseData && caseData.id);
    if (caseTasks.correctedVerified) return "Verified Corrected";
    if (caseTasks.followUpNeeded) return "Follow-Up Needed";

    var completedCount = TASK_KEYS.filter(function (key) { return caseTasks[key]; }).length;
    if (completedCount === 0) return "Not Started";

    var eligibilityStatus = window.RecordWatchRules ? window.RecordWatchRules.calculateCaseStatus(caseData) : "";
    if (eligibilityStatus === "Eligible now") return "Eligible";
    if (completedCount > 0) return "In Progress";
    return "Waiting";
  }

  function exportRecordWatchData() {
    return {
      exportedAt: new Date().toISOString(),
      profile: loadProfile(),
      cases: loadCases(),
      tasks: loadTasks(),
      reliefPlan: parseJSON("recordwatchReliefPlan", null)
    };
  }

  window.RecordWatchMonitor = {
    taskKeys: TASK_KEYS,
    loadProfile: loadProfile,
    loadCases: loadCases,
    loadTasks: loadTasks,
    saveTasks: saveTasks,
    generateDefaultTasks: generateDefaultTasks,
    getCaseTasks: getCaseTasks,
    updateTask: updateTask,
    calculateMonitoringStatus: calculateMonitoringStatus,
    getReminderStatus: getReminderStatus,
    setReminderStatus: setReminderStatus,
    exportRecordWatchData: exportRecordWatchData
  };
}());
