(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    root.RecordPathCourtProfiles = root.RecordPathCourtProfiles || {};
    root.RecordPathCourtProfiles["ohio:wood:municipal"] = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return {
    id: "ohio:wood:municipal",
    state: "OH",
    county: "Wood",
    courtName: "Wood County Municipal Court",
    aliases: ["wood county municipal court", "wood municipal"],
    defaultRuleCitation: "Ohio R.C. 2953.32 conviction sealing",
    formsPath: "assets/forms/ohio/wood/municipal/",
    filingNotes: "Wood County Municipal Court conviction sealing profile. Verify local filing instructions before submission."
  };
}));
