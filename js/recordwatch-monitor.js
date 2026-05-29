(function () {
  "use strict";

  const TASK_KEYS = [
    "courtDocketChecked",
    "stateRepositoryChecked",
    "certifiedDispositionRequested",
    "backgroundCheckChecked",
    "dataBrokerChecked",
    "disputePacketGenerated",
    "followUpNeeded",
    "correctedVerified"
  ];

  const TASK_LABELS = {
    courtDocketChecked: "Court docket checked",
    stateRepositoryChecked: "State repository checked",
    certifiedDispositionRequested: "Certified disposition requested",
    backgroundCheckChecked: "Background check company checked",
    dataBrokerChecked: "Data broker checked",
    disputePacketGenerated: "Dispute packet generated",
    followUpNeeded: "Follow-up needed",
    correctedVerified: "Corrected / verified"
  };

  function safeParse(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(`Unable to parse ${key}:`, error);
      return fallback;
    }
  }

  function loadProfile() {
    return safeParse("recordwatchProfile", {});
  }

  function loadCases() {
    const cases = safeParse("recordwatchCases", []);
    return Array.isArray(cases) ? cases : [];
  }

  function loadTasks() {
    const tasks = safeParse("recordwatchTasks", {});
    return tasks && typeof tasks === "object" && !Array.isArray(tasks) ? tasks : {};
  }

  function saveTasks(tasks) {
    localStorage.setItem("recordwatchTasks", JSON.stringify(tasks || {}));
  }

  function generateDefaultTasks(caseId) {
    return TASK_KEYS.reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, { caseId });
  }

  function getCaseTasks(caseId) {
    const tasks = loadTasks();
    if (!tasks[caseId]) {
      tasks[caseId] = generateDefaultTasks(caseId);
      saveTasks(tasks);
    }
    return tasks[caseId];
  }

  function updateTask(caseId, taskKey, completed) {
    const tasks = loadTasks();
    tasks[caseId] = Object.assign(generateDefaultTasks(caseId), tasks[caseId] || {});
    tasks[caseId][taskKey] = Boolean(completed);
    tasks[caseId].updatedAt = new Date().toISOString();
    saveTasks(tasks);
    return tasks[caseId];
  }

  function calculateMonitoringStatus(caseData, tasks) {
    const caseTasks = Object.assign(generateDefaultTasks(caseData?.id || "case"), tasks || {});
    const completedCount = TASK_KEYS.filter((key) => caseTasks[key]).length;
    const eligibilityStatus = window.RecordWatchRules?.calculateCaseStatus(caseData);

    if (caseTasks.correctedVerified) return "Verified Corrected";
    if (caseTasks.followUpNeeded) return "Follow-Up Needed";
    if (eligibilityStatus === "Eligible now") return "Eligible";
    if (completedCount === 0) return "Not Started";
    if (completedCount > 0) return "In Progress";
    return "Waiting";
  }

  function exportRecordWatchData() {
    return {
      exportedAt: new Date().toISOString(),
      profile: loadProfile(),
      cases: loadCases(),
      tasks: loadTasks(),
      reliefPlan: safeParse("recordwatchReliefPlan", null)
    };
  }

  window.RecordWatchMonitor = {
    TASK_KEYS,
    TASK_LABELS,
    loadProfile,
    loadCases,
    loadTasks,
    saveTasks,
    generateDefaultTasks,
    getCaseTasks,
    updateTask,
    calculateMonitoringStatus,
    exportRecordWatchData
  };
})();
