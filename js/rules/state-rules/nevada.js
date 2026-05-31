(function () {
  "use strict";
  window.RecordPathStateRules = window.RecordPathStateRules || {};
  window.RecordPathStateRules.nevada = {
    id: "nevada",
    aliases: ["nv", "nevada"],
    defaultWaitingMonths: 24,
    waitingMonths: { dismissed: 0, misdemeanor: 24, felony: 84, diversion: 12 }
  };
}());
