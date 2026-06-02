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
  const CURRENT_CASE_DRAFT_KEY = "recordpathai_current_case_draft";
  const AI_ACTIVE_CASE_KEY = "recordpathai_active_case_id";
  const RECORDWATCH_DRAFT_KEY = "recordpathai_recordwatch_draft";
  const PENDING_RECORDWATCH_KEY = "recordpathai_pending_recordwatch_enrollment";
  const OLD_CASE_KEYS = ["recordPathSavedCases", "recordPathCachedCases", "savedCases", "recordPathCases", "recordpathai_cases", "recordwatchCases", "currentCase", "activeCase"];
  const SENSITIVE_CASE_KEYS = ["caseNumber", "caseState", "state", "county", "court", "offense", "offenseCode", "outcome", "eligibilityStatus", "estimatedEligibleDate", "dispositionDate", "dischargeDate", "recordPathPacketData", "recordPathEligibilityIntake"];

  let currentUser = null;
  let currentSession = null;
  let cachedCases = [];
  let initPromise = null;
  let casesInitPromise = null;
  let lastCaseLoadError = null;
  let lastDraftMigrationError = null;
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

  function authRedirectUrl() {
    const basePath = window.location.pathname.replace(/[^/]*$/, "");
    return `${window.location.origin}${basePath}login.html?returnUrl=${encodeURIComponent(getReturnUrl("dashboard.html"))}`;
  }

  function sanitizeReturnUrl(value, defaultUrl) {
    const fallback = defaultUrl || "dashboard.html";
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.origin !== window.location.origin) return fallback;
      const fileName = (parsed.pathname.split("/").pop() || "").toLowerCase();
      if (fileName === "login.html" || fileName === "signup.html") {
        const nested = parsed.searchParams.get("returnUrl");
        return nested ? sanitizeReturnUrl(nested, fallback) : fallback;
      }
      const relativePath = parsed.pathname.replace(/^\/+/, "") || fallback;
      return `${relativePath}${parsed.search || ""}${parsed.hash || ""}`;
    } catch (error) {
      return fallback;
    }
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

  async function init() {
    if (!initPromise) {
      initPromise = (async function () {
        try {
          const supabase = await client();
          const sessionResult = await supabase.auth.getSession();
          currentSession = sessionResult && sessionResult.data ? sessionResult.data.session : null;
          const authUser = currentSession && currentSession.user;
          if (!authUser) {
            currentUser = null;
            cachedCases = loadLocalCases();
            return null;
          }
          const profile = await loadProfile(authUser);
          currentUser = publicUser(authUser, profile);
          queueCaseReadiness();
          return currentUser;
        } catch (error) {
          console.warn("Supabase auth initialization skipped:", error.message);
          currentSession = null;
          currentUser = null;
          cachedCases = loadLocalCases();
          return null;
        } finally {
          document.dispatchEvent(new CustomEvent("recordpath:auth-ready", { detail: { user: currentUser, session: currentSession } }));
        }
      }());
    }
    return initPromise;
  }

  function resetAuthReadiness() {
    initPromise = null;
    casesInitPromise = null;
  }

  function queueCaseReadiness() {
    if (!casesInitPromise) {
      casesInitPromise = (async function () {
        if (!currentUser) return cachedCases;
        try {
          await refreshCases({ allowFallback: true });
        } catch (error) {
          markCaseLoadError(error);
        }
        try {
          await migrateLocalDraftToSupabase();
        } catch (error) {
          lastDraftMigrationError = error;
          console.warn("Local draft migration skipped:", error.message);
        }
        return cachedCases;
      }());
    }
    return casesInitPromise;
  }

  function markCaseLoadError(error) {
    lastCaseLoadError = error;
    supabaseCasesUnavailable = true;
    console.warn("Supabase saved case load failed:", error && error.message ? error.message : error);
  }


  function classifySupabaseCaseError(error, tableName) {
    const code = String((error && (error.code || error.status || error.name)) || "").toLowerCase();
    const message = String((error && error.message) || error || "");
    const lower = message.toLowerCase();
    const table = tableName || "saved_cases";
    if (code === "42p01" || lower.includes("relation") && lower.includes(table) && lower.includes("does not exist") || lower.includes(`could not find the table '${table}'`)) {
      return authError(`${table} table is missing. Apply supabase/migrations/20260531000000_saved_cases_source_of_truth.sql before checkout.`, "saved_cases_table_missing", { cause: error, supabaseError: error });
    }
    if (code === "42501" || lower.includes("row-level security") || lower.includes("permission denied") || lower.includes("not authorized")) {
      return authError("Your account is signed in, but the case could not be saved because database permissions blocked the request.", "saved_cases_rls_blocked", { cause: error, supabaseError: error });
    }
    if (code === "pgrst204" || code.startsWith("22") || lower.includes("schema cache") || lower.includes("column") && lower.includes("does not exist") || lower.includes("invalid input syntax")) {
      return authError(`invalid ${table} payload. The case data did not match the deployed database schema.`, "saved_cases_invalid_payload", { cause: error, supabaseError: error });
    }
    return authError(message || `Could not save ${table}.`, "saved_cases_save_failed", { cause: error, supabaseError: error });
  }

  async function requireCaseSaveSession(supabase) {
    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
    const authUser = session && session.user;
    if (!authUser || !authUser.id) {
      currentSession = null;
      currentUser = null;
      throw authError("Please sign in before checkout so RecordPathAI can save this packet to your account.", "auth_session_missing");
    }
    currentSession = session;
    if (!currentUser || currentUser.id !== authUser.id) currentUser = publicUser(authUser, currentUser);
    return session;
  }

  function collectCaseMetadata(original, normalized, existingMetadata) {
    const metadata = Object.assign({}, existingMetadata || {});
    const knownKeys = new Set([
      "id", "case_id", "caseId", "saved_case_id", "savedCaseId", "user_id", "userId",
      "caseNumber", "case_number", "caseState", "case_state", "state", "county", "court", "courtName", "court_name", "courtType", "court_type", "courtId", "court_id",
      "ruleSetId", "rule_set_id", "localProfileId", "local_profile_id", "reliefType", "relief_type", "primaryCharge", "primary_charge", "charge",
      "offenseCode", "offense_code", "offenseLevel", "offense_level", "level", "chargeLevel", "outcome", "disposition",
      "arrestDate", "arrest_date", "offenseDate", "offense_date", "dispositionDate", "disposition_date", "sentenceCompletionDate", "sentence_completion_date",
      "probationCompletedDate", "probation_completed_date", "dischargeDate", "discharge_date", "finalDischargeDate", "final_discharge_date",
      "eligibilityStatus", "eligibility_status", "eligibilityDate", "eligibility_date", "estimatedEligibleDate", "estimated_eligible_date", "estimated_eligible_on",
      "eligibilityConfidence", "eligibility_confidence", "eligibilityReasons", "eligibility_reasons", "requiredWaitingPeriod", "required_waiting_period",
      "dateUsedForCalculation", "date_used_for_calculation", "packetStatus", "packet_status", "recordWatchStatus", "recordwatch_status",
      "paymentStatus", "payment_status", "metadata", "charges", "chargeDetails", "case_charges", "createdAt", "created_at", "updatedAt", "updated_at", "lastUpdated",
      "deletedAt", "deleted_at", "archivedAt", "archived_at", "status"
    ]);
    const unknown = {};
    Object.keys(original || {}).forEach(function (key) {
      if (!knownKeys.has(key)) unknown[key] = original[key];
    });
    if (Object.keys(unknown).length) metadata.unmapped_case_fields = Object.assign({}, metadata.unmapped_case_fields || {}, unknown);
    if (normalized.paymentStatus) metadata.payment_status = normalized.paymentStatus;
    return metadata;
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
    currentSession = data && data.session ? data.session : null;
    if (currentSession && data && data.user) {
      currentUser = publicUser(data.user, null);
      upsertProfile(data.user, { fullName, email: normalizedEmail, phone }).catch(function (profileError) {
        console.warn("Profile setup failed after signup:", profileError);
      });
      resetAuthReadiness();
      queueCaseReadiness();
      return currentUser;
    }
    currentUser = null;
    resetAuthReadiness();
    return { accountCreated: true, needsEmailConfirmation: true };
  }

  async function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const supabase = await client();
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: String(password || "") });
    if (error) {
      if (isInvalidCredentialsError(error)) throw authError(LOGIN_INVALID_CREDENTIALS_MESSAGE, "invalid_credentials");
      throw new Error(error.message);
    }
    currentSession = data.session || null;
    const profile = await loadProfile(data.user);
    currentUser = publicUser(data.user, profile);
    if (!profile) upsertProfile(data.user, { email: normalizedEmail }).catch(function (profileError) { console.warn("Profile setup failed after login:", profileError); });
    resetAuthReadiness();
    queueCaseReadiness();
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
    currentSession = null;
    currentUser = null;
    cachedCases = [];
    resetAuthReadiness();
  }

  async function logout() {
    const supabase = await client();
    await supabase.auth.signOut();
    currentSession = null;
    currentUser = null;
    cachedCases = [];
    resetAuthReadiness();
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

  function isBlankCaseValue(value) {
    return value === undefined || value === null || String(value).trim() === "" || (Array.isArray(value) && !value.length);
  }

  function mergeChargesNoBlank(existing, incoming) {
    const current = Array.isArray(existing) ? existing.slice() : [];
    const updates = Array.isArray(incoming) ? incoming : [];
    updates.forEach(function (charge, index) {
      if (!charge || typeof charge !== "object") return;
      const normalized = normalizeCharges({ charges: [charge] })[0] || charge;
      const key = String(firstNonEmpty(normalized.id, normalized.charge_name, normalized.offense_code, index)).trim().toLowerCase();
      let foundIndex = current.findIndex(function (item, itemIndex) {
        const itemKey = String(firstNonEmpty(item && item.id, item && (item.charge_name || item.chargeName || item.offense_name), item && (item.offense_code || item.offenseCode || item.statute_citation), itemIndex)).trim().toLowerCase();
        return key && itemKey === key;
      });
      if (foundIndex < 0 && index < current.length) foundIndex = index;
      if (foundIndex >= 0) current[foundIndex] = mergeNonBlank(current[foundIndex], normalized);
      else if (firstNonEmpty(normalized.charge_name, normalized.offense_code, normalized.offense_level)) current.push(normalized);
    });
    return current;
  }

  function mergeNonBlank(existing, incoming) {
    const base = existing && typeof existing === "object" && !Array.isArray(existing) ? Object.assign({}, existing) : {};
    Object.keys(incoming || {}).forEach(function (key) {
      const value = incoming[key];
      if (key === "charges" || key === "chargeDetails" || key === "case_charges") {
        const mergedCharges = mergeChargesNoBlank(base.chargeDetails || base.charges || [], value);
        if (mergedCharges.length) { base.charges = mergedCharges; base.chargeDetails = mergedCharges; }
        return;
      }
      if (Array.isArray(value)) {
        if (value.length) base[key] = value;
        return;
      }
      if (value && typeof value === "object") {
        base[key] = mergeNonBlank(base[key], value);
        return;
      }
      if (!isBlankCaseValue(value)) base[key] = value;
    });
    return base;
  }

  function normalizeCurrentCaseDraft(input) {
    const source = input || {};
    const normalized = normalizeCase(Object.assign({}, source, source.packet || {}, source.case || {}));
    const packet = source.packet && typeof source.packet === "object" ? source.packet : caseToPacketData(normalized);
    const person = Object.assign({}, source.person || {}, {
      fullName: firstNonEmpty(source.person && source.person.fullName, source.fullName, packet.petitioner && packet.petitioner.full_name, localStorage.getItem("fullName")),
      email: firstNonEmpty(source.person && source.person.email, source.email, packet.petitioner && packet.petitioner.email, localStorage.getItem("email")),
      phone: firstNonEmpty(source.person && source.person.phone, source.phone, packet.petitioner && packet.petitioner.phone, localStorage.getItem("phone")),
      dateOfBirth: firstNonEmpty(source.person && source.person.dateOfBirth, source.dateOfBirth, packet.petitioner && packet.petitioner.dob, localStorage.getItem("dateOfBirth"))
    });
    const draftId = firstNonEmpty(source.localDraftId, source.id, source.case_id, source.caseId, localStorage.getItem(AI_ACTIVE_CASE_KEY), localStorage.getItem(ACTIVE_CASE_KEY), createId("draft"));
    return {
      id: firstNonEmpty(source.id, normalized.case_id, draftId),
      localDraftId: firstNonEmpty(source.localDraftId, isUuid(normalized.case_id) ? "" : normalized.case_id, draftId),
      savedCaseId: firstNonEmpty(source.savedCaseId, source.saved_case_id, isUuid(normalized.case_id) ? normalized.case_id : ""),
      person: person,
      court: Object.assign({}, source.court && typeof source.court === "object" ? source.court : {}, {
        state: firstNonEmpty(normalized.caseState, source.caseState),
        county: firstNonEmpty(normalized.county),
        name: firstNonEmpty(normalized.courtName),
        courtName: firstNonEmpty(normalized.courtName),
        caseNumber: firstNonEmpty(normalized.caseNumber),
        judge: firstNonEmpty(source.judge, source.judgeName, source.judge_name, source.metadata && source.metadata.judge_name)
      }),
      charges: normalized.chargeDetails,
      eligibility: Object.assign({}, source.eligibility || {}, {
        status: firstNonEmpty(normalized.eligibilityStatus),
        eligibilityStatus: firstNonEmpty(normalized.eligibilityStatus),
        estimatedEligibleDate: firstNonEmpty(normalized.estimatedEligibleDate),
        eligibilityDate: firstNonEmpty(normalized.eligibilityDate),
        confidence: firstNonEmpty(normalized.eligibilityConfidence),
        reasons: normalized.eligibilityReasons || []
      }),
      recordwatch: Object.assign({}, source.recordwatch || source.recordWatch || {}),
      packet: packet,
      case: normalized,
      updatedAt: firstNonEmpty(source.updatedAt, source.updated_at, normalized.updatedAt, nowIso())
    };
  }

  function currentDraftToCase(draft) {
    draft = normalizeCurrentCaseDraft(draft);
    const first = draft.charges[0] || {};
    return normalizeCase(Object.assign({}, draft.case || {}, {
      id: firstNonEmpty(draft.savedCaseId, draft.localDraftId, draft.id),
      case_id: firstNonEmpty(draft.savedCaseId, draft.localDraftId, draft.id),
      savedCaseId: draft.savedCaseId,
      caseState: draft.court.state,
      county: draft.court.county,
      courtName: firstNonEmpty(draft.court.name, draft.court.courtName),
      court: firstNonEmpty(draft.court.name, draft.court.courtName),
      caseNumber: draft.court.caseNumber,
      charges: draft.charges,
      primaryCharge: firstNonEmpty(first.charge_name, first.chargeName),
      offenseCode: firstNonEmpty(first.offense_code, first.charge_code),
      level: firstNonEmpty(first.offense_level, first.degree, first.level),
      outcome: firstNonEmpty(draft.case && draft.case.outcome, first.disposition, first.final_disposition),
      dispositionDate: firstNonEmpty(draft.case && draft.case.dispositionDate, first.disposition_date),
      dischargeDate: firstNonEmpty(draft.case && draft.case.dischargeDate, first.discharge_date),
      eligibilityStatus: firstNonEmpty(draft.eligibility.eligibilityStatus, draft.eligibility.status),
      eligibilityDate: firstNonEmpty(draft.eligibility.eligibilityDate, draft.eligibility.estimatedEligibleDate),
      estimatedEligibleDate: firstNonEmpty(draft.eligibility.estimatedEligibleDate, draft.eligibility.eligibilityDate),
      metadata: mergeNonBlank(draft.case && draft.case.metadata, { person: draft.person, recordwatch: draft.recordwatch, judge_name: draft.court.judge })
    }));
  }

  function readCurrentDraft() { return normalizeCurrentCaseDraft(readJSON(CURRENT_CASE_DRAFT_KEY, {})); }
  function writeCurrentDraft(draft) {
    const normalized = normalizeCurrentCaseDraft(Object.assign({}, draft || {}, { updatedAt: nowIso() }));
    writeJSON(CURRENT_CASE_DRAFT_KEY, normalized);
    const activeId = firstNonEmpty(normalized.savedCaseId, normalized.localDraftId, normalized.id);
    if (activeId) { localStorage.setItem(AI_ACTIVE_CASE_KEY, activeId); localStorage.setItem(ACTIVE_CASE_KEY, activeId); localStorage.setItem("recordwatchActiveCaseId", activeId); }
    return normalized;
  }

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
    localStorage.setItem(AI_ACTIVE_CASE_KEY, item.case_id);
    localStorage.setItem("recordwatchActiveCaseId", item.case_id);
    writeJSON("recordPathPacketData", Object.assign({}, getPacketData(), caseToPacketData(item)));
    writeCurrentDraft(mergeNonBlank(readCurrentDraft(), normalizeCurrentCaseDraft(item)));
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

  function casePayload(caseData, userId) {
    const original = caseData || {};
    const item = normalizeCase(original);
    const metadata = collectCaseMetadata(original, item, item.metadata);
    const payload = {
      user_id: userId,
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
      recordwatch_status: statusForDb(item.recordWatchStatus, "not_activated"),
      metadata,
      updated_at: nowIso()
    };
    const sourceId = firstNonEmpty(original.id, original.case_id, original.caseId, original.saved_case_id, original.savedCaseId);
    if (isUuid(sourceId)) payload.id = sourceId;
    return payload;
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
      cachedCases = loadLocalCases();
      syncRecordWatchCases(cachedCases);
      return cachedCases;
    }
    const supabase = await client();
    const { data, error } = await supabase.from("saved_cases").select("*").eq("user_id", currentUser.id).is("deleted_at", null).order("updated_at", { ascending: true });
    if (error) {
      markCaseLoadError(error);
      const fallback = loadLocalCases();
      if (options && options.allowFallback) {
        fallback.isFallback = true;
        cachedCases = fallback;
        return fallback;
      }
      throw new Error(error.message);
    }
    let chargesByCase = {};
    try {
      chargesByCase = await fetchCaseCharges(supabase, (data || []).map(function (row) { return row.id; }));
    } catch (chargeError) {
      markCaseLoadError(chargeError);
      const fallback = loadLocalCases();
      if (options && options.allowFallback) {
        fallback.isFallback = true;
        cachedCases = fallback;
        return fallback;
      }
      throw chargeError;
    }
    cachedCases = activeCases((data || []).map(function (row) { return normalizeDbCase(Object.assign({}, row, { case_charges: chargesByCase[row.id] || [] })); }));
    lastCaseLoadError = null;
    supabaseCasesUnavailable = false;
    saveLocalCases(cachedCases);
    return cachedCases;
  }

  async function initUserOnly() {
    if (currentUser) return currentUser;
    return init();
  }

  function getCases() { return activeCases(cachedCases.length ? cachedCases : loadLocalCases()); }
  async function getCasesAsync() { return refreshCases({ allowFallback: true }); }

  function caseMatchesId(caseRecord, caseId, compositeKey) {
    const id = String(caseId || "").trim();
    if (!id || !caseRecord) return false;
    return getStableCaseId(caseRecord) === id || getCaseCompositeKey(caseRecord) === compositeKey || String(caseRecord.caseNumber || "") === id;
  }

  async function getCaseById(caseId) {
    const id = String(caseId || localStorage.getItem(AI_ACTIVE_CASE_KEY) || localStorage.getItem(ACTIVE_CASE_KEY) || "").trim();
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

  async function getActiveCase() { return getCaseById(localStorage.getItem(AI_ACTIVE_CASE_KEY) || localStorage.getItem(ACTIVE_CASE_KEY)); }

  async function syncCharges(caseId, caseData, options) {
    const chargeRows = normalizeCase(caseData).chargeDetails;
    const supabase = await client();
    const userId = currentUser && currentUser.id;
    const deleteResult = await supabase.from("case_charges").delete().eq("case_id", caseId).eq("user_id", userId);
    if (deleteResult.error) throw classifySupabaseCaseError(deleteResult.error, "case_charges");
    if (!chargeRows.length) return [];
    const payload = chargeRows.map(function (charge) {
      return {
        user_id: userId,
        case_id: caseId,
        charge_name: charge.charge_name || null,
        offense_code: charge.offense_code || null,
        offense_level: charge.offense_level || null,
        offense_date: charge.offense_date || null,
        charge_notes: charge.charge_notes || null,
        flags: charge.flags && typeof charge.flags === "object" ? charge.flags : {},
        updated_at: nowIso()
      };
    });
    const { data, error } = await supabase.from("case_charges").insert(payload).select("*");
    if (error) throw classifySupabaseCaseError(error, "case_charges");
    return data || [];
  }

  async function syncChargesForSavedCase(caseId, caseData) {
    try {
      return await syncCharges(caseId, caseData);
    } catch (error) {
      console.error("Case charge save failed after saved_cases save succeeded:", {
        code: error && error.code,
        message: error && error.message,
        details: error && error.details,
        cause: error && error.cause
      });
      return [];
    }
  }

  async function updateCase(caseId, updates) {
    await initUserOnly();
    const found = await getCaseById(caseId);
    if (!found) return null;
    const next = normalizeCase(Object.assign({}, found, updates || {}, { case_id: found.case_id, id: found.case_id, updatedAt: nowIso(), lastUpdated: nowIso() }));
    if (currentUser && isUuid(next.case_id)) {
      const supabase = await client();
      const payload = casePayload(next, currentUser.id);
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
      if (byId.error) throw classifySupabaseCaseError(byId.error, "saved_cases");
      if (byId.data) return byId.data;
    }
    const composite = getCaseCompositeKey(nextCase);
    if (!composite || !nextCase.caseNumber) return null;
    const query = supabase.from("saved_cases").select("*").eq("user_id", currentUser.id).eq("case_number", nextCase.caseNumber).is("deleted_at", null);
    if (nextCase.courtName) query.eq("court_name", nextCase.courtName);
    if (nextCase.county) query.eq("county", nextCase.county);
    if (nextCase.caseState) query.eq("case_state", nextCase.caseState);
    const lookup = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (lookup.error) throw classifySupabaseCaseError(lookup.error, "saved_cases");
    return lookup.data || null;
  }

  async function saveCase(caseInput) {
    await initUserOnly();
    const input = caseInput || {};
    const activeId = localStorage.getItem(AI_ACTIVE_CASE_KEY) || localStorage.getItem(ACTIVE_CASE_KEY);
    let base = {};
    if (activeId && input && !input.case_id && !input.caseId && !input.id && currentUser) base = await getCaseById(activeId) || {};
    const collected = Object.keys(input).length ? mergeNonBlank(mergeNonBlank(Object.keys(base).length ? base : collectCurrentCaseFromStorage(), readCurrentDraft().case || {}), input) : mergeNonBlank(collectCurrentCaseFromStorage(), readCurrentDraft().case || {});
    if (!hasMeaningfulCaseData(collected)) return null;
    const nextCase = normalizeCase(collected);
    if (!currentUser) {
      const local = getCases().filter(function (item) { return item.case_id !== nextCase.case_id && getCaseCompositeKey(item) !== getCaseCompositeKey(nextCase); });
      local.push(nextCase);
      cachedCases = activeCases(local);
      saveLocalCases(cachedCases);
      syncRecordWatchCases(cachedCases);
      localStorage.setItem(TEMP_DRAFT_CASE_KEY, JSON.stringify(nextCase));
      writeActiveCaseToStorage(nextCase);
      return nextCase;
    }
    const supabase = await client();
    const session = await requireCaseSaveSession(supabase);
    const userId = session.user.id;
    currentUser = Object.assign({}, currentUser, { id: userId });
    const existing = await findExistingRemoteCase(supabase, nextCase);
    const payload = casePayload(nextCase, userId);
    if (existing) payload.id = existing.id;

    let result;
    if (existing && existing.id) {
      result = await supabase.from("saved_cases").update(payload).eq("id", existing.id).eq("user_id", userId).select("*").single();
    } else {
      result = await supabase.from("saved_cases").insert(payload).select("*").single();
    }
    if (result.error) throw classifySupabaseCaseError(result.error, "saved_cases");
    const data = result.data;
    const charges = await syncChargesForSavedCase(data.id, nextCase);
    const saved = normalizeDbCase(Object.assign({}, data, { case_charges: charges }));
    cachedCases = activeCases(getCases().filter(function (item) { return item.case_id !== saved.case_id && getCaseCompositeKey(item) !== getCaseCompositeKey(saved); }).concat(saved));
    saveLocalCases(cachedCases);
    writeActiveCaseToStorage(saved);
    return saved;
  }


  async function getCurrentCaseDraft() {
    await initUserOnly().catch(function () { return null; });
    const candidates = [];
    if (currentUser) {
      const activeId = localStorage.getItem(AI_ACTIVE_CASE_KEY) || localStorage.getItem(ACTIVE_CASE_KEY);
      if (activeId) {
        const active = await getCaseById(activeId).catch(function () { return null; });
        if (active) candidates.push(active);
      }
      if (!candidates.length) {
        const cases = await refreshCases({ allowFallback: true }).catch(function () { return getCases(); });
        if (cases && cases.length) candidates.push(cases[cases.length - 1]);
      }
    }
    candidates.push(readCurrentDraft());
    candidates.push(readJSON(TEMP_DRAFT_CASE_KEY, {}));
    candidates.push(collectCurrentCaseFromStorage());
    const mergedCase = candidates.reduce(function (merged, candidate) {
      if (!candidate || !hasMeaningfulCaseData(candidate.case || candidate)) return merged;
      return mergeNonBlank(merged, candidate.case ? currentDraftToCase(candidate) : candidate);
    }, {});
    const draft = normalizeCurrentCaseDraft(mergedCase);
    if (hasMeaningfulCaseData(draft.case)) writeCurrentDraft(draft);
    return draft;
  }

  async function saveCurrentCaseDraft(caseData, options) {
    options = options || {};
    await initUserOnly().catch(function () { return null; });
    const existingDraft = readCurrentDraft();
    let baseCase = currentDraftToCase(existingDraft);
    const activeId = localStorage.getItem(AI_ACTIVE_CASE_KEY) || localStorage.getItem(ACTIVE_CASE_KEY);
    if (currentUser && activeId) {
      const remote = await getCaseById(activeId).catch(function () { return null; });
      if (remote) baseCase = mergeNonBlank(baseCase, remote);
    }
    const incomingCase = caseData && caseData.person || caseData && caseData.court || caseData && caseData.recordwatch ? currentDraftToCase(caseData) : normalizeCase(caseData || {});
    const mergedCase = mergeNonBlank(baseCase, incomingCase);
    const mergedDraft = mergeNonBlank(existingDraft, normalizeCurrentCaseDraft(Object.assign({}, mergedCase, caseData || {})));
    writeCurrentDraft(mergedDraft);
    if (currentUser && options.localOnly !== true && options.network !== false && hasMeaningfulCaseData(mergedCase)) {
      const saved = await saveCase(mergedCase);
      if (saved) return writeCurrentDraft(mergeNonBlank(mergedDraft, normalizeCurrentCaseDraft(Object.assign({}, saved, { savedCaseId: saved.case_id || saved.id }))));
    }
    if (!currentUser && hasMeaningfulCaseData(mergedCase)) {
      await saveCase(mergedCase);
    }
    return mergedDraft;
  }

  function getActiveCaseId() { return localStorage.getItem(AI_ACTIVE_CASE_KEY) || localStorage.getItem(ACTIVE_CASE_KEY) || localStorage.getItem("recordwatchActiveCaseId") || ""; }
  function setActiveCaseId(id) {
    const value = String(id || "").trim();
    if (!value) return "";
    localStorage.setItem(AI_ACTIVE_CASE_KEY, value);
    localStorage.setItem(ACTIVE_CASE_KEY, value);
    localStorage.setItem("recordwatchActiveCaseId", value);
    return value;
  }

  async function migrateLocalDraftToSupabase() {
    await initUserOnly();
    if (!currentUser) return { imported: 0 };
    const draft = readCurrentDraft();
    const pendingRecordWatch = readJSON(PENDING_RECORDWATCH_KEY, null) || readJSON(RECORDWATCH_DRAFT_KEY, null);
    let imported = 0;
    if (hasMeaningfulCaseData(draft.case)) {
      const saved = await saveCase(currentDraftToCase(draft));
      if (saved) {
        imported += 1;
        const nextDraft = writeCurrentDraft(mergeNonBlank(draft, normalizeCurrentCaseDraft(Object.assign({}, saved, { savedCaseId: saved.case_id || saved.id }))));
        if (pendingRecordWatch) {
          nextDraft.recordwatch = mergeNonBlank(nextDraft.recordwatch, pendingRecordWatch);
          nextDraft.recordwatch.caseId = saved.case_id || saved.id;
          writeCurrentDraft(nextDraft);
          writeJSON(RECORDWATCH_DRAFT_KEY, nextDraft.recordwatch);
          localStorage.removeItem(PENDING_RECORDWATCH_KEY);
        }
      }
    }
    const legacyResult = await migrateLocalCasesToSupabase().catch(function (error) { lastDraftMigrationError = error; return { imported: 0 }; });
    return { imported: imported + (legacyResult.imported || 0) };
  }

  async function getCurrentRecordWatchCase() {
    const draft = await getCurrentCaseDraft();
    return hasMeaningfulCaseData(draft.case) ? draft : null;
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
    let failed = 0;
    for (const item of localCases) {
      try {
        await saveCase(item);
        imported += 1;
      } catch (error) {
        failed += 1;
        lastDraftMigrationError = error;
        console.warn("Local saved case migration skipped:", error.message);
      }
    }
    if (imported && !failed) {
      OLD_CASE_KEYS.forEach(function (key) { localStorage.removeItem(key); });
      SENSITIVE_CASE_KEYS.forEach(function (key) { localStorage.removeItem(key); });
      localStorage.removeItem(TEMP_DRAFT_CASE_KEY);
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
        lastDraftMigrationError = error;
        console.warn("Draft import skipped:", error.message);
      }
    }
    return draft;
  }

  function getReturnUrl(defaultUrl) {
    const params = new URLSearchParams(window.location.search);
    return sanitizeReturnUrl(params.get("returnUrl") || localStorage.getItem(RETURN_KEY), defaultUrl || "dashboard.html");
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
    await migrateLocalDraftToSupabase();
    localStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, "true");
    return { casesImported: cases.length, profileImported: Boolean(legacyUser) };
  }

  function dismissLegacyImport() { localStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, "true"); }

  window.RecordPathUserStore = {
    ready: init(),
    get readyForAuth() { return init(); },
    get casesReady() { return queueCaseReadiness(); },
    signup,
    login,
    loginWithGoogle,
    sendPasswordReset,
    updatePasswordAfterReset,
    logout,
    getCurrentUser: function () { return currentUser; },
    getCurrentSession: function () { return currentSession; },
    refreshCurrentUser: init,
    updateCurrentUser,
    getCases,
    getCasesAsync,
    getCaseById,
    getActiveCase,
    setActiveCase,
    getCurrentCaseDraft,
    saveCurrentCaseDraft,
    getActiveCaseId,
    setActiveCaseId,
    migrateLocalDraftToSupabase,
    getCurrentRecordWatchCase,
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
    hasLegacyDemoData,
    importLegacyDemoData,
    dismissLegacyImport,
    isLoggedIn: function () { return Boolean(currentUser); },
    migrateLocalCasesToSupabase,
    get lastCaseLoadError() { return lastCaseLoadError; },
    get lastDraftMigrationError() { return lastDraftMigrationError; },
    get supabaseCasesUnavailable() { return supabaseCasesUnavailable; },
    sanitizeReturnUrl,
    keys: { USERS_KEY, SESSION_KEY, DRAFT_KEY, RETURN_KEY, LEGACY_IMPORT_DISMISSED_KEY, LOCAL_CASES_KEY, FALLBACK_CASES_KEY, TEMP_DRAFT_CASE_KEY, ACTIVE_CASE_KEY, CURRENT_CASE_DRAFT_KEY, AI_ACTIVE_CASE_KEY, RECORDWATCH_DRAFT_KEY, PENDING_RECORDWATCH_KEY }
  };
}());
