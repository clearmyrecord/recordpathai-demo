(function () {
  "use strict";

  const state = { entries: [], summary: null };

  function money(cents, currency) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format((Number(cents) || 0) / 100);
  }

  function esc(value) {
    return String(value || "").replace(/[&<>'"]/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char];
    });
  }

  function humanType(type) {
    return String(type || "").replace(/_/g, " ").replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (!window.RecordPathSupabase) return headers;
    try {
      const supabase = await window.RecordPathSupabase.getClient();
      const result = await supabase.auth.getSession();
      const token = result && result.data && result.data.session && result.data.session.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.warn("Ledger auth token unavailable:", error.message);
    }
    return headers;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: await authHeaders(), credentials: "same-origin" });
    if (response.status === 401) return { ok: false, unauthorized: true };
    if (!response.ok) throw new Error(`Ledger request failed: ${response.status}`);
    return response.json();
  }

  function renderSummary(summary) {
    const cards = document.getElementById("ledgerSummaryCards");
    if (!cards) return;
    const last = summary && summary.last_transaction_at ? formatDate(summary.last_transaction_at) : "No transactions yet";
    const values = [
      ["Total Purchases", money(summary && summary.total_purchases_cents)],
      ["Credits / Refunds", money(summary && summary.total_credits_cents)],
      ["Current Balance", money(summary && summary.current_balance_cents)],
      ["Last Transaction", last]
    ];
    cards.innerHTML = values.map(function (item) {
      return `<article class="ledger-summary-card"><p class="eyebrow-mini">${esc(item[0])}</p><h3>${esc(item[1])}</h3></article>`;
    }).join("");
  }

  function renderTable(entries) {
    const wrap = document.getElementById("ledgerTableWrap");
    const empty = document.getElementById("ledgerEmptyState");
    const body = document.getElementById("ledgerTableBody");
    if (!wrap || !empty || !body) return;
    if (!entries.length) {
      wrap.hidden = true;
      empty.hidden = false;
      body.innerHTML = "";
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    body.innerHTML = entries.map(function (entry) {
      const currency = entry.currency || "usd";
      return `<tr>
        <td>${esc(formatDate(entry.created_at))}</td>
        <td>${esc(entry.description)}</td>
        <td>${esc(entry.case_id || "—")}</td>
        <td>${esc(humanType(entry.entry_type))}</td>
        <td class="ledger-money">${esc(entry.debit_cents ? money(entry.debit_cents, currency) : "—")}</td>
        <td class="ledger-money">${esc(entry.credit_cents ? money(entry.credit_cents, currency) : "—")}</td>
        <td><span class="ledger-status-badge ${esc(entry.status || "posted")}">${esc(entry.status || "posted")}</span></td>
      </tr>`;
    }).join("");
  }

  function csvCell(value) {
    const text = String(value == null ? "" : value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv() {
    const rows = [["Date", "Description", "Case", "Type", "Debit", "Credit", "Status"]].concat(state.entries.map(function (entry) {
      return [
        entry.created_at || "",
        entry.description || "",
        entry.case_id || "",
        humanType(entry.entry_type),
        ((Number(entry.debit_cents) || 0) / 100).toFixed(2),
        ((Number(entry.credit_cents) || 0) / 100).toFixed(2),
        entry.status || "posted"
      ];
    }));
    const blob = new Blob([rows.map(function (row) { return row.map(csvCell).join(","); }).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "recordpathai-ledger.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  async function loadLedger() {
    const section = document.getElementById("purchaseLedgerSection");
    if (!section) return;
    try {
      const results = await Promise.all([fetchJson("/api/ledger"), fetchJson("/api/ledger/summary")]);
      if (results.some(function (item) { return item.unauthorized; })) {
        renderSummary({});
        renderTable([]);
        return;
      }
      state.entries = results[0].entries || [];
      state.summary = results[1].summary || {};
      renderSummary(state.summary);
      renderTable(state.entries);
    } catch (error) {
      console.warn(error);
      renderSummary({});
      renderTable([]);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const button = document.getElementById("downloadLedgerCsv");
    if (button) button.addEventListener("click", downloadCsv);
    if (window.RecordPathUserStore && RecordPathUserStore.ready) {
      RecordPathUserStore.ready.then(loadLedger);
    } else {
      loadLedger();
    }
  });

  window.RecordPathLedger = { loadLedger, downloadCsv };
}());
