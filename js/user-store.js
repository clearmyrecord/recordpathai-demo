(function () {
  "use strict";

  const USERS_KEY = "recordPathDemoUsers";
  const SESSION_KEY = "recordPathDemoCurrentUserId";
  const DRAFT_KEY = "recordPathAccountDraft";
  const RETURN_KEY = "recordPathAuthReturnUrl";

  function nowIso() { return new Date().toISOString(); }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("Could not read local user store key:", key, error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function getUsers() {
    return readJSON(USERS_KEY, []);
  }

  function saveUsers(users) {
    writeJSON(USERS_KEY, users);
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || "",
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function setCurrentUser(userId) {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
  }

  function getCurrentUser() {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return publicUser(getUsers().find((user) => user.id === id));
  }

  function signup({ fullName, email, phone, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!fullName || !String(fullName).trim()) throw new Error("Full name is required.");
    if (!normalizedEmail) throw new Error("Email is required.");

    const users = getUsers();
    const existing = users.find((user) => normalizeEmail(user.email) === normalizedEmail);
    if (existing) {
      return login({ email: normalizedEmail, password });
    }

    const timestamp = nowIso();
    const user = {
      id: createId("user"),
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      phone: String(phone || "").trim(),
      password: String(password || ""),
      createdAt: timestamp,
      lastLoginAt: timestamp
    };

    users.push(user);
    saveUsers(users);
    setCurrentUser(user.id);
    mergeDraftIntoUser(user.id);
    return publicUser(user);
  }

  function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const users = getUsers();
    const user = users.find((candidate) => normalizeEmail(candidate.email) === normalizedEmail);
    if (!user) throw new Error("No demo account found for that email.");
    if (user.password && password && user.password !== String(password)) {
      throw new Error("Demo password does not match.");
    }
    user.lastLoginAt = nowIso();
    saveUsers(users);
    setCurrentUser(user.id);
    mergeDraftIntoUser(user.id);
    return publicUser(user);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function updateCurrentUser(updates) {
    const current = getCurrentUser();
    if (!current) throw new Error("Sign in before updating account details.");
    const users = getUsers();
    const user = users.find((candidate) => candidate.id === current.id);
    if (!user) throw new Error("Current demo account was not found.");
    user.fullName = String(updates.fullName || user.fullName || "").trim();
    user.email = normalizeEmail(updates.email || user.email);
    user.phone = String(updates.phone || "").trim();
    saveUsers(users);
    return publicUser(user);
  }

  function caseKey(userId) {
    return `recordPathDemoCases:${userId}`;
  }

  function getCases(userId) {
    const id = userId || (getCurrentUser() && getCurrentUser().id);
    if (!id) return [];
    return readJSON(caseKey(id), []);
  }

  function saveCases(userId, cases) {
    writeJSON(caseKey(userId), cases);
  }

  function getPacketData() {
    const keys = ["recordPathPacketData", "recordPathEligibilityIntake"];
    for (const key of keys) {
      const value = readJSON(key, null);
      if (value) return value;
    }
    return {};
  }

  function firstNonEmpty() {
    for (const value of arguments) {
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  }

  function flattenCharge(charge) {
    if (!charge) return "";
    return firstNonEmpty(charge.charge_name, charge.offense_name, charge.offense, charge.name);
  }

  function collectCurrentCaseFromStorage(overrides) {
    const packet = getPacketData();
    const charges = Array.isArray(packet.charges) ? packet.charges : [];
    const first = charges[0] || {};
    const eligibility = packet.eligibility || {};
    const court = packet.court || {};
    const timestamp = nowIso();
    const chargeNames = charges.map(flattenCharge).filter(Boolean);
    const caseNumber = firstNonEmpty(court.case_number, first.case_number, localStorage.getItem("caseNumber"));

    return Object.assign({
      caseId: firstNonEmpty(caseNumber && `case_${String(caseNumber).replace(/[^a-z0-9]+/gi, "_")}`, createId("case")),
      caseState: firstNonEmpty(first.case_state, court.state, eligibility.state_ruleset, localStorage.getItem("caseState"), localStorage.getItem("state")),
      county: firstNonEmpty(first.court_county, court.county, localStorage.getItem("county")),
      court: firstNonEmpty(first.court_name, court.name, localStorage.getItem("court")),
      caseNumber,
      charges: chargeNames.length ? chargeNames : [firstNonEmpty(localStorage.getItem("offense"))].filter(Boolean),
      eligibilityStatus: firstNonEmpty(eligibility.status, eligibility.statusLabel, localStorage.getItem("eligibilityStatus"), "Not screened yet"),
      estimatedEligibleDate: firstNonEmpty(eligibility.estimated_eligible_on, eligibility.estimatedEligibleDate, localStorage.getItem("estimatedEligibleDate")),
      packetStatus: localStorage.getItem("recordPathPacketGeneratedAt") ? "Generated" : "Not generated",
      paymentStatus: (localStorage.getItem("recordPathPacketPaymentComplete") === "true" || localStorage.getItem("recordPathPaymentComplete") === "true") ? "Paid" : "Unpaid",
      createdAt: timestamp,
      updatedAt: timestamp
    }, overrides || {});
  }

  function saveCase(caseInput) {
    const current = getCurrentUser();
    if (!current) throw new Error("Sign in before saving progress.");
    const nextCase = Object.assign(collectCurrentCaseFromStorage(), caseInput || {});
    if (!nextCase.caseId) nextCase.caseId = createId("case");
    const cases = getCases(current.id);
    const existingIndex = cases.findIndex((item) => item.caseId === nextCase.caseId || (item.caseNumber && item.caseNumber === nextCase.caseNumber));
    if (existingIndex >= 0) {
      nextCase.createdAt = cases[existingIndex].createdAt || nextCase.createdAt;
      nextCase.updatedAt = nowIso();
      cases[existingIndex] = Object.assign({}, cases[existingIndex], nextCase);
    } else {
      cases.push(nextCase);
    }
    saveCases(current.id, cases);
    return nextCase;
  }

  function saveDraftSnapshot(returnUrl) {
    const draft = {
      savedAt: nowIso(),
      returnUrl: returnUrl || `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search || ""}`,
      localKeys: {}
    };
    [
      "recordPathPacketData", "recordPathEligibilityIntake", "recordPathLandingData",
      "recordwatchProfile", "recordwatchCases", "fullName", "firstName", "lastName",
      "email", "phone", "caseState", "state", "county", "court", "caseNumber",
      "offense", "offenseCode", "outcome", "dispositionDate", "dischargeDate"
    ].forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) draft.localKeys[key] = value;
    });
    writeJSON(DRAFT_KEY, draft);
    if (returnUrl) localStorage.setItem(RETURN_KEY, returnUrl);
    return draft;
  }

  function mergeDraftIntoUser(userId) {
    const draft = readJSON(DRAFT_KEY, null);
    if (!draft) return null;
    Object.keys(draft.localKeys || {}).forEach((key) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, draft.localKeys[key]);
    });
    const current = getCurrentUser();
    if (current && current.id === userId) {
      const caseData = collectCurrentCaseFromStorage();
      if (caseData.caseNumber || caseData.charges.length || caseData.court || caseData.county) {
        saveCase(caseData);
      }
    }
    return draft;
  }

  function getReturnUrl(defaultUrl) {
    const params = new URLSearchParams(window.location.search);
    return params.get("returnUrl") || localStorage.getItem(RETURN_KEY) || defaultUrl || "dashboard.html";
  }

  function clearReturnUrl() {
    localStorage.removeItem(RETURN_KEY);
  }

  window.RecordPathUserStore = {
    signup,
    login,
    logout,
    getCurrentUser,
    updateCurrentUser,
    getCases,
    saveCase,
    collectCurrentCaseFromStorage,
    saveDraftSnapshot,
    getReturnUrl,
    clearReturnUrl,
    isLoggedIn: function () { return Boolean(getCurrentUser()); },
    keys: { USERS_KEY, SESSION_KEY, DRAFT_KEY, RETURN_KEY }
  };
}());
