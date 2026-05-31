(function () {
  "use strict";
  window.RecordPathStateRules = window.RecordPathStateRules || {};
  window.RecordPathStateRules.northCarolina = {
    id: "north-carolina",
    aliases: ["nc", "north carolina", "north-carolina"],
    defaultWaitingMonths: 60,
    waitingMonths: { dismissed: 0, acquitted: 0, misdemeanor: 60, felony: 120, diversion: 12 }
  };
}());
