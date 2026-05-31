(function () {
  "use strict";

  const USERS_KEY = "recordPathDemoUsers";
  const SESSION_KEY = "recordPathDemoCurrentUserId";
  const DRAFT_KEY = "recordPathAccountDraft";
  const RETURN_KEY = "recordPathAuthReturnUrl";
  const LEGACY_IMPORT_DISMISSED_KEY = "recordPathLegacyImportDismissed";
  const LOCAL_CASES_KEY = "recordPathSavedCases";
  const ACTIVE_CASE_KEY = "recordPathActiveCaseId";

  let currentUser = null;
  let cachedCases = [];
  let initPromise = null;

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
            cachedCases = loadLocalCases();
            return null;
          }
          const profile = await loadProfile(data.user);
          currentUser = publicUser(data.user, profile);
          await refreshCases();
          return currentUser;
        } catch (error) {
          console.warn("Supabase auth initialization skipped:", error.message);
          currentUser = null;
          cachedCases = loadLocalCases();
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
    await maybeImportDraftAfterLogin();
    await refreshCases();
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
    const generatedCaseId = firstNonEmpty(caseNumber && `case_${String(caseNumber).replace(/[^a-z0-9]+/gi, "_")}`, createId("case"));
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
      caseNumber,
      charges: chargeNames.length ? chargeNames : [primaryCharge].filter(Boolean),
      primaryCharge,
      offenseCode: firstNonEmpty(first.statute_citation, first.offense_code, localStorage.getItem("offenseCode")),
      level: firstNonEmpty(first.level, first.charge_level),
      outcome: firstNonEmpty(first.disposition, first.final_disposition, localStorage.getItem("outcome")),
      eligibilityStatus: firstNonEmpty(eligibility.statusLabel, eligibility.status, localStorage.getItem("eligibilityStatus"), "Not screened yet"),
      estimatedEligibleDate: firstNonEmpty(eligibility.estimatedEligibleDate, eligibility.estimated_eligible_on, localStorage.getItem("estimatedEligibleDate")),
      packetStatus: localStorage.getItem("recordPathPacketGeneratedAt") ? "Generated" : "Not generated",
      recordWatchStatus: localStorage.getItem("recordwatchActiveCaseId") ? "Active" : "Not Activated",
      paymentStatus: (localStorage.getItem("recordPathPacketPaymentComplete") === "true" || localStorage.getItem("recordPathPaymentComplete") === "true") ? "Paid" : "Unpaid",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUpdated: timestamp
    }, overrides || {}));
  }


  function normalizeCase(input) {
    const source = input || {};
    const nestedCourt = source.court && typeof source.court === "object" ? source.court : {};
    const charges = Array.isArray(source.charges) ? source.charges : (source.primaryCharge || source.charge ? [source.primaryCharge || source.charge] : []);
    const firstCharge = charges[0];
    const primaryCharge = firstNonEmpty(source.primaryCharge, flattenCharge(firstCharge), typeof firstCharge === "string" ? firstCharge : "", source.offense);
    const id = firstNonEmpty(source.case_id, source.caseId, source.id, nestedCourt.caseNumber, source.caseNumber && `case_${String(source.caseNumber).replace(/[^a-z0-9]+/gi, "_")}`);
    const updated = firstNonEmpty(source.lastUpdated, source.updatedAt, source.updated_at, source.createdAt, source.created_at, nowIso());
    return {
      id,
      case_id: id,
      caseId: id,
      caseNumber: firstNonEmpty(source.caseNumber, source.case_number, nestedCourt.caseNumber, id),
      caseState: firstNonEmpty(source.caseState, source.case_state, nestedCourt.caseState, nestedCourt.state),
      county: firstNonEmpty(source.county, nestedCourt.county),
      courtName: firstNonEmpty(source.courtName, source.court_name, typeof source.court === "string" ? source.court : "", nestedCourt.courtName, nestedCourt.name),
      court: firstNonEmpty(source.courtName, source.court_name, typeof source.court === "string" ? source.court : "", nestedCourt.courtName, nestedCourt.name),
      courtType: firstNonEmpty(source.courtType, source.court_type, nestedCourt.courtType, nestedCourt.type),
      charges: charges.map(function (charge) { return typeof charge === "string" ? charge : flattenCharge(charge); }).filter(Boolean),
      primaryCharge,
      offenseCode: firstNonEmpty(source.offenseCode, source.offense_code),
      level: firstNonEmpty(source.level, source.chargeLevel),
      outcome: firstNonEmpty(source.outcome, source.disposition),
      eligibilityStatus: firstNonEmpty(source.eligibilityStatus, source.eligibility_status, "Not screened yet"),
      estimatedEligibleDate: firstNonEmpty(source.estimatedEligibleDate, source.estimated_eligible_date),
      packetStatus: firstNonEmpty(source.packetStatus, source.packet_status, "Not generated"),
      recordWatchStatus: firstNonEmpty(source.recordWatchStatus, source.recordwatch_status, source.recordWatchPaused ? "Paused" : "Not Activated"),
      paymentStatus: firstNonEmpty(source.paymentStatus, source.payment_status, "Unpaid"),
      createdAt: firstNonEmpty(source.createdAt, source.created_at, updated),
      updatedAt: updated,
      lastUpdated: updated,
      deletedAt: firstNonEmpty(source.deletedAt, source.deleted_at),
      archivedAt: firstNonEmpty(source.archivedAt, source.archived_at),
      status: firstNonEmpty(source.status, source.archivedAt || source.archived_at ? "archived" : "active")
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

  function hasMeaningfulCaseData(caseRecord) {
    const source = caseRecord || {};
    const normalized = normalizeCase(source);
    const eligibility = String(firstNonEmpty(source.eligibilityStatus, source.eligibility_status)).trim().toLowerCase();
    const packet = String(firstNonEmpty(source.packetStatus, source.packet_status)).trim().toLowerCase();
    return Boolean(firstNonEmpty(
      source.caseNumber, source.case_number, normalized.caseNumber && normalized.caseNumber !== normalized.case_id ? normalized.caseNumber : "",
      source.courtName, source.court_name, normalized.courtName,
      source.charge, source.primaryCharge, normalized.primaryCharge,
      source.offenseCode, source.offense_code, normalized.offenseCode,
      eligibility && !eligibility.includes("not screened") ? eligibility : "",
      packet && !packet.includes("not generated") ? packet : ""
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

  function loadLocalCases() { return activeCases(readJSON(LOCAL_CASES_KEY, [])); }
  function saveLocalCases(cases) { writeJSON(LOCAL_CASES_KEY, activeCases(cases)); }

  function hasProtectedHistory(caseData) {
    const id = caseData && (caseData.case_id || caseData.caseId || caseData.id || caseData.caseNumber);
    const ledger = readJSON("recordPathPurchaseLedger", readJSON("recordPathLedger", []));
    return String(caseData && (caseData.paymentStatus || caseData.packetStatus || "")).toLowerCase().match(/paid|generated/) || ledger.some(function (entry) { return id && (entry.case_id === id || entry.caseId === id || entry.case_number === caseData.caseNumber); });
  }

  function writeActiveCaseToStorage(caseData) {
    const item = normalizeCase(caseData);
    if (!item.case_id) return item;
    localStorage.setItem(ACTIVE_CASE_KEY, item.case_id);
    localStorage.setItem("recordwatchActiveCaseId", item.case_id);
    if (item.caseNumber) localStorage.setItem("caseNumber", item.caseNumber);
    if (item.caseState) { localStorage.setItem("caseState", item.caseState); localStorage.setItem("state", item.caseState); }
    if (item.county) localStorage.setItem("county", item.county);
    if (item.courtName) localStorage.setItem("court", item.courtName);
    if (item.primaryCharge) localStorage.setItem("offense", item.primaryCharge);
    if (item.offenseCode) localStorage.setItem("offenseCode", item.offenseCode);
    if (item.outcome) localStorage.setItem("outcome", item.outcome);
    if (item.eligibilityStatus) localStorage.setItem("eligibilityStatus", item.eligibilityStatus);
    if (item.estimatedEligibleDate) localStorage.setItem("estimatedEligibleDate", item.estimatedEligibleDate);
    const packet = getPacketData();
    packet.court = Object.assign({}, packet.court || {}, { name: item.courtName, courtName: item.courtName, county: item.county, state: item.caseState, case_number: item.caseNumber });
    packet.charges = item.charges.length ? item.charges.map(function (charge, index) { return { offense_name: charge, charge_name: charge, case_number: item.caseNumber, court_name: item.courtName, court_county: item.county, case_state: item.caseState, statute_citation: index === 0 ? item.offenseCode : "", level: index === 0 ? item.level : "", disposition: index === 0 ? item.outcome : "" }; }) : (packet.charges || []);
    packet.eligibility = Object.assign({}, packet.eligibility || {}, { status: item.eligibilityStatus, statusLabel: item.eligibilityStatus, estimatedEligibleDate: item.estimatedEligibleDate, estimated_eligible_on: item.estimatedEligibleDate });
    writeJSON("recordPathPacketData", packet);
    return item;
  }

  function toRecordWatchCase(caseData) {
    const item = normalizeCase(caseData);
    return {
      id: item.case_id,
      court: { caseNumber: item.caseNumber, courtName: item.courtName, county: item.county, caseState: item.caseState, state: item.caseState },
      charges: item.charges.length ? item.charges.map(function (charge) { return { chargeName: charge, offense_name: charge, degree: item.level, chargeLevel: item.level }; }) : [],
      outcome: { outcome: item.outcome },
      estimatedEligibleDate: item.estimatedEligibleDate,
      recordWatchStatus: item.recordWatchStatus
    };
  }

  function syncRecordWatchCases(cases) {
    const rwCases = readJSON("recordwatchCases", []);
    const byId = {};
    rwCases.forEach(function (item) { if (item && item.id) byId[item.id] = item; });
    (cases || []).forEach(function (item) { const normalized = normalizeCase(item); if (!normalized.archivedAt && !normalized.deletedAt) byId[normalized.case_id] = Object.assign({}, byId[normalized.case_id] || {}, toRecordWatchCase(normalized)); });
    writeJSON("recordwatchCases", Object.keys(byId).map(function (id) { return byId[id]; }));
  }

  function normalizeDbCase(row) {
    return normalizeCase({
      id: row.id,
      case_id: row.id,
      caseState: row.case_state || "",
      county: row.county || "",
      courtName: row.court || row.court_name || "",
      court: row.court || row.court_name || "",
      caseNumber: row.case_number || "",
      charges: row.charges || [],
      primaryCharge: row.primary_charge || "",
      eligibilityStatus: row.eligibility_status || "Not screened yet",
      estimatedEligibleDate: row.estimated_eligible_date || "",
      packetStatus: row.packet_status || "Not generated",
      paymentStatus: row.payment_status || "Unpaid",
      recordWatchStatus: row.recordwatch_status || "Not Activated",
      deletedAt: row.deleted_at,
      archivedAt: row.archived_at,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  async function refreshCases() {
    await initUserOnly();
    if (!currentUser) {
      cachedCases = loadLocalCases();
      syncRecordWatchCases(cachedCases);
      return cachedCases;
    }
    const supabase = await client();
    const { data, error } = await supabase.from("cases").select("*").eq("user_id", currentUser.id).order("updated_at", { ascending: true });
    if (error) throw new Error(error.message);
    cachedCases = activeCases((data || []).map(normalizeDbCase));
    saveLocalCases(cachedCases);
    syncRecordWatchCases(cachedCases);
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
  async function getCasesAsync() { return refreshCases(); }
  function caseMatchesId(caseRecord, caseId, compositeKey) {
    const id = String(caseId || "").trim();
    if (!id || !caseRecord) return false;
    return getStableCaseId(caseRecord) === id || getCaseCompositeKey(caseRecord) === compositeKey;
  }
  function getCaseById(caseId) {
    const id = String(caseId || localStorage.getItem(ACTIVE_CASE_KEY) || "").trim();
    const compositeKey = getCaseCompositeKey({ caseNumber: id });
    return getCases().find(function (item) { return caseMatchesId(item, id, compositeKey); }) || null;
  }
  async function setActiveCase(caseId) {
    if (!cachedCases.length) await refreshCases().catch(function () {});
    const found = getCaseById(caseId);
    if (!found) return null;
    return writeActiveCaseToStorage(found);
  }
  async function updateCase(caseId, updates) {
    const found = getCaseById(caseId);
    const next = normalizeCase(Object.assign({}, found || { case_id: caseId }, updates || {}, { updatedAt: nowIso(), lastUpdated: nowIso() }));
    if (currentUser && /^[0-9a-f-]{36}$/i.test(next.case_id)) {
      try {
        const supabase = await client();
        await supabase.from("cases").update({ case_state: next.caseState || null, county: next.county || null, court: next.courtName || null, case_number: next.caseNumber || null, eligibility_status: next.eligibilityStatus || null, estimated_eligible_date: next.estimatedEligibleDate || null, packet_status: next.packetStatus || null, payment_status: next.paymentStatus || null, updated_at: nowIso() }).eq("id", next.case_id).eq("user_id", currentUser.id);
      } catch (error) { console.warn("Remote case update skipped:", error.message); }
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
    [LOCAL_CASES_KEY, "savedCases", "recordPathCases", "recordpathai_cases"].forEach(function (key) {
      const collection = readJSON(key, null);
      if (!Array.isArray(collection)) return;
      writeJSON(key, activeCases(collection.filter(function (item) { return !caseMatchesId(item, caseId, compositeKey); })));
    });
    const rwCases = readJSON("recordwatchCases", null);
    if (Array.isArray(rwCases)) {
      writeJSON("recordwatchCases", rwCases.filter(function (item) { return item && !caseMatchesId(item, caseId, compositeKey); }));
    }
  }

  async function archiveCase(caseId, options) { return removeCase(caseId, Object.assign({}, options || {}, { forceArchive: true })); }
  async function deleteCase(caseId, options) { return removeCase(caseId, options || {}); }
  async function removeCase(caseId, options) {
    const normalizedId = String(caseId || "").trim();
    if (!normalizedId) return false;
    if (!cachedCases.length) await refreshCases().catch(function () {});
    const found = getCaseById(normalizedId) || { case_id: normalizedId, caseId: normalizedId, id: normalizedId };
    const foundId = getStableCaseId(found) || normalizedId;
    const compositeKey = getCaseCompositeKey(found);
    const archive = Boolean(options && options.forceArchive) || hasProtectedHistory(found);
    if (currentUser && /^[0-9a-f-]{36}$/i.test(foundId)) {
      try {
        const supabase = await client();
        const payload = archive ? { archived_at: nowIso(), status: "archived", updated_at: nowIso() } : { deleted_at: nowIso(), status: "deleted", updated_at: nowIso() };
        const result = await supabase.from("cases").update(payload).eq("id", foundId).eq("user_id", currentUser.id);
        if (result.error) throw result.error;
      } catch (error) {
        if (!archive) {
          try { const supabase = await client(); await supabase.from("cases").delete().eq("id", foundId).eq("user_id", currentUser.id); } catch (deleteError) { console.warn("Remote case delete skipped:", deleteError.message); }
        } else { console.warn("Remote case archive skipped:", error.message); }
      }
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

  async function saveCase(caseInput) {
    await init();
    const input = caseInput || {};
    const collected = Object.keys(input).length ? Object.assign(collectCurrentCaseFromStorage(), input) : collectCurrentCaseFromStorage();
    if (!hasMeaningfulCaseData(collected)) return null;
    const nextCase = normalizeCase(collected);
    if (!currentUser) {
      const local = getCases().filter(function (item) { return item.case_id !== nextCase.case_id && item.caseNumber !== nextCase.caseNumber; });
      local.push(nextCase);
      cachedCases = activeCases(local);
      saveLocalCases(cachedCases);
      syncRecordWatchCases(cachedCases);
      return nextCase;
    }
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
      court: nextCase.courtName || nextCase.court || null,
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
    const saved = normalizeDbCase(data);
    const local = getCases().filter(function (item) { return item.case_id !== saved.case_id && item.caseNumber !== saved.caseNumber; });
    local.push(saved);
    saveLocalCases(local);
    await refreshCases();
    return saved;
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
    if (hasMeaningfulCaseData(caseData)) await saveCase(caseData).catch(function (error) { console.warn("Draft import skipped:", error.message); });
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
    updatePasswordAfterReset,
    logout,
    getCurrentUser: function () { return currentUser; },
    refreshCurrentUser: init,
    updateCurrentUser,
    getCases,
    getCasesAsync,
    getCaseById,
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
    saveDraftSnapshot,
    getReturnUrl,
    clearReturnUrl,
    hasLegacyDemoData,
    importLegacyDemoData,
    dismissLegacyImport,
    isLoggedIn: function () { return Boolean(currentUser); },
    keys: { USERS_KEY, SESSION_KEY, DRAFT_KEY, RETURN_KEY, LEGACY_IMPORT_DISMISSED_KEY, LOCAL_CASES_KEY, ACTIVE_CASE_KEY }
  };
}());
