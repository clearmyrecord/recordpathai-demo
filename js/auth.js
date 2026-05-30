(function () {
  "use strict";

  function currentPageUrl() {
    return `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search || ""}${window.location.hash || ""}`;
  }

  function signupUrl(returnUrl) {
    return `signup.html?returnUrl=${encodeURIComponent(returnUrl || currentPageUrl())}`;
  }

  function loginUrl(returnUrl) {
    return `login.html?returnUrl=${encodeURIComponent(returnUrl || currentPageUrl())}`;
  }

  function preserveIntake(returnUrl) {
    if (window.RecordPathUserStore && typeof RecordPathUserStore.saveDraftSnapshot === "function") {
      RecordPathUserStore.saveDraftSnapshot(returnUrl || currentPageUrl());
    }
  }

  function requireAuth(action, returnUrl) {
    if (window.RecordPathUserStore && RecordPathUserStore.isLoggedIn()) return true;
    const target = returnUrl || currentPageUrl();
    preserveIntake(target);
    const label = action ? ` to ${action}` : "";
    sessionStorage.setItem("recordPathAuthPrompt", `Create a demo account or sign in${label}.`);
    window.location.href = signupUrl(target);
    return false;
  }

  function requireProtectedPage(action) {
    if (!requireAuth(action || "open this page", currentPageUrl())) return false;
    return true;
  }

  function addLink(nav, href, text, className) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    if (className) a.className = className;
    a.setAttribute("data-auth-link", text.toLowerCase().replace(/\s+/g, "-"));
    nav.appendChild(a);
    return a;
  }

  function renderHeaderLinks() {
    if (!window.RecordPathUserStore) return;
    document.querySelectorAll("nav.nav, nav.main-nav, nav.nav-links").forEach((nav) => {
      nav.querySelectorAll("[data-auth-link]").forEach((node) => node.remove());
      const user = RecordPathUserStore.getCurrentUser();
      if (user) {
        addLink(nav, "dashboard.html", "Dashboard");
        addLink(nav, "account.html", "Account");
        const logout = addLink(nav, "#logout", "Logout");
        logout.addEventListener("click", function (event) {
          event.preventDefault();
          RecordPathUserStore.logout();
          window.location.href = "index.html";
        });
      } else {
        addLink(nav, loginUrl(currentPageUrl()), "Login");
        addLink(nav, signupUrl(currentPageUrl()), "Create Account", "nav-cta");
      }
    });
  }

  function wireAuthActionGuards(root) {
    (root || document).querySelectorAll("[data-requires-auth]").forEach((node) => {
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
    preserveIntake,
    requireAuth,
    requireProtectedPage,
    renderHeaderLinks,
    wireAuthActionGuards
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderHeaderLinks();
    wireAuthActionGuards(document);
  });
}());
