(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./court-profiles/ohio/wood-county-common-pleas"), require("./court-profiles/ohio/wood-county-municipal"));
  } else {
    root.RecordPathCourtRegistry = factory(
      root.RecordPathCourtProfiles && root.RecordPathCourtProfiles["ohio:wood:common-pleas"],
      root.RecordPathCourtProfiles && root.RecordPathCourtProfiles["ohio:wood:municipal"]
    );
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function (woodCommonPleas, woodMunicipal) {
  "use strict";

  var profiles = [woodCommonPleas, woodMunicipal].filter(Boolean);

  function clean(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function normalizeCounty(value) { return clean(value).replace(/ county$/, ""); }
  function normalizeState(value) {
    var text = clean(value);
    var map = { ohio: "oh", oh: "oh", nevada: "nv", nv: "nv", "north carolina": "nc", nc: "nc" };
    return map[text] || text;
  }

  function matchProfile(caseData) {
    caseData = caseData || {};
    var court = caseData.court || {};
    var state = normalizeState(court.caseState || court.state || caseData.state);
    var county = normalizeCounty(court.county || caseData.county);
    var courtName = clean(court.courtName || court.name || caseData.courtName || caseData.court_name);

    return profiles.find(function (profile) {
      var stateMatches = !state || normalizeState(profile.state) === state;
      var countyMatches = !county || normalizeCounty(profile.county) === county;
      var names = [profile.courtName].concat(profile.aliases || []).map(clean);
      var courtMatches = !courtName || names.some(function (name) { return courtName === name || courtName.indexOf(name) !== -1 || name.indexOf(courtName) !== -1; });
      return stateMatches && countyMatches && courtMatches;
    }) || null;
  }

  return { profiles: profiles, matchProfile: matchProfile, normalizeState: normalizeState, normalizeCounty: normalizeCounty };
}));
