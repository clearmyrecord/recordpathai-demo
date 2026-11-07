/* RecordPathAI Form Pipeline v1: immutable source, mapper and prefill contracts.
   Browser + Node, pure logic. No fetching, database access, payment, or filing. */
(function (root,factory) {
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.RecordPathFormPipeline=api;
}(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const SCHEMA="recordpathai.form-candidate.v1";
  const SAFE_TYPES=new Set(["text","date","checkbox","signature","static"]);
  const ALLOWED_ROOTS=new Set(["petitioner","court","case","charges","eligibility","signature","signatures","dates","generated"]);
  const STATES=new Set(["pending_review","mapping_draft","approved","superseded","rejected"]);
  const HASH=/^[a-f0-9]{64}$/;
  const SAFE_PATH=/^assets\/forms\/[a-zA-Z0-9/_-]+\.pdf$/;
  const FORM_TYPES=new Set(["sealing-conviction","sealing-dismissal","sealing-nonconviction","expungement","unknown"]);
  function str(value,max=200){return typeof value==="string"?value.trim().slice(0,max):"";}
  function validUrl(value){
    try{
      const u=new URL(value);
      return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.includes(".")
        &&!u.hostname.endsWith(".")&&u.port===""&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname);
    }catch{return false;}
  }
  function validKey(path){
    if(typeof path!=="string"||path.length>120)return false;
    const parts=path.split(".");
    if(parts.length<2||!ALLOWED_ROOTS.has(parts[0]))return false;
    if(parts.some(p=>!/^([a-zA-Z][a-zA-Z0-9_]*|\d{1,2})$/.test(p)||["__proto__","constructor","prototype"].includes(p)))return false;
    if(parts[0]==="charges"&&(!/^\d{1,2}$/.test(parts[1])||Number(parts[1])>49))return false;
    return true;
  }
  function validateCandidate(input){
    const errors=[];
    if(!input||typeof input!=="object"||Array.isArray(input))return {ok:false,errors:["Invalid manifest"]};
    if(input.schemaVersion!==SCHEMA)errors.push("Unsupported manifest schema");
    if(!/^[A-Z0-9][A-Z0-9._:-]{7,127}$/.test(input.id||""))errors.push("Invalid form candidate ID");
    const j=input.jurisdiction||{};
    if(!/^[A-Z]{2}$/.test(j.state||"")||!str(j.county)||!str(j.courtType))errors.push("Court jurisdiction incomplete");
    if(!FORM_TYPES.has(input.form?.type))errors.push("Unknown form type");
    if(!validUrl(input.source?.url))errors.push("Official source must be a valid HTTPS URL");
    if(input.source?.pageUrl && !validUrl(input.source.pageUrl))errors.push("Invalid source page URL");
    const p=input.pdf||{};
    if(!HASH.test(p.sha256||""))errors.push("Original PDF SHA-256 required");
    if(!Number.isSafeInteger(p.bytes)||p.bytes<100||p.bytes>12*1024*1024)errors.push("PDF byte count outside supported range");
    if(!Number.isInteger(p.pageCount)||p.pageCount<1||p.pageCount>30)errors.push("Unsupported PDF page count");
    if(p.localPath!=null&&p.localPath!==""&&!SAFE_PATH.test(p.localPath))errors.push("Only local assets/forms PDF paths permitted");
    const review=input.review||{};
    if(!STATES.has(review.status))errors.push("Invalid review state");
    if(typeof review.sourceVerified!=="boolean"||typeof review.mappingApproved!=="boolean"||
       typeof review.legalRoutingApproved!=="boolean")errors.push("Review booleans required");
    if(input.mapping?.status!=="draft"&&input.mapping?.status!=="approved")errors.push("Mapping stage required");
    if(input.mapping?.status==="approved"&&!HASH.test(input.mapping?.approvedForPdfSha256||""))errors.push("Approved mapping must bind to a PDF digest");
    if(input.mapping?.approvedForPdfSha256&&input.mapping.approvedForPdfSha256!==p.sha256)errors.push("Mapping bound to different PDF");
    return {ok:errors.length===0,errors};
  }
  function draftCandidate({state,county,courtType,courtName,formType,title,sourceUrl,sourcePageUrl,pdfPath,sha256,bytes,pageCount,discoveredAt,suggestions=[]}){
    const safeState=str(state,2).toUpperCase();
    const countyName=str(county),court=str(courtType);
    const form=FORM_TYPES.has(formType)?formType:"unknown";
    const base=`${safeState}:${countyName.toLowerCase().replace(/[^a-z0-9]+/g,"-")}:${court.replace(/[^a-z0-9-]/gi,"-")}:${form}:${str(sha256,64).slice(0,12)}`.toUpperCase();
    const item={
      schemaVersion:SCHEMA,id:base.slice(0,128),
      jurisdiction:{state:safeState,county:countyName,courtType:court,courtName:str(courtName)},
      form:{type:form,title:str(title,250)},
      source:{url:str(sourceUrl,2048),pageUrl:str(sourcePageUrl||sourceUrl,2048),
        discoveredAt:str(discoveredAt,40),verifiedAt:null,sourceNotes:"Unverified crawler candidate"},
      pdf:{localPath:str(pdfPath,500),sha256:str(sha256,64).toLowerCase(),bytes,pageCount},
      mapping:{status:"draft",approvedForPdfSha256:null,
        suggestions:Array.isArray(suggestions)?suggestions.slice(0,300):[]},
      review:{status:"pending_review",sourceVerified:false,mappingApproved:false,
        legalRoutingApproved:false,reviewedAt:null,reviewer:null},
      active:false
    };
    const result=validateCandidate(item);
    if(!result.ok)throw new Error(result.errors.join("; "));
    return item;
  }
  function getValue(source,path){
    if(!validKey(path))return {present:false,value:null,reason:"Unknown or unsafe canonical field"};
    let value=source;
    for(const key of path.split(".")){
      if(value==null||typeof value!=="object"||!Object.prototype.hasOwnProperty.call(value,key))
        return {present:false,value:null,reason:"Source field not provided"};
      value=value[key];
    }
    if(value===null||value===undefined||value==="")return {present:false,value:null,reason:"Source field empty"};
    if(typeof value==="boolean")return {present:true,value};
    if(typeof value==="number"&&Number.isFinite(value))return {present:true,value:String(value)};
    if(typeof value==="string")return {present:true,value:value.slice(0,500)};
    return {present:false,value:null,reason:"Nested or unsupported source value"};
  }
  function validateMapping(mappings,pageCount){
    const errors=[];
    if(!Array.isArray(mappings)||mappings.length===0||mappings.length>500)return {ok:false,errors:["Mapping must contain 1–500 fields"]};
    mappings.forEach((f,i)=>{
      if(!f||!validKey(f.name)||!SAFE_TYPES.has(f.type))errors.push("Invalid canonical key or type at row "+(i+1));
      for(const p of ["x","y","width","height"])if(!Number.isFinite(Number(f?.[p]))||Number(f[p])<0||Number(f[p])>2000)errors.push("Invalid "+p+" at row "+(i+1));
      if(!(Number(f?.width)>0&&Number(f?.height)>0))errors.push("Zero-sized field at row "+(i+1));
      if(!Number.isInteger(Number(f?.page))||f.page<1||f.page>pageCount)errors.push("Invalid page at row "+(i+1));
    });
    return {ok:errors.length===0,errors:errors.slice(0,30)};
  }
  function buildFillPlan({manifest,mappings,caseData,currentPdfSha256,mode="draft",consent=false}){
    const valid=validateCandidate(manifest);
    if(!valid.ok)throw new Error(valid.errors.join("; "));
    if(!HASH.test(currentPdfSha256||"")||manifest.pdf.sha256!==currentPdfSha256)
      throw new Error("Court PDF fingerprint changed; re-map and reapprove the new version");
    const mapped=validateMapping(mappings,manifest.pdf.pageCount);
    if(!mapped.ok)throw new Error(mapped.errors.join("; "));
    // An imported JSON file can forge "approved" flags. The browser/shared
    // helper must never convert self-attested metadata into filing authority.
    // Production requires a separate authenticated server registry, verified
    // reviewer action, source-version pin and applicant authorization.
    if(mode==="production")
      throw new Error("Production auto-fill requires a trusted server approval registry; disabled in this helper");
    if(mode!=="draft")throw new Error("Unsupported fill mode");
    if(!caseData||typeof caseData!=="object"||Array.isArray(caseData))throw new Error("Normalized case data required");
    if(mode==="draft"&&caseData.meta?.synthetic!==true)
      throw new Error("Draft previews require explicitly synthetic data");
    const fields=mappings.map((f,index)=>{
      if(f.type==="signature"){
        return {index,name:f.name,type:f.type,page:f.page,x:f.x,y:f.y,width:f.width,height:f.height,value:null,
          state:"manual_signature_required"};
      }
      const resolved=getValue(caseData,f.name);
      return {index,name:f.name,type:f.type,page:f.page,x:f.x,y:f.y,width:f.width,height:f.height,
        value:resolved.present?resolved.value:null,state:resolved.present?"prefilled":"missing_data"};
    });
    const missing=fields.filter(f=>f.state==="missing_data").map(f=>f.name);
    const signatures=fields.filter(f=>f.type==="signature").map(f=>f.name);
    return {schemaVersion:"recordpathai.fill-plan.v1",manifestId:manifest.id,
      pdfSha256:currentPdfSha256,mode,fields,missing:[...new Set(missing)],
      signatures:[...new Set(signatures)],requiresHumanReview:true,
      safeToFile:false,readyForMailing:false};
  }
  return Object.freeze({SCHEMA,draftCandidate,validateCandidate,validateMapping,
    validKey,getValue,buildFillPlan,validUrl});
}));