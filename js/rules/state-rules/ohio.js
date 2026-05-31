(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    root.RecordPathStateRules = root.RecordPathStateRules || {};
    root.RecordPathStateRules.ohio = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function includesAny(value, words) {
    var text = String(value || "").toLowerCase();
    return words.some(function (word) { return text.indexOf(word) !== -1; });
  }

  function getOhioConvictionRule(context) {
    var charge = context.primaryCharge || {};
    var level = String(charge.level || charge.degree || charge.chargeLevel || "").toUpperCase();
    var chargeText = [charge.name, charge.chargeName, charge.offenseName, charge.statuteCode, charge.offenseCode].join(" ").toLowerCase();

    if (/2921\.43/.test(chargeText) || includesAny(chargeText, ["soliciting improper compensation"])) {
      return { waitingPeriodYears: 7, waitingPeriodMonths: 84, waitingPeriodText: "7 years", ruleCitation: "Ohio R.C. 2953.32", reliefType: "Ohio conviction sealing" };
    }

    if (/\bF3\b/.test(level) || /felony\s*(3|third)/i.test(level)) {
      return { waitingPeriodYears: 3, waitingPeriodMonths: 36, waitingPeriodText: "3 years", ruleCitation: "Ohio R.C. 2953.32", reliefType: "Ohio conviction sealing" };
    }

    return { waitingPeriodYears: 1, waitingPeriodMonths: 12, waitingPeriodText: "1 year", ruleCitation: "Ohio R.C. 2953.32", reliefType: "Ohio conviction sealing" };
  }

  function resolve(context) {
    var outcome = String(context.outcome || "").toLowerCase();
    if (["dismissed", "not guilty", "acquitted", "no bill"].indexOf(outcome) !== -1) {
      return { waitingPeriodYears: 0, waitingPeriodMonths: 0, waitingPeriodText: "No waiting period", ruleCitation: "Ohio dismissal sealing", reliefType: "Ohio non-conviction sealing" };
    }
    return getOhioConvictionRule(context);
  }

  return { state: "OH", name: "Ohio", resolve: resolve };
}));
