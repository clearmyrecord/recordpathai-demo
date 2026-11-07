/* Applicant-controlled single-case review, not a public-record search service.
   Browser + Node pure logic. Never trusts uploader metadata to establish legal
   eligibility, source authenticity, or fee/form authority. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.RecordPathCaseImport=api;
}(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const VERSION="recordpathai.case-import.v1";
  const ALLOWED=new Set(["OH","NV","TX","FL","AZ","GA"]);
  const KINDS=new Set(["official_docket_export","court_provided_export","applicant_supplied_court_copy"]);
  const ACCEPTED=new Map([
    ["convicted","Convicted"],["conviction","Convicted"],["guilty","Convicted"],
    ["pleaded_guilty","Convicted"],["pled_guilty","Convicted"],
    ["dismissed","Dismissed"],["dismissal","Dismissed"],
    ["acquitted","Not Guilty"],["not_guilty","Not Guilty"],
    ["found_not_guilty","Not Guilty"],["no_bill","No Bill"],["nobill","No Bill"]
  ]);
  function safe(value,max=180){
    return typeof value==="string"?value.trim().replace(/[\u0000-\u001f\u007f]/g," ").slice(0,max):"";
  }
  function validDate(value){
    const s=safe(value,12);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return "";
    const d=new Date(s+"T00:00:00.000Z");
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:"";
  }
  function disposition(value){
    return ACCEPTED.get(safe(value,80).toLowerCase().replace(/[\s-]+/g,"_"))||"";
  }
  function approvedUrl(value){
    try{
      const u=new URL(value);
      if(u.protocol!=="https:"||u.username||u.password||!u.hostname.includes(".")||
          /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname))return "";
      return u.origin+u.pathname; // Never propagate query credentials/tokens.
    }catch{return "";}
  }
  function nameParts(value){
    const name=safe(value,140);
    if(!name||name.split(/\s+/).length<2)throw Error("Full name requires at least two parts");
    if(name.includes(",")){
      const p=name.split(",",2), names=p[1].trim().split(/\s+/);
      return {full_name:[...names,p[0].trim()].join(" "),first_name:names[0],
        last_name:p[0].trim(),middle_name:names.slice(1).join(" ")};
    }
    const names=name.split(/\s+/);
    return {full_name:name,first_name:names[0],last_name:names.at(-1),
      middle_name:names.slice(1,-1).join(" ")};
  }
  function normalize(input,{confirmOwnRecord=false}={}){
    if(!confirmOwnRecord)throw Error("Applicant must confirm this is their own record");
    if(!input||typeof input!=="object"||Array.isArray(input)||input.schemaVersion!==VERSION)
      throw Error("Unsupported single-case import format");
    const source=input.source||{},c=input.case||{};
    if(!KINDS.has(source.type))throw Error("A documented court-record source type is required");
    const url=approvedUrl(source.url);
    if(!url)throw Error("Official source URL must be an HTTPS page");
    const state=safe(c.state,2).toUpperCase(),county=safe(c.county,85);
    const courtName=safe(c.court_name,135),number=safe(c.case_number,75);
    if(!ALLOWED.has(state)||!county||!courtName||!/^[A-Z0-9][A-Z0-9_./:-]{1,74}$/i.test(number))
      throw Error("Supported case state, county, exact court and case number are required");
    if(!input.person||!input.person.full_name)throw Error("Applicant name required");
    if(input.defendants&&(!Array.isArray(input.defendants)||input.defendants.length!==1))
      throw Error("Ambiguous multiple-defendant import is not supported");
    const name=nameParts(input.person.full_name);
    const rows=input.charges;
    if(!Array.isArray(rows)||rows.length<1||rows.length>40)
      throw Error("Include one case with 1–40 separately identified charge rows");
    const charges=rows.map((ch,i)=>{
      if(!ch||typeof ch!=="object"||Array.isArray(ch))throw Error("Invalid charge row "+(i+1));
      const chargeName=safe(ch.final_charge||ch.description||ch.charge_name,180);
      const code=safe(ch.final_statute||ch.statute||ch.charge_code,90);
      if(!chargeName&&!code)throw Error("Charge "+(i+1)+" needs a title or statute");
      const final=disposition(ch.final_disposition);
      const dispositionDate=validDate(ch.disposition_date);
      const reportedTermination=validDate(ch.termination_date);
      return {
        case_number:number,case_state:state,court_county:county,court_name:courtName,
        source_charge_id:safe(ch.source_charge_id,75),
        original_charge_name:safe(ch.original_charge,180),original_charge_code:safe(ch.original_statute,90),
        charge_name:chargeName,charge_code:code,
        level:safe(ch.level||ch.degree,45),degree:safe(ch.degree||ch.level,45),
        final_disposition:final,disposition:final,
        disposition_date:dispositionDate,
        // A user-uploaded file cannot attest that probation/parole actually ended.
        // Preserve any stated termination separately for review, never use it as
        // the eligibility-clock trigger until verified by an authorized process.
        discharge_date:"",probation_end_date:"",
        reported_termination_date_unverified:reportedTermination,
        reported_termination_evidence:safe(ch.termination_evidence,180),
        is_convicted:final==="Convicted",
        is_dismissed:["Dismissed","Not Guilty","No Bill"].includes(final),
        source_disposition_unverified:true,
        notes:final&&dispositionDate?"Review official final charge and date":"Final disposition or date missing—manual docket verification needed"
      };
    });
    const outcomes=charges.map(x=>x.final_disposition);
    const mixed=outcomes.includes("Convicted")&&outcomes.some(x=>x&&x!=="Convicted");
    const warnings=[
      "Court file provided by applicant: its authenticity, finality and completeness have not been independently confirmed.",
      "Confirm all charges, any amended counts, related proceedings and whether the case remains open.",
      "No legal eligibility, form approval, filing-fee waiver or payment is determined by this import."
    ];
    if(charges.some(x=>!x.final_disposition||!x.disposition_date))
      warnings.push("Some charges are missing a known final outcome or actual disposition date.");
    if(charges.some(x=>x.reported_termination_date_unverified))
      warnings.push("Reported supervision termination dates were preserved for review, not used to calculate eligibility.");
    if(mixed)warnings.push("Mixed conviction/nonconviction case: no automatic form route.");
    if(charges.length>1)warnings.push("Multi-charge cases require a separate reviewed legal screening.");
    const draft={
      meta:{source_state:state,source_county:county,
        source_url:url,source_type:source.type,source_record_date:validDate(source.record_date),
        import_method:"applicant_supplied_unverified_single_case",
        verification_status:"unverified_user_supplied",
        source_id:safe(source.source_id,100)
      },
      petitioner:name,
      court:{state,county,name:courtName,case_number:number,court_type:safe(c.court_type,90)},
      charges,case:{all_charges_confirmed:"",proceedings_status:""},
      eligibility:{eligibility_status:"Needs Review",is_eligible:false,waiting_period_complete:false,
        has_pending_cases:true,eligibility_reason:"Case source, final dispositions, supervision completion, legal relief and court form need independent review."}
    };
    return {schemaVersion:VERSION,draft,warnings,
      summary:{caseNumber:number,state,county,courtName,applicant:name.full_name,
        charges:charges.length,missingOutcomes:charges.filter(x=>!x.final_disposition||!x.disposition_date).length,
        reportedTerminationDates:charges.filter(x=>x.reported_termination_date_unverified).length,
        mixedOutcomes:mixed,sourceUrl:url},
      safeToFile:false,eligible:false,mappedFormSelected:false};
  }
  function merge(bridge,review,{confirmReplace=false}={}){
    if(!bridge||!bridge.loadPacketData||!bridge.createEmptyPacketData||!bridge.savePacketData)
      throw Error("Applicant's data bridge unavailable");
    if(!review||review.schemaVersion!==VERSION||!review.draft||review.safeToFile!==false)
      throw Error("A validated unapproved case review is required");
    const existing=bridge.loadPacketData(),incoming=review.draft;
    const oldCase=safe(existing?.court?.case_number).toLowerCase();
    const newCase=incoming.court.case_number.toLowerCase();
    const oldName=safe(existing?.petitioner?.full_name).toLowerCase();
    const newName=incoming.petitioner.full_name.toLowerCase();
    const conflicting=Boolean((oldCase&&oldCase!==newCase)||(oldName&&oldName!==newName));
    if(conflicting&&!confirmReplace)throw Error("Existing applicant or case differs; explicit replacement confirmation required");
    // Do not transfer another applicant's address/contact or existing case data.
    const sameApplicant=oldName===newName&&(!oldCase||oldCase===newCase);
    const base=sameApplicant?existing:bridge.createEmptyPacketData();
    base.meta={...(base.meta||{}),...incoming.meta};
    base.petitioner={...(base.petitioner||{}),...incoming.petitioner};
    base.court={...(base.court||{}),...incoming.court};
    base.charges=incoming.charges.map(c=>({...c}));
    base.case={...(sameApplicant?base.case:{}),...incoming.case};
    base.eligibility={...(sameApplicant?base.eligibility:{}),...incoming.eligibility};
    bridge.savePacketData(base);
    return {caseNumber:incoming.court.case_number,chargeCount:incoming.charges.length,
      requiresCourtVerification:true,safeToFile:false};
  }
  return Object.freeze({VERSION,normalize,merge,validDate,disposition});
}));
