(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.RecordPathStateRules = root.RecordPathStateRules || {}; root.RecordPathStateRules.nevada = factory(); }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function resolve(context) {
    var level = String((context.primaryCharge && (context.primaryCharge.level || context.primaryCharge.degree || context.primaryCharge.chargeLevel)) || "").toUpperCase();
    var years = level.indexOf("F") === 0 || /FELONY/.test(level) ? 7 : 2;
    return { waitingPeriodYears: years, waitingPeriodMonths: years * 12, waitingPeriodText: years + " years", ruleCitation: "Nevada record sealing estimate", reliefType: "Nevada record sealing" };
  }
  return { state: "NV", name: "Nevada", resolve: resolve };
}));
