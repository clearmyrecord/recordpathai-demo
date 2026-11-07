/* RecordPathAI Wave 1 form-aware screening and packet preflight.
   Intake requirements are data-quality prompts, NOT assertions about state law.
   Source-verified PDF mappings supply court-form-specific keys as they are reviewed.
   All legal eligibility and court form activation remain separate. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.RecordPathFormRequirements=api;
}(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const WAVE1=Object.freeze(["NV","TX","FL","AZ","GA"]);
  const PILOT=Object.freeze(["OH"]);
  const PREPARATORY=Object.freeze(["IL","UT"]);
  const STATE_NAMES=Object.freeze({
    OH:"Ohio",NV:"Nevada",TX:"Texas",FL:"Florida",AZ:"Arizona",
    GA:"Georgia",IL:"Illinois",UT:"Utah"
  });
  const COMMON_SCREEN=Object.freeze([
    ["petitioner.full_name","Full legal name"],
    ["petitioner.address.line1","Mailing street address"],
    ["petitioner.address.city","Mailing city"],
    ["petitioner.address.state","Mailing state"],
    ["petitioner.address.zip","Mailing ZIP"],
    ["court.state","State where case was filed"],
    ["court.county","County where case was filed"],
    ["court.name","Court handling this case"],
    ["court.court_type","Official court type"],
    ["court.case_number","Case number"],
    ["charges.0.charge_name","First charge description"],
    ["charges.0.charge_code","First charge statute"],
    ["charges.0.level","First charge level / degree"],
    ["charges.0.final_disposition","First charge final disposition"],
    ["charges.0.disposition_date","First charge disposition date"]
  ]);
  const SCREEN_LABELS=Object.freeze({
    "court.court_type":"Court type",
    "court.judge_name":"Assigned judge",
    "petitioner.dob":"Date of birth",
    "petitioner.email":"Email address",
    "petitioner.phone":"Phone number",
    "charges.0.discharge_date":"Probation / sentence completion date (not disposition)",
    "case.all_charges_confirmed":"Have you accounted for every charge in this case?",
    "case.proceedings_status":"Any open or related proceedings?",
    "case.petition_reason":"Reason for requesting relief",
    "court.prosecutor_agency":"Prosecutor / agency",
    "attorney.name":"Attorney name"
  });
  // These are EARLY DATA COLLECTION prompts from state-level workflows, not
  // verified county-form requirements or a statement of legal eligibility.
  const STATE_PREP_FIELDS=Object.freeze({
    NV:[["charges.0.arresting_agency","Arresting agency"],["case.agencies_to_notify","Other agencies holding records"]],
    TX:[["charges.0.arrest_date","Arrest date"],["charges.0.arresting_agency","Arresting agency"],["case.agencies_to_notify","Agencies potentially needing service"]],
    FL:[["case.fdle_certificate_status","FDLE eligibility certificate status"],["case.fdle_certificate_id","FDLE certificate reference (if issued)"],["charges.0.arresting_agency","Arresting agency"]],
    AZ:[["petitioner.other_names","Other legal names used in this case"],["charges.0.arrest_date","Arrest date"],["charges.0.arresting_agency","Arresting agency"],["case.prior_sealing_denial_date","Date of prior petition denial (if any)"]],
    GA:[["charges.0.arrest_date","Arrest date (important for agency pathway)"],["charges.0.arresting_agency","Arresting agency"],["court.prosecutor_agency","Prosecuting agency"]],
    OH:[["court.prosecutor_agency","Prosecuting agency (if known)"]]
  });
  const KNOWN_OUTCOMES=new Set(["convicted","dismissed","acquitted","no_bill"]);
  function normalizeState(value){
    const x=String(value||"").trim().toLowerCase();
    const byName=Object.entries(STATE_NAMES).find(([abbr,name])=>name.toLowerCase()===x);
    return byName?byName[0]:(x.length===2?x.toUpperCase():"");
  }
  function normalizeOutcome(value){
    const v=String(value||"").trim().toLowerCase().replace(/[\s-]+/g,"_");
    if(["convicted","conviction","guilty","pleaded_guilty","pled_guilty"].includes(v))return "convicted";
    if(["dismissed","dismissal","dismissed_with_prejudice"].includes(v))return "dismissed";
    if(["not_guilty","acquittal","acquitted","found_not_guilty"].includes(v))return "acquitted";
    if(["no_bill","nobill","no_true_bill","not_indicted"].includes(v))return "no_bill";
    return "unknown";
  }
  function get(data,path){
    if(typeof path!=="string"||!/^([a-z][a-z0-9_]*|\d{1,2})(\.([a-z][a-z0-9_]*|\d{1,2}))*$/i.test(path)||
       /(__proto__|constructor|prototype)/i.test(path))return undefined;
    let node=data;
    for(const key of path.split(".")){
      if(node==null||typeof node!=="object"||!Object.prototype.hasOwnProperty.call(node,key))return undefined;
      node=node[key];
    }
    return node;
  }
  function has(value){
    if(value==null)return false;
    if(typeof value==="string")return Boolean(value.trim())&&!["unknown","not sure","pending verification"].includes(value.trim().toLowerCase());
    if(Array.isArray(value))return value.length>0;
    return typeof value==="boolean"||typeof value==="number";
  }
  function dateStatus(value){
    if(value==null||String(value).trim()==="")return "missing";
    const v=String(value).trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return "invalid";
    const parsed=new Date(v+"T00:00:00Z");
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==v||
       v>new Date().toISOString().slice(0,10))return "invalid";
    return "valid";
  }
  function canonicalCharge(data){
    return Array.isArray(data?.charges)?data.charges.filter(c=>c&&typeof c==="object"):[];
  }
  function classify(data){
    const charges=canonicalCharge(data);
    const allConfirmed=data?.case?.all_charges_confirmed === "yes";
    const result={outcome:"unknown",candidateFormType:null,verifiedChargeSet:allConfirmed,
      reviewReasons:[],chargesReviewed:charges.length};
    if(!charges.length)result.reviewReasons.push("No charge details provided.");
    if(!allConfirmed)result.reviewReasons.push("Confirm all charges in the case, including amended and dismissed counts.");
    const outcomes=charges.map(c=>normalizeOutcome(c.final_disposition||c.disposition));
    if(outcomes.some(x=>!KNOWN_OUTCOMES.has(x)))
      result.reviewReasons.push("Every charge needs its own verified final disposition.");
    if(data?.case?.proceedings_status!=="none")
      result.reviewReasons.push("Verify whether related criminal proceedings remain open.");
    if(charges.some(c=>dateStatus(c.disposition_date)!=="valid"))
      result.reviewReasons.push("Each charge needs a real, historical, separately verified disposition date.");
    if(result.reviewReasons.length)return result;
    const convicted=outcomes.some(x=>x==="convicted");
    const other=outcomes.some(x=>x!=="convicted");
    if(convicted&&other){
      result.outcome="mixed";
      result.reviewReasons.push("Mixed convictions and dismissals require case-level judicial-rule review.");
      return result;
    }
    result.outcome=convicted?"conviction":"nonconviction";
    // These are form DISCOVERY keys, not eligibility decisions or court-authorized selection.
    result.candidateFormType=convicted?"sealing-conviction":"sealing-dismissal";
    return result;
  }
  function relevantEntry(data,entries=[]){
    const state=normalizeState(data?.court?.state||data?.meta?.source_state);
    const county=String(data?.court?.county||"").trim().toLowerCase().replace(/\s+county$/,"");
    const type=String(data?.court?.court_type||"").trim();
    const form=classify(data).candidateFormType;
    if(!state||!county||!type||!form||!Array.isArray(entries))return null;
    const matching=entries.filter(e=>e&&normalizeState(e.state)===state &&
      String(e.county||"").trim().toLowerCase().replace(/\s+county$/,"")===county &&
      e.formType===form&&e.status==="active");
    if(!matching.length)return null;
    return matching.find(e=>e.courtType===type)||null;
  }
  function mappedKeys(mappings,chargeCount){
    if(!Array.isArray(mappings))return [];
    const seen=new Set();
    const out=[];
    for(const field of mappings){
      const key=field?.name;
      if(typeof key!=="string"||!/^(petitioner|court|charges|case|attorney|eligibility|signatures|generated)\./.test(key))continue;
      if(key.startsWith("generated.")||key.startsWith("signatures."))continue;
      const index=key.match(/^charges\.(\d+)\./);
      if(index&&Number(index[1])>=chargeCount)continue; // Empty form rows are optional.
      if(!seen.has(key)){seen.add(key);out.push(key);}
    }
    return out;
  }
  function requirements(data,{registry=[],mapping=[]}={}){
    const state=normalizeState(data?.court?.state||data?.meta?.source_state);
    const scope=WAVE1.includes(state)?"wave1":PILOT.includes(state)?"pilot":PREPARATORY.includes(state)?"preparatory":"other";
    const classification=classify(data);
    const base=COMMON_SCREEN.map(([key,label])=>({key,label,source:"screen",required:true}));
    // Ask about critical uncertainty at the screening step, not after checkout.
    base.push({key:"case.all_charges_confirmed",label:SCREEN_LABELS["case.all_charges_confirmed"],required:true,source:"screen"});
    base.push({key:"case.proceedings_status",label:SCREEN_LABELS["case.proceedings_status"],required:true,source:"screen"});
    if(classification.outcome==="conviction"||canonicalCharge(data).some(c=>normalizeOutcome(c.final_disposition)==="convicted")){
      base.push({key:"charges.0.discharge_date",label:SCREEN_LABELS["charges.0.discharge_date"],required:false,source:"completion-review"});
    }
    for(const [key,label] of STATE_PREP_FIELDS[state]||[]){
      if(!base.some(r=>r.key===key))base.push({key,label,
        required:false,source:"state-screen-provisional"});
    }
    const entry=relevantEntry(data,registry);
    if(entry&&Array.isArray(mapping)&&mapping.length){
      for(const key of mappedKeys(mapping,canonicalCharge(data).length)){
        const existing=base.find(r=>r.key===key);
        if(existing){existing.required=true;existing.source="court-pdf-mapping";}
        else base.push({key,label:SCREEN_LABELS[key]||key.replace(/\./g," / ").replace(/_/g," "),
            required:true,source:"court-pdf-mapping"});
      }
    }
    return {
      state,stateName:STATE_NAMES[state]||state||"Unknown",scope,classification,
      sourceForm:entry?{type:entry.formType,county:entry.county,
        mappingStatus:Array.isArray(mapping)&&mapping.length?"mapped-fields-loaded":"mapping-not-loaded"}:null,
      requirements:base,needsSpecificFormReview:!entry||!Array.isArray(mapping)||!mapping.length
    };
  }
  function assess(data,options={}){
    const info=requirements(data,options);
    const missing=info.requirements.filter(r=>r.required&&!has(get(data,r.key)));
    const allCharges=canonicalCharge(data);
    const missingCharges=[];
    allCharges.forEach((c,i)=>{
      for(const field of ["charge_name","charge_code","level","final_disposition","disposition_date"]){
        if(!has(field==="level"?(c.level||c.degree):c[field]))
          missingCharges.push({key:`charges.${i}.${field}`,label:`Charge ${i+1}: ${field.replace(/_/g," ")}`});
      }
    });
    const missingOther=missingCharges.filter(r=>!missing.some(m=>m.key===r.key));
    const allMissing=[...missing,...missingOther];
    const review=[...info.classification.reviewReasons];
    let needsEvidenceReview=false;
    function missingField(key,label){
      if(!allMissing.some(x=>x.key===key))allMissing.push({key,label});
      needsEvidenceReview=true;
    }
    allCharges.forEach((c,i)=>{
      const disposition=dateStatus(c.disposition_date), discharge=dateStatus(c.discharge_date);
      const outcome=normalizeOutcome(c.final_disposition||c.disposition);
      if(disposition==="invalid"){
        missingField("charges."+i+".disposition_date","Charge "+(i+1)+": invalid/future disposition date");
        review.push("Charge "+(i+1)+": reconcile invalid or future disposition date.");
      }
      if(outcome==="convicted"){
        if(discharge!=="valid"){
          missingField("charges."+i+".discharge_date","Charge "+(i+1)+": verified final discharge date");
          review.push("Charge "+(i+1)+": final discharge must be documented separately from disposition.");
        }else if(disposition==="valid"&&c.discharge_date<c.disposition_date){
          missingField("charges."+i+".discharge_date","Charge "+(i+1)+": discharge date predates disposition");
          review.push("Charge "+(i+1)+": review conflicting completion and disposition dates.");
        }
      }else if(discharge==="invalid"){
        missingField("charges."+i+".discharge_date","Charge "+(i+1)+": invalid completion date");
      }
      if(c.reported_termination_date_unverified&&!has(c.discharge_date)){
        review.push("Charge "+(i+1)+": imported termination date is reported, not verified final discharge.");
        needsEvidenceReview=true;
      }
    });
    if(allCharges.length>1){
      review.push("Multiple counts require case-wide legal verification before payment or filing.");
      needsEvidenceReview=true;
    }
    if(data?.meta?.verification_status==="unverified_user_supplied"){
      review.push("User-supplied record needs confirmation against the current official docket.");
      needsEvidenceReview=true;
    }
    if(info.needsSpecificFormReview)review.push("Court-specific form mapping has not been verified for this case.");
    if(allMissing.length)review.push("Complete or verify missing screening / mapped court-form fields.");
    return {...info,missing:allMissing,review:[...new Set(review)],
      screeningComplete:allMissing.length===0&&info.classification.reviewReasons.length===0&&!needsEvidenceReview,
      courtReady:false,eligible:false};
  }
  function buildPreparationWorksheet(data,options={}){
    const report=assess(data,options),charges=canonicalCharge(data);
    const clean=x=>String(x==null||x===""?"Not provided":x).replace(/[\r\n]+/g," ").slice(0,200);
    const lines=["RECORDPATHAI — PRIVATE COURT-FORM PREPARATION WORKSHEET",
      "DRAFT ONLY. NOT A COURT FORM, ELIGIBILITY DETERMINATION OR FILING AUTHORIZATION.",
      "Date: "+new Date().toISOString().slice(0,10),"",
      "State: "+clean(report.stateName),
      "County: "+clean(data?.court?.county),"Court: "+clean(data?.court?.name),
      "Court type: "+clean(data?.court?.court_type),"Case number: "+clean(data?.court?.case_number),
      "Applicant: "+clean(data?.petitioner?.full_name),
      "All charges confirmed: "+clean(data?.case?.all_charges_confirmed),
      "Related proceedings: "+clean(data?.case?.proceedings_status),
      "Potential form DISCOVERY key: "+clean(report.classification.candidateFormType),
      "Verified court mapping: "+(report.sourceForm?.mappingStatus||"UNAVAILABLE / NOT APPROVED"),
      "Baseline screening data complete: "+(report.screeningComplete?"Yes, subject to review":"No"),
      "Legal eligibility: NOT DETERMINED",""];
    charges.forEach((c,i)=>{
      lines.push("CHARGE "+(i+1),
        "Original allegation: "+clean(c.original_charge_name||c.original_charge),
        "Original statute: "+clean(c.original_charge_code||c.original_statute),
        "Final charge: "+clean(c.charge_name),"Final statute: "+clean(c.charge_code),
        "Degree: "+clean(c.level||c.degree),
        "Final disposition: "+clean(c.final_disposition||c.disposition),
        "Disposition date: "+clean(c.disposition_date),
        "Verified separate final-discharge date: "+clean(c.discharge_date),
        "Reported UNVERIFIED termination date: "+clean(c.reported_termination_date_unverified),"");
    });
    lines.push("MISSING INFORMATION");
    if(!report.missing.length)lines.push("No baseline gaps; court/legal review still required.");
    report.missing.forEach(x=>lines.push("- "+x.label+" ["+x.key+"]"));
    lines.push("","REVIEW NEEDED");
    report.review.forEach(x=>lines.push("- "+x));
    lines.push("","NEXT ACTIONS",
      "1. Confirm every charge, plea amendment, outcome and judgment date against the court docket.",
      "2. Obtain separate discharge/sentence-completion evidence for convictions.",
      "3. Verify current state-law exclusions, waiting periods, pending cases and the approved court form.",
      "4. Confirm any fee, signature, notarization, service and filing instructions with the clerk.",
      "5. This document is a private worksheet; it must not be mailed or filed as an application.");
    return lines.join("\n")+"\n";
  }
  return Object.freeze({WAVE1,PILOT,PREPARATORY,STATE_NAMES,COMMON_SCREEN,
    normalizeState,normalizeOutcome,get,dateStatus,classify,relevantEntry,mappedKeys,requirements,assess,buildPreparationWorksheet,STATE_PREP_FIELDS});
}));