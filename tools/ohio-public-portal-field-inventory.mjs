/* Offline field inventory for a REVIEWED PUBLIC, EMPTY court portal page.
   Never send search submissions, bypass CAPTCHA, read a specific person's case,
   store input values, or treat label guesses as approved mappings.
   Dynamic CourtView / JavaScript fields still require manual browser inspection. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const REQUESTED_INFORMATION=Object.freeze([
  {id:"court.court_name",label:"Official court name"},
  {id:"court.court_type",label:"Type of court"},
  {id:"court.division",label:"Court division, if any"},
  {id:"case.case_number",label:"Case number"},
  {id:"case.case_type",label:"Case type"},
  {id:"case.filed_date",label:"Case filing date"},
  {id:"case.case_status",label:"Whether the case remains open"},
  {id:"party.name",label:"Names of people in the case"},
  {id:"charge.original_name",label:"Original charge"},
  {id:"charge.original_code",label:"Original charge law or code"},
  {id:"charge.final_name",label:"Final charge after amendments"},
  {id:"charge.final_code",label:"Final charge law or code"},
  {id:"charge.degree",label:"Offense degree"},
  {id:"charge.final_outcome",label:"Final charge disposition"},
  {id:"charge.disposition_date",label:"Final charge disposition date"},
  {id:"sentence.date",label:"Sentencing date"},
  {id:"sentence.terms",label:"Sentence conditions"},
  {id:"sentence.termination_date",label:"Sentence/probation termination date"},
  {id:"sentence.final_discharge_date",label:"Final discharge date"},
  {id:"sentence.fines",label:"Fines owed or paid"},
  {id:"sentence.restitution",label:"Restitution owed or paid"},
  {id:"docket.entry_date",label:"Docket entry date"},
  {id:"docket.entry_text",label:"Docket entry description"},
  {id:"docket.document_link",label:"Link to public docket document"},
  {id:"case.judge",label:"Judge or assigned courtroom"},
  {id:"case.related_cases",label:"Related cases or cross references"}
]);
const decode=t=>String(t||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<")
  .replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'");
const clean=s=>decode(String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()).slice(0,150);
function attrs(raw){
  const out={};
  for(const m of String(raw||"").matchAll(/([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)){
    const name=m[1].toLowerCase();
    if(["value","token","csrf","secret","password"].includes(name))continue;
    out[name]=(m[2]??m[3]??m[4]??"").slice(0,140);
  }
  return out;
}
function suggestField(label){
  const l=String(label||"").toLowerCase();
  if(/\b(case|docket)\s*(number|no\.?|id)\b/.test(l))return "case.case_number";
  if(/\b(last|surname)\b/.test(l))return "party.last_name";
  if(/\b(first|given)\b/.test(l))return "party.first_name";
  if(/\b(party|defendant|person|name)\b/.test(l))return "party.name";
  if(/\b(hearing)\b/.test(l))return "case.hearing_date";
  if(/\b(file[ds]?|filing)\s*date\b/.test(l))return "case.filed_date";
  if(/\b(charge|offense)\b/.test(l))return "charge.final_name";
  if(/\b(disposition|outcome)\b/.test(l))return "charge.final_outcome";
  if(/\b(status)\b/.test(l))return "case.case_status";
  if(/\b(judge)\b/.test(l))return "case.judge";
  if(/\b(entry|event)\s*date\b/.test(l))return "docket.entry_date";
  return null;
}
export function inventoryBlankPublicPage(html,{url,courtId}={}){
  if(typeof html!=="string"||html.length>1500000)throw Error("Unsupported HTML snapshot");
  if(typeof courtId!=="string"||!/^oh-[a-z0-9-]{3,100}$/.test(courtId))
    throw Error("A reviewed official court catalog ID is required");
  if(typeof url!=="string"||!url.startsWith("https://"))
    throw Error("Official HTTPS source URL required");
  const labels=new Map();
  for(const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)){
    const a=attrs(m[1]);if(a.for)labels.set(a.for,clean(m[2]));
  }
  const inputs=[];
  for(const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)){
    const tag=m[1].toLowerCase(),a=attrs(m[2]);
    const type=(a.type||tag).toLowerCase();
    const technical=["hidden","password","submit","button","reset","image"].includes(type);
    const id=a.id||"",name=a.name||"";
    if(!id&&!name)continue;
    const label=labels.get(id)||a["aria-label"]||a.placeholder||name||id;
    inputs.push({
      tag,type,id,name,label,required:Object.hasOwn(a,"required"),
      technical,canonicalSuggestion:technical?null:suggestField(label),
      mappingVerified:false
    });
  }
  function headings(tag){
    const seen=new Set(),fields=[];
    for(const m of html.matchAll(new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/"+tag+">","gi"))){
      const label=clean(m[1]);if(!label||seen.has(label.toLowerCase()))continue;
      seen.add(label.toLowerCase());
      fields.push({label,canonicalSuggestion:suggestField(label),mappingVerified:false});
    }
    return fields;
  }
  const tableHeaders=headings("th");
  const detailLabels=headings("dt");
  const hasDynamic=/<script\b/i.test(html);
  const hasCaptcha=/recaptcha|hcaptcha|captcha/i.test(html);
  const regularInputs=inputs.filter(f=>!f.technical);
  return {
    courtId,sourceUrl:url,inventoryStatus:"candidate_requires_human_review",
    method:"offline_public_blank_page_html_inspection",
    capturedAt:new Date().toISOString(),observed:{
      searchInputs:regularInputs,technicalControls:inputs.filter(f=>f.technical),
      visibleResultsHeaders:tableHeaders,visibleDetailLabels:detailLabels
    },
    audit:{
      observedFieldCount:inputs.length+tableHeaders.length+detailLabels.length,
      reviewedFieldCount:0,unmappedFieldCount:regularInputs.length+tableHeaders.length+detailLabels.length,
      dynamicContentRequiresInspection:hasDynamic,possibleCaptcha:hasCaptcha,
      notClaimedAvailable:REQUESTED_INFORMATION.map(f=>f.id),
      allObservedFieldsMapped:false,
      humanApprovalRequired:true
    }
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith("--")&&a.includes("=")).map(a=>{
    const i=a.indexOf("=");return [a.slice(2,i),a.slice(i+1)];
  }));
  if(!args.input||!args.url||!args["court-id"]||!args.output)
    throw Error("Usage: node tools/ohio-public-portal-field-inventory.mjs --input=public-blank.html --url=https://official.example --court-id=oh-... --output=review.json");
  const content=fs.readFileSync(args.input,"utf8");
  const inventory=inventoryBlankPublicPage(content,{url:args.url,courtId:args["court-id"]});
  fs.mkdirSync(path.dirname(args.output),{recursive:true});
  fs.writeFileSync(args.output,JSON.stringify(inventory,null,2)+"\n");
  console.log(JSON.stringify({courtId:inventory.courtId,
    observedFieldCount:inventory.audit.observedFieldCount,
    allObservedFieldsMapped:false,humanApprovalRequired:true},null,2));
}
