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
    byId("affiliateEligible").textContent = money(response.totals?.eligible_cents);
    const setup = byId("affiliatePayoutSetup");
    const recipientType = byId("affiliatePayoutEntityType");
    const payoutStatus = byId("affiliatePayoutStatus");
    setup.disabled = partner.status !== "approved";
    recipientType.disabled = partner.status !== "approved";
    if (partner.status !== "approved") {
      payoutStatus.textContent = "Only approved partners may set up Stripe payouts.";
    } else {
      try {
        const payout = await RecordWatchMessageProvider.apiFetch("/api/affiliates/payout-status");
        setup.disabled = !payout.payout_processing_enabled;
        recipientType.disabled = !payout.payout_processing_enabled || payout.onboarding_started;
        setup.textContent = payout.onboarding_started ? "Update Stripe payout details" : "Set up secure Stripe payouts";
        if (!payout.payout_processing_enabled) {
          payoutStatus.textContent = "Stripe payout onboarding is being activated.";
        } else if (!payout.onboarding_started) {
          payoutStatus.textContent = "Stripe needs your identity and payment details before payout approval.";
        } else if (!payout.recipient_ready) {
          payoutStatus.textContent = "Stripe recipient verification is incomplete. Continue onboarding.";
        } else if (!payout.tax_reviewed || payout.payouts_paused) {
          payoutStatus.textContent = "Stripe setup verified. Awaiting RecordPathAI tax and compliance clearance.";
        } else {
          payoutStatus.textContent = "Payout account approved. Eligible earnings are released after owner review.";
        }
      } catch {
        payoutStatus.textContent = "Stripe payout status cannot be checked right now.";
        setup.disabled = true;
      }
    }
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
    byId("affiliatePayoutSetup").addEventListener("click", async function () {
      this.disabled = true;
      const payoutStatus = byId("affiliatePayoutStatus");
      payoutStatus.textContent = "Opening Stripe's secure payout verification…";
      try {
        const result = await RecordWatchMessageProvider.apiFetch("/api/affiliates/payout-onboard",{
          method:"POST",
          body:{entity_type:byId("affiliatePayoutEntityType").value}
        });
        if (!result.url) throw new Error("Stripe onboarding link not available.");
        window.location.assign(result.url);
      } catch (error) {
        payoutStatus.textContent = error.message || "Could not start Stripe payout enrollment.";
        this.disabled = false;
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
