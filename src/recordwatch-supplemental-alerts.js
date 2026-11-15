// Pure, timezone-stable Premium follow-up policies. Never send from this module.
// The authenticated worker still verifies Stripe payment, consent, provider and
// the immutable Supabase delivery reservation before any network call.
import { daysUntilEligibility } from "./recordwatch-alerts.js";

export const PACKET_FOLLOWUP_DAYS = Object.freeze([3, 7, 14]);
const ELIGIBILITY_FLAGS = Object.freeze({
  eligibility_180_day: "reminder_180_enabled",
  eligibility_90_day: "reminder_90_enabled",
  eligibility_30_day: "reminder_30_enabled",
  eligibility_7_day: "reminder_7_enabled",
  eligibility_reached: "reminder_day_enabled",
});
export function alertPreferenceField(kind) {
  if (Object.hasOwn(ELIGIBILITY_FLAGS, kind)) return ELIGIBILITY_FLAGS[kind];
  if (/^packet_progress_(3|7|14)_day$/.test(kind)) return "packet_progress_enabled";
  if (/^missing_details_(3|7|14)_day$/.test(kind)) return "missing_details_enabled";
  if (kind === "court_status_update") return "court_status_enabled";
  return null;
}
export function alertKindEnabled(kind, preferences) {
  const field = alertPreferenceField(kind);
  // Never use an absent preferences row as an opt-in.
  return Boolean(preferences && field && preferences[field] !== false);
}
function dateOnly(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const d = new Date(text + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === text ? text : "";
}
export function daysAfter(anchor, today) {
  const start = dateOnly(anchor), end = dateOnly(today);
  return start && end ? daysUntilEligibility(end, start) : null;
}
export function packetFollowupsForCase(savedCase, today) {
  if (!savedCase || savedCase.deleted_at || savedCase.archived_at ||
      savedCase.recordwatch_paused_at) return [];
  const anchor = dateOnly(savedCase.created_at);
  const days = daysAfter(anchor, today);
  if (!PACKET_FOLLOWUP_DAYS.includes(days)) return [];
  const missingFields = ["case_number","court_name","primary_charge","outcome"]
    .some(field => !String(savedCase[field] || "").trim());
  if (missingFields) return [{ kind: "missing_details_" + days + "_day", date: anchor }];
  const packetComplete = Boolean(savedCase.packet_generated_at) ||
    ["generated","completed","filed","mailed","delivered"].includes(
      String(savedCase.packet_status || "").toLowerCase());
  // One useful follow-up at a time: no packet-progress reminder while
  // missing-details reminders are still applicable.
  return packetComplete ? [] : [{ kind: "packet_progress_" + days + "_day", date: anchor }];
}
export function recentVerifiedCourtEvent(event, today) {
  if (!event || !["operator_verified","court_integration"].includes(event.verified_source) ||
      !/^[a-zA-Z0-9_:.\-]{8,160}$/.test(String(event.event_key||"")) ||
      !dateOnly(event.occurred_on) || !dateOnly(event.verified_at) ||
      !/^https:\/\//.test(String(event.evidence_url||""))) return false;
  // No retroactive import blast, but allow the daily scheduler up to 7 days
  // to process a new, genuinely verified event.
  const sinceVerification = daysAfter(event.verified_at, today);
  return sinceVerification !== null && sinceVerification >= 0 &&
    sinceVerification <= 7 && daysAfter(event.occurred_on,today) >= 0;
}
