(function () {
  "use strict";
  window.RecordPathStateRules = window.RecordPathStateRules || {};
  window.RecordPathStateRules.ohio = {
    id: "ohio",
    aliases: ["oh", "ohio"],
    defaultWaitingMonths: 12,
    waitingMonths: {
      dismissed: 0,
      acquitted: 0,
      no_bill: 0,
      misdemeanor: 12,
      minor_misdemeanor: 12,
      felony: 12,
      f3: 36,
      improper_compensation: 84,
      diversion: 12
    }
  };
}());
