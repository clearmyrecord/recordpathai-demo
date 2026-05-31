(function () {
  "use strict";
  function normalize(value) { return String(value || "").trim().toLowerCase(); }
  function findProfile(caseData) {
    var court = caseData && caseData.court || {};
    var state = normalize(court.caseState || caseData.caseState || court.state);
    var county = normalize(court.county || caseData.county);
    var name = normalize(court.courtName || court.name || caseData.court);
    return (window.RecordPathCourtProfiles || []).find(function (profile) {
      return (!profile.state || state.indexOf(profile.state) !== -1 || profile.state.indexOf(state) !== -1) &&
        (!profile.county || county.indexOf(profile.county) !== -1) &&
        (!profile.courtName || name.indexOf(normalize(profile.courtName)) !== -1 || normalize(profile.courtName).indexOf(name) !== -1);
    }) || null;
  }
  window.RecordPathCourtRegistry = { findProfile: findProfile };
}());
