(function (root) {
  "use strict";
  var utils = root.RecordPathRuleDateUtils;
  var registry = [{
    court_id: "oh_wood_common_pleas",
    state: "OH",
    county: "Wood County",
    city: "Bowling Green",
    court_name: "Wood County Court of Common Pleas",
    court_type: "common_pleas",
    jurisdiction_level: "county",
    supported_relief_types: ["conviction_sealing"],
    rule_set_id: "ohio_conviction_sealing_2953_32",
    local_profile_id: "oh_wood_common_pleas_sealing",
    packet_template_id: "oh_wood_common_pleas_2953_32_conviction",
    source_pdf: "assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-32-conviction.pdf",
    mapping_json: "templates/ohio/wood-county/sealing-conviction.json",
    aliases: ["wood county common pleas", "wood county court of common pleas", "court of common pleas wood county", "court of common pleas, wood county"]
  }];

  function scoreCourt(query, court) {
    var score = 0;
    var state = utils.normalizeState(query.state || query.caseState);
    var county = utils.normalizeCounty(query.county || query.caseCounty);
    var courtName = utils.compact(query.courtName || query.court_name || query.court || query.courtSlug || query.court_id);
    var courtType = utils.normalizeCourtType(query.courtType || query.court_type);
    var city = utils.compact(query.city);
    if (query.court_id && query.court_id === court.court_id) score += 100;
    if (state && state === court.state) score += 15;
    if (county && county === court.county) score += 20;
    if (city && city === utils.compact(court.city)) score += 5;
    if (courtType && courtType === court.court_type) score += 15;
    var names = [court.court_name, court.court_id].concat(court.aliases || []).map(utils.compact);
    if (courtName && names.indexOf(courtName) !== -1) score += 50;
    else if (courtName && names.some(function (name) { return name.indexOf(courtName) !== -1 || courtName.indexOf(name) !== -1; })) score += 30;
    return score;
  }

  function resolveCourt(query) {
    query = query || {};
    var matches = registry.map(function (court) { return { court: court, score: scoreCourt(query, court) }; }).sort(function (a, b) { return b.score - a.score; });
    var best = matches[0];
    if (!best || best.score < 50) return null;
    return best.court;
  }

  root.RecordPathCourtRegistry = { courts: registry, resolveCourt: resolveCourt };
}(typeof window !== "undefined" ? window : globalThis));
