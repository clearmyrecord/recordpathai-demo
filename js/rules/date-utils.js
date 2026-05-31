(function () {
  "use strict";

  function toDateOnly(value) {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    var raw = String(value || "").trim();
    if (!raw) return "";
    var match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return [match[1], match[2].padStart(2, "0"), match[3].padStart(2, "0")].join("-");
    var date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function addMonths(dateString, months) {
    var iso = toDateOnly(dateString);
    if (!iso && months !== 0) return "";
    var parts = iso.split("-").map(function (part) { return Number(part); });
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (Number.isNaN(date.getTime())) return "";
    date.setUTCMonth(date.getUTCMonth() + (Number(months) || 0));
    return date.toISOString().slice(0, 10);
  }

  function daysUntil(dateString, from) {
    var targetIso = toDateOnly(dateString);
    var fromIso = toDateOnly(from || new Date());
    if (!targetIso || !fromIso) return null;
    var target = new Date(targetIso + "T00:00:00.000Z");
    var start = new Date(fromIso + "T00:00:00.000Z");
    return Math.round((target.getTime() - start.getTime()) / 86400000);
  }

  function formatDate(dateString) {
    var iso = toDateOnly(dateString);
    if (!iso) return "Not available";
    var date = new Date(iso + "T00:00:00.000Z");
    return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }

  window.RecordPathDateUtils = { toDateOnly: toDateOnly, addMonths: addMonths, daysUntil: daysUntil, formatDate: formatDate };
}());
