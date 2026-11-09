(function () {
  "use strict";
  const byId = id => document.getElementById(id);
  const money = cents => "$" + ((Number(cents) || 0) / 100).toFixed(2);

  async function refreshDashboard() {
    const response = await RecordWatchMessageProvider.apiFetch("/api/affiliates/me");
    const partner = response.partner;
    byId("affiliateApplication").hidden = Boolean(partner);
    byId("affiliateDashboard").hidden = !partner;
    if (!partner) return;
    byId("affiliatePartnerStatus").textContent = partner.status === "approved"
      ? "Approved — track attributed accounts and earned commissions below."
      : "Application " + partner.status + ". Referral credit is disabled until approved.";
    const input = byId("affiliateShareLink");
    input.value = partner.referral_link || "";
    byId("affiliateCopyLink").disabled = !partner.referral_link;
    byId("affiliateReferralCount").textContent = String(response.totals?.referrals || 0);
    byId("affiliatePending").textContent = money(response.totals?.pending_cents);
    byId("affiliatePaid").textContent = money(response.totals?.paid_cents);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const state = byId("affiliateProgramState");
    try {
      const readyResponse = await fetch("/api/affiliates/readiness", { cache: "no-store" });
      if (!readyResponse.ok) throw new Error("Partner readiness unavailable");
      const ready = await readyResponse.json();
      if (!ready.applications_open || !ready.referral_tracking_enabled) {
        state.textContent = "Invitation requests are open by email. Tracked referrals, applications and payouts are not live yet.";
        byId("affiliateInterest").hidden = false;
        return;
      }
      if (window.RecordPathUserStore?.readyForAuth) await RecordPathUserStore.readyForAuth;
      if (!window.RecordPathUserStore?.isLoggedIn?.()) {
        state.textContent = "Partner applications are open to signed-in users; all applications require manual approval.";
        byId("affiliateSignIn").hidden = false;
        return;
      }
      state.textContent = "Applications open · Approval required · Payouts under manual review";
      await refreshDashboard();
    } catch {
      state.textContent = "Partner enrollment is not yet available. You may request an invitation by email.";
      byId("affiliateInterest").hidden = false;
    }

    byId("affiliateApplication").addEventListener("submit", async function (event) {
      event.preventDefault();
      const submit = this.querySelector('button[type="submit"]');
      const form = new FormData(this);
      submit.disabled = true;
      state.textContent = "Submitting application…";
      try {
        await RecordWatchMessageProvider.apiFetch("/api/affiliates/apply", {
          method: "POST",
          body: {
            display_name: String(form.get("display_name") || "").trim(),
            partner_type: String(form.get("partner_type") || ""),
            website: String(form.get("website") || "").trim(),
            audience_description: String(form.get("audience_description") || "").trim(),
            accept_disclosures: form.get("accept_disclosures") === "on"
          }
        });
        state.textContent = "Application saved. RecordPathAI must review and approve it before referrals can earn commissions.";
        await refreshDashboard();
      } catch (error) {
        state.textContent = error.message || "Could not save application. No partner account was activated.";
      } finally {
        submit.disabled = false;
      }
    });
    byId("affiliateCopyLink").addEventListener("click", async function () {
      const link = byId("affiliateShareLink").value;
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        this.textContent = "Copied";
      } catch {
        byId("affiliateShareLink").focus();
        byId("affiliateShareLink").select();
      }
    });
  });
}());
