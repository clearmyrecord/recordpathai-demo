(function () {
  "use strict";

  const USERS_KEY = "recordPathDemoUsers";
  const SESSION_KEY = "recordPathDemoCurrentUserId";
  const DRAFT_KEY = "recordPathAccountDraft";
  const RETURN_KEY = "recordPathAuthReturnUrl";
  const LEGACY_IMPORT_DISMISSED_KEY = "recordPathLegacyImportDismissed";
  const LOCAL_CASES_KEY = "recordPathSavedCases";
  const FALLBACK_CASES_KEY = "recordPathCachedCases";
  const TEMP_DRAFT_CASE_KEY = "temporaryDraftCase";
  const ACTIVE_CASE_KEY = "recordPathActiveCaseId";
  const OLD_CASE_KEYS = ["recordPathSavedCases", "recordPathCachedCases", "savedCases", "recordPathCases", "recordpathai_cases", "recordwatchCases", "currentCase", "activeCase"];
  const SENSITIVE_CASE_KEYS = ["caseNumber", "caseState", "state", "county", "court", "offense", "offenseCode", "outcome", "eligibilityStatus", "estimatedEligibleDate", "dispositionDate", "dischargeDate", "recordPathPacketData", "recordPathEligibilityIntake"];

  let currentUser = null;
  let cachedCases = [];
  let initPromise = null;
  let casesPromise = null;
  let lastCaseLoadError = null;
  let lastMigrationError = null;
  let supabaseCasesUnavailable = false;

  const LOGIN_INVALID_CREDENTIALS_MESSAGE = "Email or password is incorrect. If you just confirmed your email, use Reset Password to set a new password.";
  const SIGNUP_ACCOUNT_EXISTS_MESSAGE = "Account already exists. Please log in or reset your password.";
  const SIGNUP_PARTIAL_SUCCESS_MESSAGE = "Your account was created, but we could not finish setting up your profile. Please confirm your email, then use Reset Password if login says your password is incorrect.";

  function authError(message, code, details) {
    const error = new Error(message);
    error.code = code || "auth_error";
    if (details) Object.assign(error, details);
    return error;
  }

  function errorCode(error) { return String((error && (error.code || error.status || error.name)) || "").toLowerCase(); }
  function errorMessage(error) { return String((error && error.message) || error || "").toLowerCase(); }

  function isInvalidCredentialsError(error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    return code === "invalid_credentials" || message.includes("invalid login credentials");
  }

  function isAccountExistsSignupError(error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    return code === "user_already_exists" || code === "email_exists" || code === "email_address_exists" || message.includes("already registered") || message.includes("already exists") || message.includes("user already");
  }

  function signUpReturnedExistingUser(data) {
    const identities = data && data.user && data.user.identities;
    return Array.isArray(identities) && identities.length === 0;
  }

  function decodeReturnUrl(value) {
    let current = String(value || "").trim();
    for (let i = 0; i < 4; i += 1) {
      try {
        const decoded = decodeURIComponent(current);
        if (decoded === current) break;
        current = decoded;
      } catch (_error) { break; }
    }
    return current;
  }

  function authPageName(value) {
    const decoded = decodeReturnUrl(value).replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");
    const page = (decoded.split(/[?#]/)[0].split("/").pop() || "").toLowerCase();
    return page === "login.html" || page === "signup.html" ? page : "";
  }

  function nestedReturnUrl(value) {
    const decoded = decodeReturnUrl(value);
    const query = decoded.split("?")[1] || "";
    const params = new URLSearchParams(query.split("#")[0] || "");
    return params.get("returnUrl") || "";
  }

  function sanitizeReturnUrl(returnUrl, fallback) {
    let target = decodeReturnUrl(returnUrl || "");
    const fallbackTarget = fallback || "dashboard.html";
    for (let i = 0; i < 4 && authPageName(target); i += 1) target = nestedReturnUrl(target) || fallbackTarget;
    if (!target || authPageName(target)) target = fallbackTarget;
    if (/^\/\//.test(target) || (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^https?:\/\//i.test(target))) target = fallbackTarget;
    if (/^https?:\/\//i.test(target)) {
      try {
        const url = new URL(target);
        target = url.origin === window.location.origin ? `${url.pathname.replace(/^\//, "")}${url.search}${url.hash}` : fallbackTarget;
      } catch (_error) { target = fallbackTarget; }
    } else {
      target = target.replace(/^\/+/, "");
    }
    return target;
  }

  function authRedirectUrl() {
    const basePath = window.location.pathname.replace(/[^/]*$/, "");
    return `${window.location.origin}${basePath}login.html?returnUrl=${encodeURIComponent(getReturnUrl("dashboard.html"))}`;
  }

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

  function supabaseUnavailableError(message) {
    return authError(message || (window.RecordPathSupabase && RecordPathSupabase.missingConfigMessage) || "Supabase is not configured. Ask an administrator to set the public Supabase URL and anon key.", "supabase_unavailable");
  }

  async function client() {
    if (!window.RecordPathSupabase) throw supabaseUnavailableError("Supabase client was not loaded. Ask an administrator to confirm js/supabase-client.js is included before js/user-store.js.");
    try {
      const supabase = await window.RecordPathSupabase.getClient();
      if (!supabase) throw supabaseUnavailableError();
      return supabase;
    } catch (error) {
      if (error && (error.code === "supabase_config_missing" || String(error.message || "").toLowerCase().includes("supabase is not configured"))) throw supabaseUnavailableError(error.message);
      throw error;
    }
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

  function clearCaseLoadWarnings() {
    lastCaseLoadError = null;
    supabaseCasesUnavailable = false;
  }

  function clearCaseWarnings() {
    clearCaseLoadWarnings();
    lastMigrationError = null;
  }

  function getCaseLoadStatus() {
    return {
      lastCaseLoadError,
      lastMigrationError,
      supabaseCasesUnavailable,
      message: supabaseCasesUnavailable ? "We could not load your saved cases yet. Your account is still signed in." : (lastMigrationError ? "Your account is signed in, but we could not migrate local draft cases yet." : "")
    };
  }

  function rememberCaseLoadError(error, context) {
    lastCaseLoadError = error || new Error("Saved cases could not be loaded.");
    supabaseCasesUnavailable = true;
    console.warn(context || "Supabase saved case load failed:", lastCaseLoadError);
    document.dispatchEvent(new CustomEvent("recordpath:cases-warning", { detail: getCaseLoadStatus() }));
    return activeCases(cachedCases);
  }

  function startCaseInitialization() {
    if (!currentUser) return Promise.resolve([]);
    if (!casesPromise) {
      casesPromise = (async function () {
        try {
          try {
            await maybeImportDraftAfterLogin();
            await migrateLocalCasesToSupabase();
          } catch (migrationError) {
            lastMigrationError = migrationError;
            console.warn("Local draft case migration skipped:", migrationError);
            document.dispatchEvent(new CustomEvent("recordpath:cases-warning", { detail: getCaseLoadStatus() }));
          }
          const cases = await refreshCases({ allowFallback: false });
          clearCaseLoadWarnings();
          document.dispatchEvent(new CustomEvent("recordpath:cases-ready", { detail: { cases } }));
          return cases;
        } catch (error) {
          rememberCaseLoadError(error, "Supabase saved case initialization skipped:");
          return activeCases(cachedCases);
        }
      }());
    }
    return casesPromise;
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
            casesPromise = Promise.resolve([]);
            return null;
          }
          const profile = await loadProfile(data.user);
          currentUser = publicUser(data.user, profile);
          casesPromise = null;
          startCaseInitialization();
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
    if (error) {
      if (isAccountExistsSignupError(error)) throw authError(SIGNUP_ACCOUNT_EXISTS_MESSAGE, "account_exists");
      throw new Error(error.message);
    }
    if (signUpReturnedExistingUser(data)) throw authError(SIGNUP_ACCOUNT_EXISTS_MESSAGE, "account_exists");
    if (data && data.user) {
      try {
        await upsertProfile(data.user, { fullName, email: normalizedEmail, phone });
      } catch (profileError) {
        console.warn("Profile setup failed after signup:", profileError);
        try { await supabase.auth.signOut(); } catch (signOutError) { console.warn("Could not clear partial signup session:", signOutError); }
        currentUser = null;
        throw authError(SIGNUP_PARTIAL_SUCCESS_MESSAGE, "signup_partial_success", { accountCreated: true });
      }
    }
    initPromise = Promise.resolve(currentUser);
    casesPromise = null;
    startCaseInitialization();
    return currentUser;
  }

  async function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const supabase = await client();
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: String(password || "") });
    if (error) {
      if (isInvalidCredentialsError(error)) throw authError(LOGIN_INVALID_CREDENTIALS_MESSAGE, "invalid_credentials");
      throw new Error(error.message);
    }
    const profile = await loadProfile(data.user);
    currentUser = publicUser(data.user, profile);
    if (!profile) await upsertProfile(data.user, { email: normalizedEmail });
    initPromise = Promise.resolve(currentUser);
    casesPromise = null;
    startCaseInitialization();
    return currentUser;
  }

  async function loginWithGoogle(returnUrl) {
    const target = sanitizeReturnUrl(returnUrl || getReturnUrl("dashboard.html"), "dashboard.html");
    if (target) localStorage.setItem(RETURN_KEY, target);
    const supabase = await client();
    const redirectTo = `${window.location.origin}${window.location.pathname}?returnUrl=${encodeURIComponent(target)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw new Error(error.message);
  }

  async function sendPasswordReset(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("Enter your email address first.");
    const supabase = await client();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: authRedirectUrl() });
    if (error) throw new Error(error.message);
  }

  async function updatePasswordAfterReset(password) {
    if (!password || String(password).length < 6) throw new Error("Password must be at least 6 characters.");
    const supabase = await client();
    const { error } = await supabase.auth.updateUser({ password: String(password) });
    if (error) throw new Error(error.message);
    await supabase.auth.signOut();
    currentUser = null;
    cachedCases = [];
    initPromise = Promise.resolve(null);
    casesPromise = Promise.resolve([]);
    clearCaseWarnings();
  }

  async function logout() {
    const supabase = await client();
    await supabase.auth.signOut();
    currentUser = null;
    cachedCases = [];
    initPromise = Promise.resolve(null);
    casesPromise = Promise.resolve([]);
    clearCaseWarnings();
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
    return firstNonEmpty(charge.charge_name, charge.offense_name, charge.offense, charge.name, charge.chargeName, charge.charge_name_text);
  }

  function normalizeDate(value) {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const text = String(value).trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? text : new Date(parsed).toISOString().slice(0, 10);
  }

  function normalizeStatus(value, fallback) {
    return firstNonEmpty(value, fallback || "");
  }

  function statusForDb(value, fallback) {
    const text = String(firstNonEmpty(value, fallback || "")).trim().toLowerCase();
    if (!text) return fallback || null;
    if (text.includes("paid")) return "paid";
    if (text.includes("generated")) return "generated";
    if (text.includes("ready")) return "ready";
    if (text.includes("review")) return "reviewed";
    if (text.includes("pause")) return "paused";
    if (text.includes("active")) return "active";
    if (text.includes("not") && text.includes("activate")) return "not_activated";
    if (text.includes("not") && text.includes("generate")) return "not_generated";
    return text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || (fallback || null);
  }

  function collectCurrentCaseFromStorage(overrides) {
    const packet = getPacketData();
    const charges = Array.isArray(packet.charges) ? packet.charges : [];
    const first = charges[0] || {};
    const eligibility = packet.eligibility || {};
    const court = packet.court || {};
    const timestamp = nowIso();
    const chargeNames = charges.map(flattenCharge).filter(Boolean);
    const caseNumber = firstNonEmpty(court.case_number, court.caseNumber, first.case_number, localStorage.getItem("caseNumber"));
    const generatedCaseId = firstNonEmpty(localStorage.getItem(ACTIVE_CASE_KEY), caseNumber && `case_${String(caseNumber).replace(/[^a-z0-9]+/gi, "_")}`, createId("case"));
    const courtName = firstNonEmpty(first.court_name, court.name, court.courtName, localStorage.getItem("court"));
    const primaryCharge = firstNonEmpty(flattenCharge(first), localStorage.getItem("offense"));
    return normalizeCase(Object.assign({
      case_id: generatedCaseId,
      caseId: generatedCaseId,
      caseState: firstNonEmpty(first.case_state, court.state, eligibility.state_ruleset, localStorage.getItem("caseState"), localStorage.getItem("state")),
      county: firstNonEmpty(first.court_county, court.county, localStorage.getItem("county")),
      courtName,
      court: courtName,
      courtType: firstNonEmpty(court.type, court.courtType),
      courtId: firstNonEmpty(court.id, court.court_id),
      ruleSetId: firstNonEmpty(eligibility.rule_set_id, eligibility.ruleSetId),
      reliefType: firstNonEmpty(eligibility.relief_type, eligibility.reliefType),
      caseNumber,
      charges: chargeNames.length ? charges : [primaryCharge].filter(Boolean),
      primaryCharge,
      offenseCode: firstNonEmpty(first.statute_citation, first.offense_code, localStorage.getItem("offenseCode")),
      level: firstNonEmpty(first.level, first.charge_level),
      outcome: firstNonEmpty(first.disposition, first.final_disposition, localStorage.getItem("outcome")),
      dispositionDate: firstNonEmpty(first.disposition_date, localStorage.getItem("dispositionDate")),
      dischargeDate: firstNonEmpty(first.discharge_date, localStorage.getItem("dischargeDate")),
      eligibilityStatus: firstNonEmpty(eligibility.statusLabel, eligibility.status, localStorage.getItem("eligibilityStatus"), "Not screened yet"),
      eligibilityDate: firstNonEmpty(eligibility.estimatedEligibleDate, eligibility.estimated_eligible_on, eligibility.eligibility_date, localStorage.getItem("estimatedEligibleDate")),
      estimatedEligibleDate: firstNonEmpty(eligibility.estimatedEligibleDate, eligibility.estimated_eligible_on, eligibility.eligibility_date, localStorage.getItem("estimatedEligibleDate")),
      eligibilityConfidence: firstNonEmpty(eligibility.confidence, eligibility.eligibility_confidence),
      eligibilityReasons: Array.isArray(eligibility.reasons) ? eligibility.reasons : [],
      requiredWaitingPeriod: firstNonEmpty(eligibility.requiredWaitingPeriod, eligibility.required_waiting_period),
      dateUsedForCalculation: firstNonEmpty(eligibility.dateUsedForCalculation, eligibility.date_used_for_calculation),
      packetStatus: localStorage.getItem("recordPathPacketGeneratedAt") ? "generated" : "not_generated",
      recordWatchStatus: localStorage.getItem("recordwatchActiveCaseId") ? "active" : "not_activated",
      paymentStatus: (localStorage.getItem("recordPathPacketPaymentComplete") === "true" || localStorage.getItem("recordPathPaymentComplete") === "true") ? "paid" : "unpaid",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUpdated: timestamp
    }, overrides || {}));
  }

  function normalizeCharges(source) {
    const charges = Array.isArray(source && source.charges) ? source.charges : [];
    if (!charges.length && (source.primaryCharge || source.charge)) return [{ charge_name: source.primaryCharge || source.charge, offense_code: source.offenseCode || source.offense_code, offense_level: source.level || source.offenseLevel || source.offense_level, offense_date: source.offenseDate || source.offense_date }];
    return charges.map(function (charge) {
      if (typeof charge === "string") return { charge_name: charge };
      return {
        id: charge.id,
        charge_name: flattenCharge(charge),
        offense_code: firstNonEmpty(charge.offense_code, charge.offenseCode, charge.statute_citation),
        offense_level: firstNonEmpty(charge.offense_level, charge.offenseLevel, charge.level, charge.chargeLevel, charge.degree),
        offense_date: normalizeDate(firstNonEmpty(charge.offense_date, charge.offenseDate)),
        charge_notes: firstNonEmpty(charge.charge_notes, charge.notes),
        flags: charge.flags && typeof charge.flags === "object" ? charge.flags : {}
      };
    }).filter(function (charge) { return firstNonEmpty(charge.charge_name, charge.offense_code, charge.offense_level); });
  }

  function normalizeCase(input) {
    const source = input || {};
    const nestedCourt = source.court && typeof source.court === "object" ? source.court : {};
    const chargeRows = normalizeCharges(source);
    const firstCharge = chargeRows[0] || {};
    const updated = firstNonEmpty(source.updatedAt, source.updated_at, source.lastUpdated, source.createdAt, source.created_at, nowIso());
    const id = firstNonEmpty(source.case_id, source.caseId, source.id, source.caseNumber, source.case_number);
    const eligibilityDate = normalizeDate(firstNonEmpty(source.eligibilityDate, source.eligibility_date, source.estimatedEligibleDate, source.estimated_eligible_date, source.estimated_eligible_on));
    const packetStatus = normalizeStatus(source.packetStatus || source.packet_status, "not_generated");
    const recordWatchStatus = normalizeStatus(source.recordWatchStatus || source.recordwatch_status || (source.recordWatchPaused ? "paused" : ""), "not_activated");
    return {
      id,
      case_id: id,
      caseId: id,
      caseNumber: firstNonEmpty(source.caseNumber, source.case_number, nestedCourt.caseNumber),
      caseState: firstNonEmpty(source.caseState, source.case_state, nestedCourt.caseState, nestedCourt.state),
      county: firstNonEmpty(source.county, nestedCourt.county),
      courtName: firstNonEmpty(source.courtName, source.court_name, typeof source.court === "string" ? source.court : "", nestedCourt.courtName, nestedCourt.name),
      court: firstNonEmpty(source.courtName, source.court_name, typeof source.court === "string" ? source.court : "", nestedCourt.courtName, nestedCourt.name),
      courtType: firstNonEmpty(source.courtType, source.court_type, nestedCourt.courtType, nestedCourt.type),
      courtId: firstNonEmpty(source.courtId, source.court_id, nestedCourt.courtId, nestedCourt.id),
      ruleSetId: firstNonEmpty(source.ruleSetId, source.rule_set_id),
      localProfileId: firstNonEmpty(source.localProfileId, source.local_profile_id),
      reliefType: firstNonEmpty(source.reliefType, source.relief_type),
      charges: chargeRows.map(function (charge) { return charge.charge_name; }).filter(Boolean),
      chargeDetails: chargeRows,
      primaryCharge: firstNonEmpty(source.primaryCharge, source.primary_charge, source.charge, firstCharge.charge_name),
      offenseCode: firstNonEmpty(source.offenseCode, source.offense_code, firstCharge.offense_code),
      offenseLevel: firstNonEmpty(source.offenseLevel, source.offense_level, source.level, source.chargeLevel, firstCharge.offense_level),
      level: firstNonEmpty(source.level, source.chargeLevel, source.offenseLevel, source.offense_level, firstCharge.offense_level),
      outcome: firstNonEmpty(source.outcome, source.disposition),
      arrestDate: normalizeDate(firstNonEmpty(source.arrestDate, source.arrest_date)),
      offenseDate: normalizeDate(firstNonEmpty(source.offenseDate, source.offense_date, firstCharge.offense_date)),
      dispositionDate: normalizeDate(firstNonEmpty(source.dispositionDate, source.disposition_date)),
      sentenceCompletionDate: normalizeDate(firstNonEmpty(source.sentenceCompletionDate, source.sentence_completion_date)),
      probationCompletedDate: normalizeDate(firstNonEmpty(source.probationCompletedDate, source.probation_completed_date)),
      dischargeDate: normalizeDate(firstNonEmpty(source.dischargeDate, source.discharge_date)),
      finalDischargeDate: normalizeDate(firstNonEmpty(source.finalDischargeDate, source.final_discharge_date)),
      eligibilityStatus: firstNonEmpty(source.eligibilityStatus, source.eligibility_status, "Not screened yet"),
      eligibilityDate,
      estimatedEligibleDate: eligibilityDate,
      eligibilityConfidence: firstNonEmpty(source.eligibilityConfidence, source.eligibility_confidence),
      eligibilityReasons: Array.isArray(source.eligibilityReasons) ? source.eligibilityReasons : (Array.isArray(source.eligibility_reasons) ? source.eligibility_reasons : []),
      requiredWaitingPeriod: firstNonEmpty(source.requiredWaitingPeriod, source.required_waiting_period),
      dateUsedForCalculation: normalizeDate(firstNonEmpty(source.dateUsedForCalculation, source.date_used_for_calculation)),
      packetStatus,
      packetGeneratedAt: firstNonEmpty(source.packetGeneratedAt, source.packet_generated_at),
      packetPaidAt: firstNonEmpty(source.packetPaidAt, source.packet_paid_at),
      recordWatchStatus,
      recordWatchPausedAt: firstNonEmpty(source.recordWatchPausedAt, source.recordwatch_paused_at),
      paymentStatus: firstNonEmpty(source.paymentStatus, source.payment_status, packetStatus === "paid" ? "paid" : "unpaid"),
      metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : {},
      createdAt: firstNonEmpty(source.createdAt, source.created_at, updated),
      updatedAt: updated,
      lastUpdated: updated,
      deletedAt: firstNonEmpty(source.deletedAt, source.deleted_at),
      archivedAt: firstNonEmpty(source.archivedAt, source.archived_at),
      status: firstNonEmpty(source.status, source.archivedAt || source.archived_at ? "archived" : (source.deletedAt || source.deleted_at ? "deleted" : "active"))
    };
  }

  function getStableCaseId(caseRecord) {
    const source = caseRecord || {};
    return String(firstNonEmpty(source.case_id, source.caseId, source.id, source.caseNumber, source.case_number)).trim();
  }

  function getCaseCompositeKey(caseRecord) {
    const source = caseRecord || {};
    const nestedCourt = source.court && typeof source.court === "object" ? source.court : {};
    const parts = [
      firstNonEmpty(source.caseNumber, source.case_number, nestedCourt.caseNumber),
      firstNonEmpty(source.courtName, source.court_name, typeof source.court === "string" ? source.court : "", nestedCourt.courtName, nestedCourt.name),
      firstNonEmpty(source.county, nestedCourt.county),
      firstNonEmpty(source.caseState, source.case_state, nestedCourt.caseState, nestedCourt.state)
    ].map(function (value) { return String(value || "").trim().toLowerCase(); });
    return parts[0] ? parts.join("|") : "";
  }

  function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }

  function hasMeaningfulCaseData(caseRecord) {
    const source = caseRecord || {};
    const normalized = normalizeCase(source);
    const caseNumber = firstNonEmpty(source.caseNumber, source.case_number, normalized.caseNumber);
    const uuidOnly = caseNumber && isUuid(caseNumber) && !firstNonEmpty(normalized.courtName, normalized.county, normalized.primaryCharge, normalized.offenseCode);
    if (uuidOnly) return false;
    const eligibility = String(firstNonEmpty(source.eligibilityStatus, source.eligibility_status, normalized.eligibilityStatus)).trim().toLowerCase();
    const packet = String(firstNonEmpty(source.packetStatus, source.packet_status, normalized.packetStatus)).trim().toLowerCase();
    return Boolean(firstNonEmpty(
      caseNumber && caseNumber !== normalized.case_id ? caseNumber : "",
      normalized.courtName,
      normalized.primaryCharge,
      normalized.offenseCode,
      eligibility && !eligibility.includes("not screened") ? eligibility : "",
      packet && !packet.includes("not_generated") && !packet.includes("not generated") ? packet : ""
    ));
  }

  function caseTimestamp(caseRecord) {
    const source = caseRecord || {};
    const value = firstNonEmpty(source.lastUpdated, source.updatedAt, source.updated_at, source.createdAt, source.created_at);
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
  }

  function usefulMerge(existing, incoming) {
    const base = existing || {};
    const update = incoming || {};
    const preferIncoming = caseTimestamp(update) >= caseTimestamp(base);
    const primary = preferIncoming ? update : base;
    const secondary = preferIncoming ? base : update;
    const merged = Object.assign({}, secondary, primary);
    Object.keys(secondary).forEach(function (key) {
      if ((merged[key] === undefined || merged[key] === null || merged[key] === "" || (Array.isArray(merged[key]) && !merged[key].length)) && secondary[key]) merged[key] = secondary[key];
    });
    return merged;
  }

  function dedupeCases(cases) {
    const normalized = (cases || []).filter(hasMeaningfulCaseData).map(normalizeCase);
    const byStable = {};
    const stableOrder = [];
    normalized.forEach(function (item) {
      const key = getStableCaseId(item);
      if (!key) return;
      if (!byStable[key]) stableOrder.push(key);
      byStable[key] = usefulMerge(byStable[key], item);
    });
    const byComposite = {};
    const compositeOrder = [];
    stableOrder.forEach(function (stableKey) {
      const item = normalizeCase(byStable[stableKey]);
      const composite = getCaseCompositeKey(item) || `id:${stableKey}`;
      if (!byComposite[composite]) compositeOrder.push(composite);
      byComposite[composite] = usefulMerge(byComposite[composite], item);
    });
    return compositeOrder.map(function (key) { return normalizeCase(byComposite[key]); });
  }

  function activeCases(cases) {
    return dedupeCases(cases).filter(function (item) { return !item.deletedAt && !item.archivedAt && item.status !== "archived" && item.status !== "deleted"; });
  }

  function loadLocalCases() { return activeCases(readJSON(FALLBACK_CASES_KEY, readJSON(LOCAL_CASES_KEY, []))); }
  function saveLocalCases(cases) { writeJSON(FALLBACK_CASES_KEY, activeCases(cases)); }

  function hasProtectedHistory(caseData) {
    const id = caseData && (caseData.case_id || caseData.caseId || caseData.id || caseData.caseNumber);
    const ledger = readJSON("recordPathPurchaseLedger", readJSON("recordPathLedger", []));
    return String(caseData && (caseData.paymentStatus || caseData.packetStatus || "")).toLowerCase().match(/paid|generated/) || ledger.some(function (entry) { return id && (entry.case_id === id || entry.caseId === id || entry.case_number === caseData.caseNumber); });
  }

  function caseToPacketData(caseData) {
    const item = normalizeCase(caseData);
    return {
      court: {
        state: item.caseState,
        county: item.county,
        name: item.courtName,
        courtName: item.courtName,
        court_id: item.courtId,
        case_number: item.caseNumber,
        caseNumber: item.caseNumber,
        case_type: item.courtType
      },
      eligibility: {
        status: item.eligibilityStatus,
        statusLabel: item.eligibilityStatus,
        eligibility_status: item.eligibilityStatus,
        estimatedEligibleDate: item.estimatedEligibleDate,
        estimated_eligible_on: item.estimatedEligibleDate,
        eligibility_date: item.eligibilityDate,
        confidence: item.eligibilityConfidence,
        reasons: item.eligibilityReasons,
        requiredWaitingPeriod: item.requiredWaitingPeriod,
        required_waiting_period: item.requiredWaitingPeriod,
        dateUsedForCalculation: item.dateUsedForCalculation,
        date_used_for_calculation: item.dateUsedForCalculation,
        rule_set_id: item.ruleSetId
      },
      charges: item.chargeDetails.length ? item.chargeDetails.map(function (charge) {
        return {
          charge_name: charge.charge_name,
          offense_name: charge.charge_name,
          case_number: item.caseNumber,
          court_name: item.courtName,
          court_county: item.county,
          case_state: item.caseState,
          statute_citation: charge.offense_code || item.offenseCode,
          offense_code: charge.offense_code || item.offenseCode,
          level: charge.offense_level || item.level,
          charge_level: charge.offense_level || item.level,
          disposition: item.outcome,
          offense_date: charge.offense_date || item.offenseDate
        };
      }) : []
    };
  }

  function writeActiveCaseToStorage(caseData) {
    const item = normalizeCase(caseData);
    if (!item.case_id) return item;
    localStorage.setItem(ACTIVE_CASE_KEY, item.case_id);
    localStorage.setItem("recordwatchActiveCaseId", item.case_id);
    writeJSON("recordPathPacketData", Object.assign({}, getPacketData(), caseToPacketData(item)));
    return item;
  }

  function toRecordWatchCase(caseData) {
    const item = normalizeCase(caseData);
    return {
      id: item.case_id,
      court: { caseNumber: item.caseNumber, courtName: item.courtName, county: item.county, caseState: item.caseState, state: item.caseState },
      charges: item.chargeDetails.length ? item.chargeDetails.map(function (charge) { return { chargeName: charge.charge_name, offense_name: charge.charge_name, degree: charge.offense_level || item.level, chargeLevel: charge.offense_level || item.level }; }) : [],
      outcome: { outcome: item.outcome },
      estimatedEligibleDate: item.estimatedEligibleDate,
      recordWatchStatus: item.recordWatchStatus
    };
  }

  function syncRecordWatchCases(cases) {
    if (currentUser) return;
    const rwCases = readJSON("recordwatchCases", []);
    const byId = {};
    rwCases.forEach(function (item) { if (item && item.id) byId[item.id] = item; });
    (cases || []).forEach(function (item) { const normalized = normalizeCase(item); if (!normalized.archivedAt && !normalized.deletedAt) byId[normalized.case_id] = Object.assign({}, byId[normalized.case_id] || {}, toRecordWatchCase(normalized)); });
    writeJSON("recordwatchCases", Object.keys(byId).map(function (id) { return byId[id]; }));
  }

  function normalizeDbCase(row) {
    const chargeRows = row.case_charges || row.charges || [];
    return normalizeCase({
      id: row.id,
      case_id: row.id,
      caseState: row.case_state || "",
      county: row.county || "",
      courtName: row.court_name || row.court || "",
      court: row.court_name || row.court || "",
      courtType: row.court_type || "",
      courtId: row.court_id || "",
      ruleSetId: row.rule_set_id || "",
      localProfileId: row.local_profile_id || "",
      reliefType: row.relief_type || "",
      caseNumber: row.case_number || "",
      charges: chargeRows,
      primaryCharge: row.primary_charge || "",
      offenseCode: row.offense_code || "",
      offenseLevel: row.offense_level || "",
      outcome: row.outcome || "",
      arrestDate: row.arrest_date,
      offenseDate: row.offense_date,
      dispositionDate: row.disposition_date,
      sentenceCompletionDate: row.sentence_completion_date,
      probationCompletedDate: row.probation_completed_date,
      dischargeDate: row.discharge_date,
      finalDischargeDate: row.final_discharge_date,
      eligibilityStatus: row.eligibility_status || "Not screened yet",
      eligibilityDate: row.eligibility_date || "",
      eligibilityConfidence: row.eligibility_confidence || "",
      eligibilityReasons: row.eligibility_reasons || [],
      requiredWaitingPeriod: row.required_waiting_period || "",
      dateUsedForCalculation: row.date_used_for_calculation || "",
      packetStatus: row.packet_status || "not_generated",
      packetGeneratedAt: row.packet_generated_at,
      packetPaidAt: row.packet_paid_at,
      recordWatchStatus: row.recordwatch_status || "not_activated",
      recordWatchPausedAt: row.recordwatch_paused_at,
      deletedAt: row.deleted_at,
      archivedAt: row.archived_at,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  function casePayload(caseData) {
    const item = normalizeCase(caseData);
    const metadata = Object.assign({}, item.metadata || {});
    if (item.paymentStatus) metadata.payment_status = item.paymentStatus;
    return {
      user_id: currentUser.id,
      case_number: item.caseNumber || null,
      case_state: item.caseState || null,
      county: item.county || null,
      court_name: item.courtName || item.court || null,
      court_type: item.courtType || null,
      court_id: item.courtId || null,
      rule_set_id: item.ruleSetId || null,
      local_profile_id: item.localProfileId || null,
      relief_type: item.reliefType || null,
      primary_charge: item.primaryCharge || null,
      offense_code: item.offenseCode || null,
      offense_level: item.offenseLevel || item.level || null,
      outcome: item.outcome || null,
      arrest_date: item.arrestDate || null,
      offense_date: item.offenseDate || null,
      disposition_date: item.dispositionDate || null,
      sentence_completion_date: item.sentenceCompletionDate || null,
      probation_completed_date: item.probationCompletedDate || null,
      discharge_date: item.dischargeDate || null,
      final_discharge_date: item.finalDischargeDate || null,
      eligibility_status: item.eligibilityStatus || null,
      eligibility_date: item.eligibilityDate || item.estimatedEligibleDate || null,
      eligibility_confidence: item.eligibilityConfidence || null,
      eligibility_reasons: item.eligibilityReasons || [],
      required_waiting_period: item.requiredWaitingPeriod || null,
      date_used_for_calculation: item.dateUsedForCalculation || null,
      packet_status: statusForDb(item.packetStatus, "not_generated"),
      packet_generated_at: item.packetGeneratedAt || null,
      packet_paid_at: item.packetPaidAt || null,
      recordwatch_status: statusForDb(item.recordWatchStatus, "not_activated"),
      recordwatch_paused_at: item.recordWatchPausedAt || null,
      metadata,
      updated_at: nowIso()
    };
  }

  async function fetchCaseCharges(supabase, caseIds) {
    if (!caseIds.length) return {};
    const { data, error } = await supabase.from("case_charges").select("*").in("case_id", caseIds).eq("user_id", currentUser.id).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).reduce(function (map, charge) {
      if (!map[charge.case_id]) map[charge.case_id] = [];
      map[charge.case_id].push(charge);
      return map;
    }, {});
  }

  async function refreshCases(options) {
    await initUserOnly();
    if (!currentUser) {
      cachedCases = [];
      syncRecordWatchCases(cachedCases);
      return cachedCases;
    }
    const supabase = await client();
    const { data, error } = await supabase.from("saved_cases").select("*").eq("user_id", currentUser.id).is("deleted_at", null).order("updated_at", { ascending: true });
    if (error) {
      const fallback = options && options.allowFallback ? activeCases(cachedCases) : [];
      if (fallback.length && options && options.allowFallback) fallback.isFallback = true;
      rememberCaseLoadError(new Error(error.message), "Supabase saved case query failed:");
      if (options && options.allowFallback) return fallback;
      throw new Error(error.message);
    }
    let chargesByCase = {};
    try {
      chargesByCase = await fetchCaseCharges(supabase, (data || []).map(function (row) { return row.id; }));
    } catch (chargeError) {
      const fallback = options && options.allowFallback ? activeCases(cachedCases) : [];
      if (fallback.length && options && options.allowFallback) fallback.isFallback = true;
      rememberCaseLoadError(chargeError, "Supabase case charge query failed:");
      if (options && options.allowFallback) return fallback;
      throw chargeError;
    }
    cachedCases = activeCases((data || []).map(function (row) { return normalizeDbCase(Object.assign({}, row, { case_charges: chargesByCase[row.id] || [] })); }));
    saveLocalCases(cachedCases);
    syncRecordWatchCases(cachedCases);
    clearCaseLoadWarnings();
    return cachedCases;
  }

  async function initUserOnly() {
    if (currentUser) return currentUser;
    try {
      const supabase = await client();
      const { data } = await supabase.auth.getUser();
      if (!data || !data.user) return null;
      currentUser = publicUser(data.user, await loadProfile(data.user));
      return currentUser;
    } catch (error) {
      return null;
    }
  }

  function getCases() { return activeCases(cachedCases.length ? cachedCases : loadLocalCases()); }
  async function getCasesAsync() { return refreshCases({ allowFallback: true }); }
  async function readyForCases() { return startCaseInitialization(); }

  function caseMatchesId(caseRecord, caseId, compositeKey) {
    const id = String(caseId || "").trim();
    if (!id || !caseRecord) return false;
    return getStableCaseId(caseRecord) === id || getCaseCompositeKey(caseRecord) === compositeKey || String(caseRecord.caseNumber || "") === id;
  }

  async function getCaseById(caseId) {
    const id = String(caseId || localStorage.getItem(ACTIVE_CASE_KEY) || "").trim();
    if (!id) return null;
    await initUserOnly();
    if (currentUser && isUuid(id)) {
      const supabase = await client();
      const { data, error } = await supabase.from("saved_cases").select("*").eq("user_id", currentUser.id).eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const charges = await fetchCaseCharges(supabase, [data.id]);
      const found = normalizeDbCase(Object.assign({}, data, { case_charges: charges[data.id] || [] }));
      cachedCases = activeCases(getCases().filter(function (item) { return item.case_id !== found.case_id; }).concat(found));
      saveLocalCases(cachedCases);
      return found;
    }
    if (currentUser) await refreshCases({ allowFallback: true }).catch(function () {});
    const compositeKey = getCaseCompositeKey({ caseNumber: id });
    return getCases().find(function (item) { return caseMatchesId(item, id, compositeKey); }) || null;
  }

  async function setActiveCase(caseId) {
    const found = await getCaseById(caseId);
    if (!found) return null;
    return writeActiveCaseToStorage(found);
  }

  async function getActiveCase() { return getCaseById(localStorage.getItem(ACTIVE_CASE_KEY)); }

  async function syncCharges(caseId, caseData) {
    const chargeRows = normalizeCase(caseData).chargeDetails;
    const supabase = await client();
    const deleteResult = await supabase.from("case_charges").delete().eq("case_id", caseId).eq("user_id", currentUser.id);
    if (deleteResult.error) throw new Error(deleteResult.error.message);
    if (!chargeRows.length) return [];
    const payload = chargeRows.map(function (charge) {
      return {
        user_id: currentUser.id,
        case_id: caseId,
        charge_name: charge.charge_name || null,
        offense_code: charge.offense_code || null,
        offense_level: charge.offense_level || null,
        offense_date: charge.offense_date || null,
        charge_notes: charge.charge_notes || null,
        flags: charge.flags || {},
        updated_at: nowIso()
      };
    });
    const { data, error } = await supabase.from("case_charges").insert(payload).select("*");
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function updateCase(caseId, updates) {
    await initUserOnly();
    const found = await getCaseById(caseId);
    if (!found) return null;
    const next = normalizeCase(Object.assign({}, found, updates || {}, { case_id: found.case_id, id: found.case_id, updatedAt: nowIso(), lastUpdated: nowIso() }));
    if (currentUser && isUuid(next.case_id)) {
      const supabase = await client();
      const payload = casePayload(next);
      if (String(next.packetStatus).toLowerCase() === "generated" && !payload.packet_generated_at) payload.packet_generated_at = nowIso();
      if ((String(next.packetStatus).toLowerCase() === "paid" || String(next.paymentStatus).toLowerCase() === "paid") && !payload.packet_paid_at) payload.packet_paid_at = nowIso();
      if (String(next.recordWatchStatus).toLowerCase() === "paused" && !payload.recordwatch_paused_at) payload.recordwatch_paused_at = nowIso();
      const { data, error } = await supabase.from("saved_cases").update(payload).eq("id", next.case_id).eq("user_id", currentUser.id).select("*").single();
      if (error) throw new Error(error.message);
      const charges = updates && updates.charges ? await syncCharges(next.case_id, next) : await fetchCaseCharges(supabase, [next.case_id]);
      const saved = normalizeDbCase(Object.assign({}, data, { case_charges: Array.isArray(charges) ? charges : (charges[next.case_id] || []) }));
      cachedCases = activeCases(getCases().filter(function (item) { return item.case_id !== saved.case_id; }).concat(saved));
      saveLocalCases(cachedCases);
      return saved;
    }
    const local = getCases().filter(function (item) { return item.case_id !== next.case_id; });
    local.push(next);
    cachedCases = activeCases(local);
    saveLocalCases(cachedCases);
    syncRecordWatchCases(cachedCases);
    return next;
  }

  function clearActiveCaseIfMatches(caseId, compositeKey) {
    [ACTIVE_CASE_KEY, "recordwatchActiveCaseId"].forEach(function (key) {
      const value = localStorage.getItem(key);
      if (value && (value === caseId || value === compositeKey)) localStorage.removeItem(key);
    });
    ["currentCase", "activeCase"].forEach(function (key) {
      const value = readJSON(key, null);
      if (value && caseMatchesId(value, caseId, compositeKey)) localStorage.removeItem(key);
    });
  }

  function removeCaseFromLocalCollections(caseId, compositeKey) {
    [FALLBACK_CASES_KEY, LOCAL_CASES_KEY, "savedCases", "recordPathCases", "recordpathai_cases"].forEach(function (key) {
      const collection = readJSON(key, null);
      if (!Array.isArray(collection)) return;
      writeJSON(key, activeCases(collection.filter(function (item) { return !caseMatchesId(item, caseId, compositeKey); })));
    });
    const rwCases = readJSON("recordwatchCases", null);
    if (Array.isArray(rwCases)) writeJSON("recordwatchCases", rwCases.filter(function (item) { return item && !caseMatchesId(item, caseId, compositeKey); }));
  }

  async function archiveCase(caseId, options) { return removeCase(caseId, Object.assign({}, options || {}, { forceArchive: true })); }
  async function deleteCase(caseId, options) { return removeCase(caseId, options || {}); }

  async function removeCase(caseId, options) {
    const normalizedId = String(caseId || "").trim();
    if (!normalizedId) return false;
    await initUserOnly();
    const found = await getCaseById(normalizedId);
    if (!found) return false;
    const foundId = getStableCaseId(found) || normalizedId;
    const compositeKey = getCaseCompositeKey(found);
    const archive = Boolean(options && options.forceArchive);
    if (currentUser && isUuid(foundId)) {
      const supabase = await client();
      const payload = archive ? { archived_at: nowIso(), updated_at: nowIso() } : { deleted_at: nowIso(), updated_at: nowIso() };
      const { error } = await supabase.from("saved_cases").update(payload).eq("id", foundId).eq("user_id", currentUser.id);
      if (error) throw new Error(error.message);
    } else if (hasProtectedHistory(found) && !(options && options.forceArchive)) {
      // Local anonymous cases cannot preserve server history; remove them locally without touching ledger/payment keys.
    }
    const remaining = getCases().filter(function (item) { return !caseMatchesId(item, foundId, compositeKey); });
    cachedCases = activeCases(remaining);
    saveLocalCases(cachedCases);
    removeCaseFromLocalCollections(foundId, compositeKey);
    clearActiveCaseIfMatches(foundId, compositeKey);
    return true;
  }

  function getNextStepForCase(caseData) {
    const item = normalizeCase(caseData);
    const eligibility = String(item.eligibilityStatus || "").toLowerCase();
    if (!eligibility || eligibility.includes("not screened")) return "eligibility.html";
    if (!item.caseNumber || !item.courtName || !item.primaryCharge) return "record-details.html";
    if (String(item.packetStatus || "").toLowerCase().includes("generated")) return "packet.html";
    return "packet.html";
  }

  async function findExistingRemoteCase(supabase, nextCase) {
    if (isUuid(nextCase.case_id)) {
      const byId = await supabase.from("saved_cases").select("*").eq("user_id", currentUser.id).eq("id", nextCase.case_id).is("deleted_at", null).maybeSingle();
      if (byId.error) throw new Error(byId.error.message);
      if (byId.data) return byId.data;
    }
    const composite = getCaseCompositeKey(nextCase);
    if (!composite || !nextCase.caseNumber) return null;
    const query = supabase.from("saved_cases").select("*").eq("user_id", currentUser.id).eq("case_number", nextCase.caseNumber).is("deleted_at", null);
    if (nextCase.courtName) query.eq("court_name", nextCase.courtName);
    if (nextCase.county) query.eq("county", nextCase.county);
    if (nextCase.caseState) query.eq("case_state", nextCase.caseState);
    const lookup = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (lookup.error) throw new Error(lookup.error.message);
    return lookup.data || null;
  }

  async function saveCase(caseInput) {
    await initUserOnly();
    const input = caseInput || {};
    const activeId = localStorage.getItem(ACTIVE_CASE_KEY);
    let base = {};
    if (activeId && input && !input.case_id && !input.caseId && !input.id && currentUser) base = await getCaseById(activeId) || {};
    const collected = Object.keys(input).length ? Object.assign({}, base, Object.keys(base).length ? {} : collectCurrentCaseFromStorage(), input) : collectCurrentCaseFromStorage();
    if (!hasMeaningfulCaseData(collected)) return null;
    const nextCase = normalizeCase(collected);
    if (!currentUser) {
      const local = getCases().filter(function (item) { return item.case_id !== nextCase.case_id && getCaseCompositeKey(item) !== getCaseCompositeKey(nextCase); });
      local.push(nextCase);
      cachedCases = activeCases(local);
      saveLocalCases(cachedCases);
      syncRecordWatchCases(cachedCases);
      localStorage.setItem(TEMP_DRAFT_CASE_KEY, JSON.stringify(nextCase));
      return nextCase;
    }
    const supabase = await client();
    const existing = await findExistingRemoteCase(supabase, nextCase);
    const payload = casePayload(nextCase);
    if (String(nextCase.packetStatus).toLowerCase().includes("generated") && !payload.packet_generated_at) payload.packet_generated_at = nowIso();
    if ((String(nextCase.packetStatus).toLowerCase().includes("paid") || String(nextCase.paymentStatus).toLowerCase().includes("paid")) && !payload.packet_paid_at) payload.packet_paid_at = nowIso();
    if (String(nextCase.recordWatchStatus).toLowerCase().includes("pause") && !payload.recordwatch_paused_at) payload.recordwatch_paused_at = nowIso();
    if (existing) payload.id = existing.id;
    const { data, error } = await supabase.from("saved_cases").upsert(payload).select("*").single();
    if (error) throw new Error(error.message);
    const charges = await syncCharges(data.id, nextCase);
    const saved = normalizeDbCase(Object.assign({}, data, { case_charges: charges }));
    cachedCases = activeCases(getCases().filter(function (item) { return item.case_id !== saved.case_id && getCaseCompositeKey(item) !== getCaseCompositeKey(saved); }).concat(saved));
    saveLocalCases(cachedCases);
    writeActiveCaseToStorage(saved);
    return saved;
  }

  function collectLegacyLocalCases() {
    const cases = [];
    OLD_CASE_KEYS.forEach(function (key) {
      const value = readJSON(key, null);
      if (Array.isArray(value)) cases.push.apply(cases, value);
      else if (value && typeof value === "object") cases.push(value);
    });
    const temporaryDraft = readJSON(TEMP_DRAFT_CASE_KEY, null);
    if (temporaryDraft) cases.push(temporaryDraft);
    return activeCases(cases).filter(hasMeaningfulCaseData);
  }

  async function migrateLocalCasesToSupabase() {
    await initUserOnly();
    if (!currentUser) return { imported: 0 };
    const localCases = dedupeCases(collectLegacyLocalCases());
    let imported = 0;
    for (const item of localCases) {
      try {
        await saveCase(item);
        imported += 1;
      } catch (error) {
        console.warn("Local saved case migration skipped:", error.message);
      }
    }
    if (localCases.length && imported === localCases.length) {
      OLD_CASE_KEYS.forEach(function (key) { localStorage.removeItem(key); });
      SENSITIVE_CASE_KEYS.forEach(function (key) { localStorage.removeItem(key); });
      localStorage.removeItem(TEMP_DRAFT_CASE_KEY);
    } else if (localCases.length && imported < localCases.length) {
      lastMigrationError = new Error("Your account is signed in, but we could not migrate local draft cases yet.");
    }
    return { imported };
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
    const draft = readJSON(DRAFT_KEY, null) || readJSON(TEMP_DRAFT_CASE_KEY, null);
    if (!draft) return null;
    Object.keys(draft.localKeys || {}).forEach(function (key) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, draft.localKeys[key]);
    });
    const caseData = draft.case_id || draft.caseNumber || draft.case_number ? draft : collectCurrentCaseFromStorage();
    if (hasMeaningfulCaseData(caseData)) {
      try {
        await saveCase(caseData);
        localStorage.removeItem(TEMP_DRAFT_CASE_KEY);
        localStorage.removeItem(DRAFT_KEY);
      } catch (error) {
        lastMigrationError = error;
        console.warn("Draft import skipped:", error.message);
      }
    }
    return draft;
  }

  function getReturnUrl(defaultUrl) {
    const params = new URLSearchParams(window.location.search);
    const target = sanitizeReturnUrl(params.get("returnUrl") || localStorage.getItem(RETURN_KEY) || defaultUrl || "dashboard.html", defaultUrl || "dashboard.html");
    if (target) localStorage.setItem(RETURN_KEY, target);
    return target;
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
    await migrateLocalCasesToSupabase();
    localStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, "true");
    return { casesImported: cases.length, profileImported: Boolean(legacyUser) };
  }

  function dismissLegacyImport() { localStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, "true"); }

  window.RecordPathUserStore = {
    ready: init(),
    readyForAuth: init,
    casesReady: function () { return readyForCases(); },
    readyForCases,
    getCaseLoadStatus,
    signup,
    login,
    loginWithGoogle,
    sendPasswordReset,
    updatePasswordAfterReset,
    logout,
    getCurrentUser: function () { return currentUser; },
    refreshCurrentUser: init,
    lastCaseLoadError: function () { return lastCaseLoadError; },
    supabaseCasesUnavailable: function () { return supabaseCasesUnavailable; },
    updateCurrentUser,
    getCases,
    getCasesAsync,
    getCaseById,
    getActiveCase,
    setActiveCase,
    updateCase,
    deleteCase,
    archiveCase,
    getNextStepForCase,
    normalizeCase,
    getStableCaseId,
    hasMeaningfulCaseData,
    saveCase,
    collectCurrentCaseFromStorage,
    caseToPacketData,
    saveDraftSnapshot,
    getReturnUrl,
    clearReturnUrl,
    sanitizeReturnUrl,
    hasLegacyDemoData,
    importLegacyDemoData,
    dismissLegacyImport,
    isLoggedIn: function () { return Boolean(currentUser); },
    migrateLocalCasesToSupabase,
    keys: { USERS_KEY, SESSION_KEY, DRAFT_KEY, RETURN_KEY, LEGACY_IMPORT_DISMISSED_KEY, LOCAL_CASES_KEY, FALLBACK_CASES_KEY, TEMP_DRAFT_CASE_KEY, ACTIVE_CASE_KEY }
  };
}());
