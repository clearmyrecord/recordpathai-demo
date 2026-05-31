(function (root) {
  "use strict";
  root.RecordPathCourtProfiles = root.RecordPathCourtProfiles || {};
  root.RecordPathCourtProfiles.oh_wood_common_pleas_sealing = {
    local_profile_id: "oh_wood_common_pleas_sealing",
    court_id: "oh_wood_common_pleas",
    state: "OH",
    county: "Wood County",
    city: "Bowling Green",
    court_name: "Wood County Court of Common Pleas",
    court_type: "common_pleas",
    jurisdiction_level: "county",
    supported_relief_types: ["conviction_sealing"],
    rule_set_id: "ohio_conviction_sealing_2953_32",
    packet_template_id: "oh_wood_common_pleas_2953_32_conviction",
    packet_name: "Application for Sealing 2953.32 Conviction",
    source_pdf: "assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-32-conviction.pdf",
    mapping_json: "templates/ohio/wood-county/sealing-conviction.json",
    court_address: { line1: "One Courthouse Square", city: "Bowling Green", state: "OH", zip: "43402" },
    clerk_contact: "Wood County Clerk of Courts",
    filing_instructions: "File the Application for Sealing 2953.32 Conviction with the Wood County Court of Common Pleas Clerk. Verify current filing fee, service, hearing, and prosecutor notice requirements before filing.",
    required_attachments: ["Completed application", "Case number and conviction details", "Final discharge / sentence completion date documentation", "Any locally required proposed entry or supplemental forms"],
    filing_fee_notes: "Verify current filing fee or poverty affidavit requirements with the clerk before filing.",
    e_filing_support: "review_required",
    local_requirements_complete: true,
    workflow: { requires_clerk_filing: true, requires_prosecutor_notice_review: true, requires_hearing_review: true }
  };
}(typeof window !== "undefined" ? window : globalThis));
