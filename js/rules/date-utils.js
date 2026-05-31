(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RecordPathRuleDateUtils = factory();
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function pad(value) { return String(value).padStart(2, "0"); }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
    }
    var raw = String(value).trim();
    if (!raw) return null;
    var match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      var isoDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
      return Number.isNaN(isoDate.getTime()) ? null : isoDate;
    }
    match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      var year = Number(match[3].length === 2 ? "20" + match[3] : match[3]);
      var slashDate = new Date(year, Number(match[1]) - 1, Number(match[2]), 12);
      return Number.isNaN(slashDate.getTime()) ? null : slashDate;
    }
    var parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
  }

  function toIsoDate(value) {
    var parsed = parseDate(value);
    if (!parsed) return "";
    return parsed.getFullYear() + "-" + pad(parsed.getMonth() + 1) + "-" + pad(parsed.getDate());
  }

  function addYears(value, years) {
    var parsed = parseDate(value);
    if (!parsed && years !== 0) return "";
    if (!parsed) parsed = new Date();
    parsed.setFullYear(parsed.getFullYear() + Number(years || 0));
    return toIsoDate(parsed);
  }

  function addMonths(value, months) {
    var parsed = parseDate(value);
    if (!parsed && months !== 0) return "";
    if (!parsed) parsed = new Date();
    parsed.setMonth(parsed.getMonth() + Number(months || 0));
    return toIsoDate(parsed);
  }

  function daysUntil(value, now) {
    var target = parseDate(value);
    if (!target) return null;
    var base = parseDate(now || new Date());
    if (!base) return null;
    base.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - base.getTime()) / 86400000);
  }

  function formatDate(value) {
    var parsed = parseDate(value);
    if (!parsed) return "";
    return parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  return { parseDate: parseDate, toIsoDate: toIsoDate, addYears: addYears, addMonths: addMonths, daysUntil: daysUntil, formatDate: formatDate };
}));
