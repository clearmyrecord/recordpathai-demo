(function () {
  "use strict";

  function relativeRoot() {
    const script = document.querySelector('script[src$="js/auth.js"]');
    const src = script ? script.getAttribute("src") || "" : "";
    const match = src.match(/^((?:\.\.\/)*)js\/auth\.js(?:[?#].*)?$/);
    return match ? match[1] : "";
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

  function currentPageUrl() {
    const fileName = window.location.pathname.split("/").pop() || "index.html";
    const parentDir = window.location.pathname.split("/").filter(Boolean).slice(-2, -1)[0] || "";
    const path = relativeRoot() && parentDir ? `${parentDir}/${fileName}` : fileName;
    return sanitizeReturnUrl(`${path}${window.location.search || ""}${window.location.hash || ""}`);
  }

  function signupUrl(returnUrl) { return `${relativeRoot()}signup.html?returnUrl=${encodeURIComponent(sanitizeReturnUrl(returnUrl || currentPageUrl()))}`; }
  function loginUrl(returnUrl) { return `${relativeRoot()}login.html?returnUrl=${encodeURIComponent(sanitizeReturnUrl(returnUrl || currentPageUrl()))}`; }

  function preserveIntake(returnUrl) {
    if (window.RecordPathUserStore && typeof RecordPathUserStore.saveDraftSnapshot === "function") RecordPathUserStore.saveDraftSnapshot(returnUrl || currentPageUrl());
  }

  async function ensureReady() {
    if (window.RecordPathUserStore && (RecordPathUserStore.readyForAuth || RecordPathUserStore.ready)) await (RecordPathUserStore.readyForAuth || RecordPathUserStore.ready);
    return window.RecordPathUserStore || null;
  }

  function redirectToSignup(action, returnUrl) {
    const target = sanitizeReturnUrl(returnUrl || currentPageUrl());
    preserveIntake(target);
    const label = action ? ` to ${action}` : "";
    sessionStorage.setItem("recordPathAuthPrompt", `Create an account or sign in${label}.`);
    window.location.href = signupUrl(target);
  }

  function requireAuth(action, returnUrl) {
    if (window.RecordPathUserStore && RecordPathUserStore.isLoggedIn()) return true;
    ensureReady().then(function (store) {
      if (store && store.isLoggedIn()) return;
      redirectToSignup(action, returnUrl);
    });
    return false;
  }

  async function requireAuthAsync(action, returnUrl) {
    const store = await ensureReady();
    if (store && store.isLoggedIn()) return true;
    redirectToSignup(action, returnUrl);
    return false;
  }

  function requireProtectedPage(action) { return requireAuth(action || "open this page", currentPageUrl()); }
  async function requireProtectedPageAsync(action) {
    const store = await ensureReady();
    const session = store && typeof store.getCurrentSession === "function" ? store.getCurrentSession() : null;
    if (store && store.isLoggedIn() && session) {
      if (store.casesReady) store.casesReady.catch(function () {});
      return true;
    }
    window.location.href = loginUrl(currentPageUrl());
    return false;
  }

  function addLink(container, href, text, className) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    a.className = ["auth-utility-link", className].filter(Boolean).join(" ");
    a.setAttribute("data-auth-link", text.toLowerCase().replace(/\s+/g, "-"));
    container.appendChild(a);
    return a;
  }

  function renderHeaderLinks() {
    if (!window.RecordPathUserStore) return;
    const utilities = document.querySelectorAll("[data-auth-utility]");
    if (!utilities.length) return;

    const user = RecordPathUserStore.getCurrentUser();
    utilities.forEach(function (utility) {
      utility.querySelectorAll("[data-auth-link]").forEach(function (node) { node.remove(); });
      if (user) {
        addLink(utility, `${relativeRoot()}dashboard.html`, "Dashboard");
        addLink(utility, `${relativeRoot()}account.html`, "Account");
        const logout = addLink(utility, "#logout", "Logout");
        logout.addEventListener("click", async function (event) {
          event.preventDefault();
          await RecordPathUserStore.logout();
          window.location.href = `${relativeRoot()}index.html`;
        });
      } else {
        addLink(utility, loginUrl(currentPageUrl()), "Login", "auth-login");
        addLink(utility, signupUrl(currentPageUrl()), "Create Account", "auth-create-account");
      }
    });
  }

  function wireHeaderMenus() {
    document.querySelectorAll(".header-shell-modern").forEach(function (headerShell) {
      const toggle = headerShell.querySelector(".menu-toggle");
      if (!toggle || toggle.dataset.menuAttached === "true") return;
      toggle.dataset.menuAttached = "true";
      toggle.addEventListener("click", function () {
        const isOpen = headerShell.classList.toggle("nav-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
    });
  }

  function showLegacyImportPrompt() {
    if (!window.RecordPathUserStore || !RecordPathUserStore.isLoggedIn() || !RecordPathUserStore.hasLegacyDemoData()) return;
    if (document.getElementById("legacyImportBanner")) return;
    const main = document.querySelector("main");
    if (!main) return;
    const banner = document.createElement("div");
    banner.id = "legacyImportBanner";
    banner.className = "container info-banner";
    banner.innerHTML = '<strong>Import demo data?</strong> We found previous browser-only RecordPathAI data. Import it into this Supabase account? <button class="btn btn-primary" type="button" data-import-demo>Import</button> <button class="btn btn-secondary" type="button" data-dismiss-demo>Not now</button> <span class="meta-note" data-import-status></span>';
    main.insertBefore(banner, main.firstChild);
    banner.querySelector("[data-import-demo]").addEventListener("click", async function () {
      const status = banner.querySelector("[data-import-status]");
      status.textContent = "Importing…";
      try {
        const result = await RecordPathUserStore.importLegacyDemoData();
        status.textContent = `Imported ${result.casesImported || 0} case(s).`;
        setTimeout(function () { banner.remove(); window.location.reload(); }, 800);
      } catch (error) { status.textContent = error.message; }
    });
    banner.querySelector("[data-dismiss-demo]").addEventListener("click", function () {
      RecordPathUserStore.dismissLegacyImport();
      banner.remove();
    });
  }


  async function authDiagnostics() {
    const supabaseDiagnostics = window.RecordPathSupabase && typeof RecordPathSupabase.getDiagnostics === "function" ? await RecordPathSupabase.getDiagnostics() : {};
    const storeReady = Boolean(window.RecordPathUserStore && RecordPathUserStore.ready);
    const user = window.RecordPathUserStore && typeof RecordPathUserStore.getCurrentUser === "function" ? RecordPathUserStore.getCurrentUser() : null;
    const state = {
      supabaseConfigLoaded: Boolean(supabaseDiagnostics.configLoaded),
      supabaseClientLoaded: Boolean(supabaseDiagnostics.clientLoaded),
      userStoreInitialized: storeReady,
      currentAuthState: user ? "signed_in" : "signed_out",
      configEndpoint: supabaseDiagnostics.configEndpoint || "/api/config/supabase"
    };
    if (supabaseDiagnostics.configError) state.configError = supabaseDiagnostics.configError;
    if (supabaseDiagnostics.clientError) state.clientError = supabaseDiagnostics.clientError;
    console.info("RecordPathAI auth diagnostics", state);
    return state;
  }

  async function logAuthDiagnostics() {
    try { await authDiagnostics(); } catch (error) { console.warn("RecordPathAI auth diagnostics failed:", error); }
  }

  function wireAuthActionGuards(root) {
    (root || document).querySelectorAll("[data-requires-auth]").forEach(function (node) {
      if (node.dataset.authGuardAttached === "true") return;
      node.dataset.authGuardAttached = "true";
      node.addEventListener("click", function (event) {
        if (window.RecordPathUserStore && RecordPathUserStore.isLoggedIn()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        requireAuth(node.getAttribute("data-auth-action") || node.textContent.trim(), node.getAttribute("data-return-url") || currentPageUrl());
      }, true);
    });
  }

  window.RecordPathAuth = {
    currentPageUrl,
    signupUrl,
    loginUrl,
    sanitizeReturnUrl,
    relativeRoot,
    preserveIntake,
    requireAuth,
    requireAuthAsync,
    requireProtectedPage,
    requireProtectedPageAsync,
    renderHeaderLinks,
    wireAuthActionGuards,
    showLegacyImportPrompt,
    diagnostics: authDiagnostics,
    logDiagnostics: logAuthDiagnostics
  };

  document.addEventListener("DOMContentLoaded", function () {
    wireHeaderMenus();
    renderHeaderLinks();
    wireAuthActionGuards(document);
    ensureReady().then(function () {
      renderHeaderLinks();
      showLegacyImportPrompt();
      logAuthDiagnostics();
    });
  });
}());
