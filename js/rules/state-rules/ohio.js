(function (root) {
  "use strict";
  root.RecordPathStateRules = root.RecordPathStateRules || {};
  root.RecordPathStateRules.ohio_conviction_sealing_2953_32 = {
    rule_set_id: "ohio_conviction_sealing_2953_32",
    state: "OH",
    relief_type: "conviction_sealing",
    statute: "Ohio R.C. 2953.32",
    version: "2026.05.31",
    effective_date: "2023-04-04",
    source_url: "https://codes.ohio.gov/ohio-revised-code/section-2953.32",
    last_reviewed: "2026-05-31",
    notes: "Central statewide sealing rule set. Local court profiles must reference this rule set instead of duplicating waiting-period logic.",
    waiting_periods: {
      F3: { years: 3, months: 0, label: "3 years" },
      F4: { years: 1, months: 0, label: "1 year" },
      F5: { years: 1, months: 0, label: "1 year" },
      M: { years: 1, months: 0, label: "1 year" },
      M1: { years: 1, months: 0, label: "1 year" },
      M2: { years: 1, months: 0, label: "1 year" },
      M3: { years: 1, months: 0, label: "1 year" },
      M4: { years: 1, months: 0, label: "1 year" },
      MM: { years: 0, months: 6, label: "6 months" }
    },
    date_source_priority: ["sentenceCompletionDate", "probationCompletedDate", "dischargeDate", "finalDischargeDate", "completionDate"],
    disqualifying_flags: [
      "pending_criminal_proceedings", "f1_conviction", "f2_conviction", "three_or_more_f3_felonies", "felony_offense_of_violence", "sex_or_registration_offense", "victim_under_13", "domestic_violence_m1_m2", "excluded_traffic_offense", "public_office_theft_offense"
    ]
  };
}(typeof window !== "undefined" ? window : globalThis));
