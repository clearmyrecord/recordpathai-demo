(function () {
  "use strict";

  function getMissing(caseData) {
    return window.RecordWatchRules ? window.RecordWatchRules.getMissingRequirements(caseData) : [];
  }

  function getRisks(caseData) {
    return window.RecordWatchRules ? window.RecordWatchRules.getRiskFlags(caseData) : [];
  }

  function getStatus(caseData) {
    return window.RecordWatchRules ? window.RecordWatchRules.calculateCaseStatus(caseData) : "More information needed";
  }

  function getNextAction(caseData) {
    var status = getStatus(caseData);
    var missing = getMissing(caseData);
    var risks = getRisks(caseData);

    if (status === "Pending case") return "Wait for disposition / update case outcome";
    if (risks.length) return "Recommend legal review before filing";
    if (status === "More information needed") return "Gather missing information";
    if (missing.some(function (item) { return /court costs|fines|restitution/i.test(item); })) return "Confirm fines/restitution/court costs are paid";
    if (status === "Eligible now") return "Generate court packet";
    if (status === "Eligible on future date") return "Wait until eligibility date";
    if (status === "Already sealed/expunged") return "Generate background-check/data-broker dispute packet or mark verified corrected";
    return "Gather missing information";
  }

  function hasFelony(caseData) {
    return (caseData.charges || []).some(function (charge) {
      return String(charge.chargeLevel || "").toLowerCase() === "felony" || String(charge.degree || "").toUpperCase().charAt(0) === "F";
    });
  }

  function hasMisdemeanor(caseData) {
    return (caseData.charges || []).some(function (charge) {
      return /misdemeanor/i.test(charge.chargeLevel || "") || String(charge.degree || "").toUpperCase().charAt(0) === "M";
    });
  }

  function getPacketRecommendation(caseData) {
    var outcome = String(caseData && caseData.outcome && caseData.outcome.outcome || "").toLowerCase();
    if (["dismissed", "not guilty", "acquitted", "no bill"].indexOf(outcome) !== -1) return "Dismissal sealing/expungement packet";
    if (outcome === "sealed" || outcome === "expunged") return "Post-relief correction/dispute packet";
    if (outcome === "pending") return "No packet yet";
    if (hasFelony(caseData)) return "Felony sealing/expungement packet";
    if (hasMisdemeanor(caseData)) return "Misdemeanor sealing/expungement packet";
    return "General record relief packet after local review";
  }

  function buildReliefPlan(profile, cases) {
    var plan = {
      id: "rw-plan-" + Date.now(),
      createdAt: new Date().toISOString(),
      profileName: profile && profile.fullName || "",
      summary: {
        totalCases: (cases || []).length,
        eligibleNow: 0,
        needsInformation: 0,
        postReliefMonitoring: 0
      },
      cases: []
    };

    (cases || []).forEach(function (caseData) {
      var status = getStatus(caseData);
      if (status === "Eligible now") plan.summary.eligibleNow += 1;
      if (status === "More information needed") plan.summary.needsInformation += 1;
      if (status === "Already sealed/expunged") plan.summary.postReliefMonitoring += 1;

      plan.cases.push({
        caseId: caseData.id,
        caseNumber: caseData.court && caseData.court.caseNumber || "",
        status: status,
        eligibilityDate: window.RecordWatchRules ? window.RecordWatchRules.calculateEligibilityDate(caseData) : "",
        nextAction: getNextAction(caseData),
        packetRecommendation: getPacketRecommendation(caseData),
        missingDocuments: getMissing(caseData),
        riskFlags: getRisks(caseData),
        postReliefOptions: ["Generate background-check dispute packet", "Generate data-broker correction packet", "Mark case as verified corrected"]
      });
    });
    return plan;
  }

  function saveReliefPlan(plan) {
    localStorage.setItem("recordwatchReliefPlan", JSON.stringify(plan));
    return plan;
  }

  function loadReliefPlan() {
    try { return JSON.parse(localStorage.getItem("recordwatchReliefPlan")) || null; } catch (error) { return null; }
  }

  function setIfValue(keys, value) {
    if (!value) return;
    keys.forEach(function (key) { localStorage.setItem(key, value); });
  }

  function prefillCourtPacket(caseData, profile) {
    var firstCharge = (caseData.charges || [])[0] || {};
    // Compatibility bridge: only writes when the user explicitly chooses Generate Court Packet.
    setIfValue(["fullName"], profile.fullName);
    setIfValue(["email"], profile.email);
    setIfValue(["residenceState", "state"], profile.residenceState);
    setIfValue(["caseState"], caseData.court && caseData.court.caseState);
    setIfValue(["county"], caseData.court && caseData.court.county);
    setIfValue(["court"], caseData.court && caseData.court.courtName);
    setIfValue(["caseNumber"], caseData.court && caseData.court.caseNumber);
    setIfValue(["offense"], firstCharge.chargeName);
    setIfValue(["offenseCode"], firstCharge.statuteCode);
    setIfValue(["outcome"], caseData.outcome && caseData.outcome.outcome);
    setIfValue(["dispositionDate"], caseData.outcome && caseData.outcome.dispositionDate);
    setIfValue(["dischargeDate"], caseData.outcome && caseData.outcome.finalDischargeDate);
    window.location.href = "record-details.html";
  }

  function generateDisputePacket(caseData, profile) {
    var status = getStatus(caseData);
    var eligibilityDate = window.RecordWatchRules ? window.RecordWatchRules.calculateEligibilityDate(caseData) : "";
    var charges = (caseData.charges || []).map(function (charge) {
      return "- " + (charge.chargeName || "Unknown charge") + " (" + (charge.statuteCode || "no code") + ")";
    }).join("\n");

    return [
      "RecordWatch User-Prepared Dispute / Correction Request",
      "Date generated: " + new Date().toLocaleDateString(),
      "",
      "User identity details",
      "Name: " + (profile.fullName || ""),
      "Date of birth: " + (profile.dateOfBirth || ""),
      "Email: " + (profile.email || ""),
      "Phone: " + (profile.phone || ""),
      "Residence state: " + (profile.residenceState || ""),
      "",
      "Case details",
      "Case number: " + (caseData.court && caseData.court.caseNumber || ""),
      "Court: " + (caseData.court && caseData.court.courtName || ""),
      "County/State: " + (caseData.court && caseData.court.county || "") + ", " + (caseData.court && caseData.court.caseState || ""),
      "Outcome: " + (caseData.outcome && caseData.outcome.outcome || ""),
      "Disposition date: " + (caseData.outcome && caseData.outcome.dispositionDate || ""),
      "Final discharge date: " + (caseData.outcome && caseData.outcome.finalDischargeDate || ""),
      "Charges:\n" + (charges || "- Not provided"),
      "",
      "Current status: " + status,
      "Relief status / estimated eligibility date: " + (eligibilityDate || "Not available"),
      "",
      "Request",
      "I request correction, update, removal, or reinvestigation of outdated or inaccurate criminal record information related to the case above. Please verify the current court record, update any disposition or relief information, and remove or suppress records that may no longer be reportable or accurate.",
      "",
      "FCRA-style dispute language",
      "I dispute the completeness and accuracy of any consumer report entry that continues to report this case inaccurately, incompletely, or without current disposition/relief information. Please conduct a reasonable reinvestigation and provide written results.",
      "",
      "Data-broker correction request language",
      "Please correct, delete, suppress, or update any listing associated with this case and confirm the source, status, and date of correction.",
      "",
      "Attachment placeholder",
      "Attach court order, certified disposition, sealing/expungement entry, or other verification here.",
      "",
      "Disclaimer: This is a user-prepared dispute/correction request generated by RecordWatch. It is not legal advice."
    ].join("\n");
  }

  function downloadTextFile(filename, content) {
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadActionPlanJSON(plan) {
    downloadTextFile("recordwatch-action-plan.json", JSON.stringify(plan, null, 2));
  }

  window.RecordWatchRelief = {
    buildReliefPlan: buildReliefPlan,
    getNextAction: getNextAction,
    getPacketRecommendation: getPacketRecommendation,
    saveReliefPlan: saveReliefPlan,
    loadReliefPlan: loadReliefPlan,
    prefillCourtPacket: prefillCourtPacket,
    generateDisputePacket: generateDisputePacket,
    downloadTextFile: downloadTextFile,
    downloadActionPlanJSON: downloadActionPlanJSON
  };
}());
