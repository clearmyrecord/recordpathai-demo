(function (root) {
  "use strict";

  var STATE_ALIASES = { OHIO: "OH", OH: "OH", NEVADA: "NV", NV: "NV", "NORTH CAROLINA": "NC", NC: "NC" };
  var COURT_TYPE_ALIASES = {
    "common pleas": "common_pleas",
    "court of common pleas": "common_pleas",
    common_pleas: "common_pleas",
    municipal: "municipal",
    "municipal court": "municipal",
    district: "district",
    "district court": "district",
    superior: "superior",
    "superior court": "superior",
    criminal: "criminal",
    "criminal court": "criminal",
    justice: "justice",
    "justice court": "justice"
  };
  var OUTCOME_ALIASES = {
    convicted: "convicted", conviction: "convicted", guilty: "convicted", plea: "convicted", "found guilty": "convicted", "no contest": "convicted",
    dismissed: "dismissed", dismissal: "dismissed", "not guilty": "not_guilty", acquitted: "not_guilty", pending: "pending", sealed: "sealed", expunged: "expunged"
  };

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function compact(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
  function normalizeState(value) { return STATE_ALIASES[clean(value).toUpperCase()] || clean(value).toUpperCase(); }
  function normalizeCourtType(value) { var key = compact(value); return COURT_TYPE_ALIASES[key] || key.replace(/\s+/g, "_"); }
  function normalizeCounty(value) {
    var text = clean(value).replace(/\s+county$/i, "");
    return text ? text.replace(/\b\w/g, function (l) { return l.toUpperCase(); }) + " County" : "";
  }
  function normalizeReliefType(value) {
    var key = compact(value || "conviction sealing");
    if (["sealing", "record sealing", "conviction", "conviction sealing", "seal conviction", "seal convictions"].indexOf(key) !== -1) return "conviction_sealing";
    if (key.indexOf("dismiss") !== -1) return "dismissal_sealing";
    if (key.indexOf("expunge") !== -1) return "expungement";
    if (key.indexOf("set aside") !== -1) return "set_aside";
    if (key.indexOf("pardon") !== -1 || key.indexOf("clemency") !== -1) return "pardon_clemency";
    if (key.indexOf("juvenile") !== -1) return "juvenile_sealing";
    return key.replace(/\s+/g, "_");
  }
  function normalizeOutcome(value) { return OUTCOME_ALIASES[compact(value)] || compact(value).replace(/\s+/g, "_"); }
  function normalizeOffenseLevel(value) {
    var text = compact(value).toUpperCase();
    if (!text) return "";
    if (/\b(F3|FELONY 3|FELONY THREE|THIRD DEGREE FELONY|FELONY THIRD DEGREE)\b/.test(text)) return "F3";
    if (/\b(F1|FELONY 1|FELONY FIRST DEGREE|FIRST DEGREE FELONY)\b/.test(text)) return "F1";
    if (/\b(F2|FELONY 2|FELONY SECOND DEGREE|SECOND DEGREE FELONY)\b/.test(text)) return "F2";
    if (/\b(F4|FELONY 4|FELONY FOURTH DEGREE|FOURTH DEGREE FELONY)\b/.test(text)) return "F4";
    if (/\b(F5|FELONY 5|FELONY FIFTH DEGREE|FIFTH DEGREE FELONY)\b/.test(text)) return "F5";
    if (/\b(MM|MINOR MISDEMEANOR)\b/.test(text)) return "MM";
    if (/\b(M1|MISDEMEANOR 1|FIRST DEGREE MISDEMEANOR)\b/.test(text)) return "M1";
    if (/\b(M2|MISDEMEANOR 2|SECOND DEGREE MISDEMEANOR)\b/.test(text)) return "M2";
    if (/\b(M3|MISDEMEANOR 3|THIRD DEGREE MISDEMEANOR)\b/.test(text)) return "M3";
    if (/\b(M4|MISDEMEANOR 4|FOURTH DEGREE MISDEMEANOR)\b/.test(text)) return "M4";
    if (/\b(MISDEMEANOR| M )\b/.test(" " + text + " ")) return "M";
    if (/\bFELONY\b/.test(text)) return "FELONY";
    return clean(value).toUpperCase();
  }
  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    var raw = clean(value); if (!raw) return null;
    var match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) return new Date(Number(match[3].length === 2 ? "20" + match[3] : match[3]), Number(match[1]) - 1, Number(match[2]), 12);
    var parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
  }
  function toIsoDate(value) { var d = parseDate(value); return d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : ""; }
  function addPeriod(dateValue, period) { var d = parseDate(dateValue); if (!d) return ""; d.setFullYear(d.getFullYear() + Number(period && period.years || 0)); d.setMonth(d.getMonth() + Number(period && period.months || 0)); return toIsoDate(d); }
  function daysUntil(value) { var d = parseDate(value); if (!d) return null; var today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0); return Math.ceil((d - today) / 86400000); }
  function formatDate(value) { var d = parseDate(value); return d ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Not available"; }
  function getFirstDate(source, keys) { source = source || {}; for (var i = 0; i < keys.length; i += 1) { var iso = toIsoDate(source[keys[i]]); if (iso) return { key: keys[i], value: iso }; } return { key: "", value: "" }; }
  function firstValue(source, keys) { source = source || {}; for (var i = 0; i < keys.length; i += 1) { if (clean(source[keys[i]])) return source[keys[i]]; } return ""; }

  root.RecordPathRuleDateUtils = { clean: clean, compact: compact, normalizeState: normalizeState, normalizeCounty: normalizeCounty, normalizeCourtType: normalizeCourtType, normalizeReliefType: normalizeReliefType, normalizeOutcome: normalizeOutcome, normalizeOffenseLevel: normalizeOffenseLevel, parseDate: parseDate, toIsoDate: toIsoDate, addPeriod: addPeriod, daysUntil: daysUntil, formatDate: formatDate, getFirstDate: getFirstDate, firstValue: firstValue };
}(typeof window !== "undefined" ? window : globalThis));
