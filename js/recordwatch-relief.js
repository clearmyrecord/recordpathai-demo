(function () {
  "use strict";

  function buildReliefPlan(profile, cases) {
    const casePlans = (Array.isArray(cases) ? cases : []).map((caseData) => {
      const status = window.RecordWatchRules?.calculateCaseStatus(caseData) || "More information needed";
      const eligibilityDate = window.RecordWatchRules?.calculateEligibilityDate(caseData) || "";
      const missingRequirements = window.RecordWatchRules?.getMissingRequirements(caseData) || [];
      const riskFlags = window.RecordWatchRules?.getRiskFlags(caseData) || [];
      return {
        caseId: caseData.id,
        caseNumber: caseData?.court?.caseNumber || "Unlisted case number",
        status,
        eligibilityDate,
        nextAction: getNextAction(caseData),
        packetRecommendation: getPacketRecommendation(caseData),
        missingDocuments: buildMissingDocuments(caseData, missingRequirements),
        postReliefOptions: [
          "Check court docket and state repository after relief order",
          "Generate background-check dispute packet",
          "Generate data-broker correction packet",
          "Mark case as verified corrected after updates are confirmed"
        ],
        missingRequirements,
        riskFlags
      };
    });

    return {
      id: `rw-plan-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      profileName: profile?.fullLegalName || "RecordWatch user",
      totalCases: casePlans.length,
      readyForCourtPacket: casePlans.filter((item) => item.nextAction === "Generate court packet").length,
      needsInformation: casePlans.filter((item) => item.nextAction.includes("Gather") || item.missingRequirements.length).length,
      casePlans
    };
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPrimaryCharge(caseData) {
    return Array.isArray(caseData?.charges) && caseData.charges.length ? caseData.charges[0] : {};
  }

  function getNextAction(caseData) {
    const rules = window.RecordWatchRules;
    const status = rules?.calculateCaseStatus(caseData) || "More information needed";
    const missing = rules?.getMissingRequirements(caseData) || [];
    const risks = rules?.getRiskFlags(caseData) || [];

    if (status === "Pending case") return "Wait for disposition / update case outcome";
    if (risks.length) return "Recommend legal review before filing";
    if (status === "More information needed") return "Gather missing information";
    if (missing.some((item) => item.toLowerCase().includes("paid") || item.toLowerCase().includes("payment"))) return "Confirm fines/restitution/court costs are paid";
    if (status === "Eligible now") return "Generate court packet";
    if (status === "Eligible on future date") return "Wait until eligibility date";
    if (status === "Already sealed/expunged") return "Generate background-check/data-broker dispute packet or mark verified corrected";
    return "Gather missing information";
  }

  function getPacketRecommendation(caseData) {
    const outcome = normalize(caseData?.outcome?.outcome || caseData?.outcomeInfo?.outcome || caseData?.outcome);
    const charge = getPrimaryCharge(caseData);
    const level = normalize(charge.chargeLevel);
    const degree = normalize(charge.degree);

    if (["dismissed", "not guilty", "acquitted", "no bill"].includes(outcome)) return "Dismissal sealing/expungement packet";
    if (outcome === "pending") return "No packet yet";
    if (["sealed", "expunged"].includes(outcome)) return "Post-relief correction/dispute packet";
    if (level === "felony" || degree.startsWith("f")) return "Felony sealing/expungement packet";
    if (level.includes("misdemeanor") || degree === "mm" || degree.startsWith("m")) return "Misdemeanor sealing/expungement packet";
    return "Record relief packet after local rule review";
  }

  function buildMissingDocuments(caseData, missingRequirements) {
    const docs = ["Certified disposition or docket sheet", "Proof of final discharge/completion if applicable"];
    if (missingRequirements.some((item) => item.toLowerCase().includes("cost") || item.toLowerCase().includes("fine") || item.toLowerCase().includes("restitution"))) {
      docs.push("Receipts or clerk confirmation for fines, costs, and restitution");
    }
    if (window.RecordWatchRules?.getRiskFlags(caseData)?.length) docs.push("Legal review notes for flagged offense categories");
    return docs;
  }

  function saveReliefPlan(plan) {
    localStorage.setItem("recordwatchReliefPlan", JSON.stringify(plan));
  }

  function loadReliefPlan() {
    try {
      const value = localStorage.getItem("recordwatchReliefPlan");
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn("Unable to parse recordwatchReliefPlan:", error);
      return null;
    }
  }

  function setIfValue(key, value) {
    if (localStorage.getItem(key)) return;
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      localStorage.setItem(key, String(value).trim());
    }
  }

  function prefillCourtPacket(caseData, profile) {
    const court = caseData?.court || {};
    const outcome = caseData?.outcome || {};
    const charge = getPrimaryCharge(caseData);

    // Existing RecordPathAI localStorage keys are only updated when the user explicitly generates a court packet.
    setIfValue("fullName", profile?.fullLegalName || caseData?.personal?.fullLegalName);
    setIfValue("email", profile?.email || caseData?.personal?.email);
    setIfValue("residenceState", profile?.residenceState || caseData?.personal?.residenceState);
    setIfValue("state", profile?.residenceState || caseData?.personal?.residenceState || court.caseState);
    setIfValue("caseState", court.caseState);
    setIfValue("county", court.county);
    setIfValue("court", court.courtName);
    setIfValue("caseNumber", court.caseNumber);
    setIfValue("offense", charge.chargeName);
    setIfValue("offenseCode", charge.offenseCode);
    setIfValue("outcome", outcome.outcome);
    setIfValue("dispositionDate", outcome.dispositionDate);
    setIfValue("dischargeDate", outcome.finalDischargeDate);

    const existing = readJSON("recordPathRecordDetails", {});
    const merged = Object.assign({}, existing, {
      fullName: existing.fullName || profile?.fullLegalName || caseData?.personal?.fullLegalName,
      email: existing.email || profile?.email || caseData?.personal?.email,
      residenceState: existing.residenceState || profile?.residenceState || caseData?.personal?.residenceState,
      caseState: existing.caseState || court.caseState,
      county: existing.county || court.county,
      court: existing.court || court.courtName,
      caseNumber: existing.caseNumber || court.caseNumber,
      offense: existing.offense || charge.chargeName,
      offenseCode: existing.offenseCode || charge.offenseCode,
      outcome: existing.outcome || outcome.outcome,
      dispositionDate: existing.dispositionDate || outcome.dispositionDate,
      dischargeDate: existing.dischargeDate || outcome.finalDischargeDate,
      updatedFromRecordWatchAt: new Date().toISOString()
    });
    localStorage.setItem("recordPathRecordDetails", JSON.stringify(merged));
    return "record-details.html";
  }

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function generateDisputePacket(caseData, profile) {
    const rules = window.RecordWatchRules;
    const court = caseData?.court || {};
    const outcome = caseData?.outcome || {};
    const charge = getPrimaryCharge(caseData);
    const status = rules?.calculateCaseStatus(caseData) || "More information needed";
    const reliefDate = rules?.calculateEligibilityDate(caseData) || "Not available";
    const generatedDate = new Date().toLocaleDateString();

    return `RecordWatch User-Prepared Dispute / Correction Request\n\nDate generated: ${generatedDate}\n\nUser identity details\nName: ${profile?.fullLegalName || caseData?.personal?.fullLegalName || ""}\nDate of birth: ${profile?.dateOfBirth || caseData?.personal?.dateOfBirth || ""}\nEmail: ${profile?.email || caseData?.personal?.email || ""}\nPhone: ${profile?.phone || caseData?.personal?.phone || ""}\nResidence state: ${profile?.residenceState || caseData?.personal?.residenceState || ""}\n\nCase details\nCourt: ${court.courtName || ""}\nCounty/State: ${court.county || ""}, ${court.caseState || ""}\nCase number: ${court.caseNumber || ""}\nCharge: ${charge.chargeName || ""}\nStatute/offense code: ${charge.offenseCode || ""}\nOutcome: ${outcome.outcome || ""}\nDisposition date: ${outcome.dispositionDate || ""}\nFinal discharge date: ${outcome.finalDischargeDate || ""}\n\nCurrent status\nRecordWatch status: ${status}\nEstimated relief date/status: ${reliefDate}\nPacket recommendation: ${getPacketRecommendation(caseData)}\n\nRequest\nI am requesting correction, update, removal, or reinvestigation of any criminal record information that is inaccurate, incomplete, obsolete, sealed, expunged, dismissed, or otherwise not reportable under applicable law. Please verify the record against the court docket, certified disposition, and any attached court order.\n\nFCRA-style dispute language\nIf you are a consumer reporting agency, please conduct a reasonable reinvestigation of the disputed information, update or delete inaccurate or unverifiable information, and provide written results of the reinvestigation.\n\nData-broker correction request language\nIf you are a data broker or people-search provider, please correct, suppress, delete, or stop displaying outdated or inaccurate criminal record information and confirm completion in writing.\n\nAttachments placeholder\n- Court order granting sealing/expungement or other relief\n- Certified disposition\n- Government ID or identity verification document, if required\n\nDisclaimer\nThis is a user-prepared dispute/correction request generated by RecordWatch. It is not legal advice and does not guarantee correction, deletion, removal, reinvestigation results, employment, housing, or background-check outcomes.\n`;
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
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
    buildReliefPlan,
    getNextAction,
    getPacketRecommendation,
    saveReliefPlan,
    loadReliefPlan,
    prefillCourtPacket,
    generateDisputePacket,
    downloadTextFile,
    downloadActionPlanJSON
  };
})();
