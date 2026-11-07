(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RecordPathWoodCountyPrefill = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "recordpathai_wood_verified_prefill_v1";
  const MAX_AGE_MS = 15*60*1000;
  const COURT_URL = "https://clerkofcourt.co.wood.oh.us/169/Dockets-Online";
  function clean(value) { return typeof value === "string" ? value.trim().slice(0,250) : ""; }
  function dateString(value) {
    const s = clean(value).slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    const d = new Date(s+"T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s ? s : "";
  }
  function normalizeDisposition(value) {
    const v=clean(value).toLowerCase().replace(/[\s_-]+/g," ");
    if (/dismiss/.test(v) && /without prejudice/.test(v)) return ""; // Requires separate statute-of-limitations verification.
    if (/not guilty|acquitted|acquittal/.test(v)) return "Not Guilty";
    if (/dismiss/.test(v)) return "Dismissed";
    if (/no bill|no true bill|not indicted/.test(v)) return "No Bill";
    if (/found guilty|convicted|conviction|pleaded guilty|pled guilty/.test(v)) return "Convicted";
    return ""; // No assumptions from charge titles or vague termination codes.
  }
  function splitName(value) {
    const parts=clean(value).split(/\s+/).filter(Boolean);
    return { first_name:parts[0]||"", last_name:parts.length>1?parts[parts.length-1]:"", full_name:parts.join(" ") };
  }
  function buildDraft(match, { confirmOwnRecord=false, defendantIndex=0, nowMs=Date.now() }={}) {
    if(confirmOwnRecord !== true) throw new Error("Explicit applicant record confirmation required");
    if(!match || typeof match!=="object" || !Array.isArray(match.defendants) || match.defendants.length !== 1 || defendantIndex !== 0)
      throw new Error("Ambiguous party identity: review official docket before importing");
    const when=Date.parse(match.verifiedAt || "");
    if(!Number.isFinite(when)||when>nowMs+60000||nowMs-when>24*60*60*1000)
      throw new Error("Current official docket verification required before prefilling");
    const caseNo=clean(match.caseNumber);
    if(!caseNo || !/^[a-zA-Z0-9/_:-]{2,80}$/.test(caseNo))throw new Error("Valid case number required");
    const person=match.defendants[0],name=splitName(person.name);
    if(!name.first_name||!name.last_name)throw new Error("Two-part defendant name is required");
    if(!Array.isArray(person.charges)||!person.charges.length)throw new Error("Charge details not available");
    const charges=person.charges.map(ch=>{
      const disposition=normalizeDisposition(ch.disposition);
      return {
        case_number:caseNo,case_state:"OH",court_county:"Wood County",
        court_name:"Wood County Court of Common Pleas",
        charge_name:clean(ch.description),charge_code:clean(ch.statute),
        level:clean(ch.offenseDegree),degree:clean(ch.offenseDegree),
        final_disposition:disposition, disposition,
        disposition_date:dateString(ch.dispositionDate),
        discharge_date:"",probation_end_date:"", // Never conflate with disposition or export termination.
        is_convicted:disposition==="Convicted",
        is_dismissed:["Dismissed","Not Guilty","No Bill"].includes(disposition),
        notes:disposition?"":"Final disposition requires official docket verification"
      };
    });
    if(charges.some(ch=>!ch.charge_name&&!ch.charge_code))
      throw new Error("Missing charge identity: cannot safely prefill");
    return {
      meta:{
        source_state:"OH",source_county:"Wood County",
        import_method:"verified_approved_case_search_user_confirmed",
        source_url:COURT_URL,status_verified_at:clean(match.verifiedAt),
        reported_termination_date_unverified:dateString(match.terminationDate)
      },
      petitioner: { ...name }, // Never infer DOB, SSN, address, phone or email from clerk extracts.
      court: {
        state:"OH",county:"Wood County",name:"Wood County Court of Common Pleas",
        case_number:caseNo
      },
      charges,
      eligibility:{
        eligibility_status:"Needs Review",
        eligibility_reason:"Review final charges, pending cases and actual supervision completion dates against official court docket.",
        is_eligible:false
      }
    };
  }
  function stage(match, options={}) {
    if(typeof sessionStorage === "undefined")throw new Error("Session storage unavailable");
    const draft=buildDraft(match,options);
    sessionStorage.setItem(KEY,JSON.stringify({draft,createdAt:Date.now()}));
    return {caseNumber:draft.court.case_number,charges:draft.charges.length};
  }
  function peek(nowMs=Date.now()) {
    if(typeof sessionStorage === "undefined")return null;
    try {
      const item=JSON.parse(sessionStorage.getItem(KEY)||"null");
      if(!item || !Number.isFinite(item.createdAt) || nowMs-item.createdAt<0 || nowMs-item.createdAt>MAX_AGE_MS) {
        sessionStorage.removeItem(KEY);return null;
      }
      return item.draft || null;
    } catch (_err) { sessionStorage.removeItem(KEY);return null; }
  }
  function clear() { if(typeof sessionStorage!=="undefined") sessionStorage.removeItem(KEY); }
  return Object.freeze({buildDraft,stage,peek,clear,normalizeDisposition});
}));