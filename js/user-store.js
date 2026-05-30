(function () {
  "use strict";

  const USERS_KEY = "recordPathDemoUsers";
  const SESSION_KEY = "recordPathDemoCurrentUserId";
  const DRAFT_KEY = "recordPathAccountDraft";
  const RETURN_KEY = "recordPathAuthReturnUrl";
  const LEGACY_IMPORT_DISMISSED_KEY = "recordPathLegacyImportDismissed";

  let currentUser = null;
  let cachedCases = [];
  let initPromise = null;

  function nowIso() { return new Date().toISOString(); }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("Could not read local key:", key, error);
      return fallback;
    }
  }

  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
  function legacyUsers() { return readJSON(USERS_KEY, []); }

  function publicUser(authUser, profile) {
    if (!authUser) return null;
    const metadata = authUser.user_metadata || {};
    return {
      id: authUser.id,
      fullName: (profile && profile.full_name) || metadata.full_name || metadata.name || "",
      email: (profile && profile.email) || authUser.email || "",
      phone: (profile && profile.phone) || metadata.phone || "",
      createdAt: (profile && profile.created_at) || authUser.created_at || nowIso(),
      lastLoginAt: authUser.last_sign_in_at || authUser.updated_at || authUser.created_at || nowIso()
    };
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function client() {
    if (!window.RecordPathSupabase) throw new Error("Supabase client was not loaded.");
    const supabase = await window.RecordPathSupabase.getClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    return supabase;
  }

  async function loadProfile(authUser) {
    const supabase = await client();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
    if (error) console.warn("Profile lookup failed:", error.message);
    return data || null;
  }

  async function upsertProfile(authUser, updates) {
    const supabase = await client();
    const payload = {
      id: authUser.id,
      email: normalizeEmail((updates && updates.email) || authUser.email),
      full_name: String((updates && updates.fullName) || (updates && updates.full_name) || authUser.user_metadata?.full_name || authUser.user_metadata?.name || "").trim(),
      phone: String((updates && updates.phone) || authUser.user_metadata?.phone || "").trim()
    };
    const { data, error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) throw new Error(error.message);
    currentUser = publicUser(authUser, data);
    return currentUser;
  }

  async function init() {
    if (!initPromise) {
      initPromise = (async function () {
        try {
          const supabase = await client();
          const { data, error } = await supabase.auth.getUser();
          if (error || !data || !data.user) {
            currentUser = null;
            cachedCases = [];
            return null;
          }
          const profile = await loadProfile(data.user);
          currentUser = publicUser(data.user, profile);
          await refreshCases();
          return currentUser;
        } catch (error) {
          console.warn("Supabase auth initialization skipped:", error.message);
          currentUser = null;
          cachedCases = [];
          return null;
        } finally {
          document.dispatchEvent(new CustomEvent("recordpath:auth-ready", { detail: { user: currentUser } }));
        }
      }());
    }
    return initPromise;
  }

  async function signup({ fullName, email, phone, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!fullName || !String(fullName).trim()) throw new Error("Full name is required.");
    if (!normalizedEmail) throw new Error("Email is required.");
    if (!password || String(password).length < 6) throw new Error("Password must be at least 6 characters.");

    const supabase = await client();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: String(password),
      options: { data: { full_name: String(fullName).trim(), phone: String(phone || "").trim() } }
    });
    if (error) throw new Error(error.message);
    if (data && data.user) await upsertProfile(data.user, { fullName, email: normalizedEmail, phone });
    await maybeImportDraftAfterLogin();
    await refreshCases();
    return currentUser;
  }

  async function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const supabase = await client();
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: String(password || "") });
    if (error) throw new Error(error.message);
    const profile = await loadProfile(data.user);
    currentUser = publicUser(data.user, profile);
    if (!profile) await upsertProfile(data.user, { email: normalizedEmail });
    await maybeImportDraftAfterLogin();
    await refreshCases();
    return currentUser;
  }

  async function loginWithGoogle(returnUrl) {
    if (returnUrl) localStorage.setItem(RETURN_KEY, returnUrl);
    const supabase = await client();
    const redirectTo = `${window.location.origin}${window.location.pathname}?returnUrl=${encodeURIComponent(returnUrl || getReturnUrl("dashboard.html"))}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw new Error(error.message);
  }

  async function sendPasswordReset(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("Enter your email address first.");
    const supabase = await client();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/login.html?returnUrl=${encodeURIComponent(getReturnUrl("dashboard.html"))}`
    });
    if (error) throw new Error(error.message);
  }

  async function logout() {
    const supabase = await client();
    await supabase.auth.signOut();
    currentUser = null;
    cachedCases = [];
  }

  async function updateCurrentUser(updates) {
    await init();
    if (!currentUser) throw new Error("Sign in before updating account details.");
    const supabase = await client();
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) throw new Error("Current Supabase account was not found.");
    if (updates.email && normalizeEmail(updates.email) !== normalizeEmail(userData.user.email)) {
      const { error } = await supabase.auth.updateUser({ email: normalizeEmail(updates.email) });
      if (error) throw new Error(error.message);
    }
    return upsertProfile(userData.user, updates);
  }

  function getPacketData() {
    for (const key of ["recordPathPacketData", "recordPathEligibilityIntake"]) {
      const value = readJSON(key, null);
      if (value) return value;
    }
    return {};
  }

  function firstNonEmpty() {
    for (const value of arguments) if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    return "";
  }

  function flattenCharge(charge) {
    if (!charge) return "";
    return firstNonEmpty(charge.charge_name, charge.offense_name, charge.offense, charge.name, charge.chargeName);
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

  function normalizeDbCase(row) {
    return {
      id: row.id,
      caseId: row.id,
      caseState: row.case_state || "",
      county: row.county || "",
      court: row.court || "",
      caseNumber: row.case_number || "",
      charges: [],
      eligibilityStatus: row.eligibility_status || "Not screened yet",
      estimatedEligibleDate: row.estimated_eligible_date || "",
      packetStatus: row.packet_status || "Not generated",
      paymentStatus: row.payment_status || "Unpaid",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async function refreshCases() {
    await initUserOnly();
    if (!currentUser) {
      cachedCases = [];
      return cachedCases;
    }
    const supabase = await client();
    const { data, error } = await supabase.from("cases").select("*").eq("user_id", currentUser.id).order("updated_at", { ascending: true });
    if (error) throw new Error(error.message);
    cachedCases = (data || []).map(normalizeDbCase);
    return cachedCases;
  }

  async function initUserOnly() {
    if (currentUser) return currentUser;
    const supabase = await client();
    const { data } = await supabase.auth.getUser();
    if (!data || !data.user) return null;
    currentUser = publicUser(data.user, await loadProfile(data.user));
    return currentUser;
  }

  function getCases() { return cachedCases.slice(); }
  async function getCasesAsync() { return refreshCases(); }

  async function saveCase(caseInput) {
    await init();
    if (!currentUser) throw new Error("Sign in before saving progress.");
    const nextCase = Object.assign(collectCurrentCaseFromStorage(), caseInput || {});
    const supabase = await client();
    let existing = null;
    if (nextCase.caseNumber) {
      const lookup = await supabase.from("cases").select("*").eq("user_id", currentUser.id).eq("case_number", nextCase.caseNumber).maybeSingle();
      if (lookup.error) throw new Error(lookup.error.message);
      existing = lookup.data;
    } else if (nextCase.id && /^[0-9a-f-]{36}$/i.test(nextCase.id)) {
      const lookup = await supabase.from("cases").select("*").eq("user_id", currentUser.id).eq("id", nextCase.id).maybeSingle();
      if (lookup.error) throw new Error(lookup.error.message);
      existing = lookup.data;
    }
    const payload = {
      user_id: currentUser.id,
      case_state: nextCase.caseState || null,
      county: nextCase.county || null,
      court: nextCase.court || null,
      case_number: nextCase.caseNumber || null,
      eligibility_status: nextCase.eligibilityStatus || null,
      estimated_eligible_date: nextCase.estimatedEligibleDate || null,
      packet_status: nextCase.packetStatus || null,
      payment_status: nextCase.paymentStatus || null,
      updated_at: nowIso()
    };
    if (existing) payload.id = existing.id;
    const { data, error } = await supabase.from("cases").upsert(payload).select("*").single();
    if (error) throw new Error(error.message);
    await refreshCases();
    return normalizeDbCase(data);
  }

  function saveDraftSnapshot(returnUrl) {
    const draft = { savedAt: nowIso(), returnUrl: returnUrl || `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search || ""}`, localKeys: {} };
    ["recordPathPacketData", "recordPathEligibilityIntake", "recordPathLandingData", "recordwatchProfile", "recordwatchCases", "fullName", "firstName", "lastName", "email", "phone", "caseState", "state", "county", "court", "caseNumber", "offense", "offenseCode", "outcome", "dispositionDate", "dischargeDate"].forEach(function (key) {
      const value = localStorage.getItem(key);
      if (value !== null) draft.localKeys[key] = value;
    });
    writeJSON(DRAFT_KEY, draft);
    if (returnUrl) localStorage.setItem(RETURN_KEY, returnUrl);
    return draft;
  }

  async function maybeImportDraftAfterLogin() {
    const draft = readJSON(DRAFT_KEY, null);
    if (!draft) return null;
    Object.keys(draft.localKeys || {}).forEach(function (key) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, draft.localKeys[key]);
    });
    const caseData = collectCurrentCaseFromStorage();
    if (caseData.caseNumber || caseData.charges.length || caseData.court || caseData.county) await saveCase(caseData).catch(function (error) { console.warn("Draft import skipped:", error.message); });
    return draft;
  }

  function getReturnUrl(defaultUrl) {
    const params = new URLSearchParams(window.location.search);
    return params.get("returnUrl") || localStorage.getItem(RETURN_KEY) || defaultUrl || "dashboard.html";
  }
  function clearReturnUrl() { localStorage.removeItem(RETURN_KEY); }

  function hasLegacyDemoData() {
    if (localStorage.getItem(LEGACY_IMPORT_DISMISSED_KEY) === "true") return false;
    if (legacyUsers().length) return true;
    if (readJSON(DRAFT_KEY, null)) return true;
    return Object.keys(localStorage).some(function (key) { return key.indexOf("recordPathDemoCases:") === 0; });
  }

  async function importLegacyDemoData() {
    await init();
    if (!currentUser) throw new Error("Sign in before importing demo data.");
    const users = legacyUsers();
    const currentLegacyId = localStorage.getItem(SESSION_KEY) || (users[0] && users[0].id);
    const legacyUser = users.find(function (user) { return user.id === currentLegacyId; }) || users[0];
    if (legacyUser) await updateCurrentUser({ fullName: legacyUser.fullName, email: currentUser.email, phone: legacyUser.phone });
    const cases = readJSON(`recordPathDemoCases:${currentLegacyId}`, []);
    for (const item of cases) await saveCase(item);
    await maybeImportDraftAfterLogin();
    localStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, "true");
    return { casesImported: cases.length, profileImported: Boolean(legacyUser) };
  }

  function dismissLegacyImport() { localStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, "true"); }

  window.RecordPathUserStore = {
    ready: init(),
    signup,
    login,
    loginWithGoogle,
    sendPasswordReset,
    logout,
    getCurrentUser: function () { return currentUser; },
    refreshCurrentUser: init,
    updateCurrentUser,
    getCases,
    getCasesAsync,
    saveCase,
    collectCurrentCaseFromStorage,
    saveDraftSnapshot,
    getReturnUrl,
    clearReturnUrl,
    hasLegacyDemoData,
    importLegacyDemoData,
    dismissLegacyImport,
    isLoggedIn: function () { return Boolean(currentUser); },
    keys: { USERS_KEY, SESSION_KEY, DRAFT_KEY, RETURN_KEY, LEGACY_IMPORT_DISMISSED_KEY }
  };
}());
