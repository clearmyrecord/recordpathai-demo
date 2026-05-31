(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    root.RecordPathCourtProfiles = root.RecordPathCourtProfiles || {};
    root.RecordPathCourtProfiles["ohio:wood:common-pleas"] = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return {
    id: "ohio:wood:common-pleas",
    state: "OH",
    county: "Wood",
    courtName: "Wood County Court of Common Pleas",
    aliases: ["wood county court of common pleas", "wood county common pleas", "wood common pleas"],
    defaultRuleCitation: "Ohio R.C. 2953.32 conviction sealing",
    formsPath: "assets/forms/ohio/wood/court-of-common-pleas/",
    filingNotes: "Wood County Common Pleas conviction sealing profile. Verify local filing instructions before submission."
  };
}));
