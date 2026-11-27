// Load the same public, inert Step 2 sections and charge template as the consumer.
 // No consumer account scripts execute and no client data is sent to the template endpoint.
export async function mountProfessionalRecordIntake(mount){
 const r=await fetch("record-details.html",{cache:"no-store",credentials:"same-origin"});
 if(!r.ok)throw Error("Shared record intake unavailable");
 const parsed=new DOMParser().parseFromString(await r.text(),"text/html");
 const source=parsed.getElementById("recordDetailsForm"),template=parsed.getElementById("sharedRecordChargeTemplate");
 if(!source||!template)throw Error("Shared record intake version unavailable");
 const ids=["courtSectionTitle","recordCollectionTitle","chargesSectionTitle","sentencingSectionTitle","arrestSectionTitle"];
 const fragments=ids.map(id=>{const section=source.querySelector('[aria-labelledby="'+id+'"]');if(!section)throw Error("Missing shared section: "+id);return document.importNode(section,true);});
 mount.replaceChildren(...fragments);
 for(const id of ["chargeNameSuggestions","offenseCodeSuggestions","courtSuggestions","countySuggestions"]){
  const el=parsed.getElementById(id);if(el)mount.append(document.importNode(el,true));
 }
 // This recovery action belongs to consumer routing; never send professional records there.
 mount.querySelector("#recordDetailsRecovery")?.remove();
 const list=mount.querySelector("#offenseList"),status=mount.querySelector("#recordStatus");
 const renumber=()=>{const cards=[...list.querySelectorAll(".record-card")];cards.forEach((card,i)=>{card.querySelector(".charge-header h3").textContent="Charge "+(i+1);card.querySelector(".remove-offense-btn").disabled=cards.length===1;});status.textContent=cards.length+" charge"+(cards.length===1?"":"s")+" added";};
 function addCharge(data={}){
  if(list.children.length>=50)return;
  const card=document.createElement("section");card.className="record-card";card.append(document.importNode(template.content,true));
  for(const el of card.querySelectorAll("[data-field]")){if(el.type==="checkbox")el.checked=data[el.dataset.field]===true;else el.value=data[el.dataset.field]??"";el.setAttribute("autocomplete","off");}
  card.querySelector(".remove-offense-btn").addEventListener("click",()=>{if(list.children.length>1){card.remove();renumber();}});
  list.append(card);renumber();
 }
 mount.querySelector("#addOffenseBtn").addEventListener("click",()=>addCharge());
 for(const id of ["caseState","county","courtName","courtType"]){const el=mount.querySelector("#"+id);el.addEventListener("change",()=>window.RecordPathRecordCollection?.update());el.addEventListener("input",()=>window.RecordPathRecordCollection?.update());}
 for(const el of mount.querySelectorAll("input,select,textarea"))el.setAttribute("autocomplete","off");
 const reset=()=>{list.replaceChildren();addCharge();window.RecordPathRecordCollection?.update();};
 reset();window.RecordPathChargeLibrary?.mount(mount);await window.RecordPathRecordCollection?.init();
 return {reset,capture:()=>window.RecordPathRecordDetailsFields.capture(mount)};
}
export function buildProfessionalRecordPayload(snapshot,org,client){
 const f=snapshot?.fields,c=snapshot?.charges?.[0];
 if(!f||!c||!client||!f.caseNumber||!f.caseState||!f.county||!f.courtName||!f.courtType)throw Error("Enter the client, case number, state, county and official court type.");
 if(!snapshot.charges.some(ch=>Object.values(ch).some(v=>v===true||typeof v==="string"&&v.trim())))throw Error("Enter at least one charge.");
 // The database derives the canonical summary and filing hold from this complete snapshot.
 return {org_id:org,client_id:client,case_number:f.caseNumber,judge_name:f.judgeName||"",charge_name:c.charge_name||"",charge_code:c.charge_code||"",charge_level:c.degree||"",outcome:"mixed",disposition_date:c.disposition_date||null,final_discharge_date:c.discharge_date||null,probation_end_date:null,record_details:snapshot};
}
export function sameRecordSnapshot(a,b){
 const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
 return JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
}

export async function mountProfessionalPersonalIntake(mount){
 const r=await fetch("eligibility.html",{cache:"no-store",credentials:"same-origin"});
 if(!r.ok)throw Error("Shared personal intake unavailable");
 const doc=new DOMParser().parseFromString(await r.text(),"text/html");
 const form=doc.getElementById("user-profile-form");
 if(!form)throw Error("Shared personal form unavailable");
 const fieldMap={fullName:["full_name",120,true],dateOfBirth:["dob",0,true],otherNames:["other_names",240,false],email:["email",120,true],phone:["phone",24,true],address1:["line1",100,true],address2:["line2",40,false],city:["city",60,true],residenceState:["state",0,true],zip:["zip",10,true]};
 mount.replaceChildren(...Array.from(form.children,el=>document.importNode(el,true)));
 for(const [id,[name,max,required]] of Object.entries(fieldMap)){
  const el=mount.querySelector("#"+id);if(!el)throw Error("Shared personal field missing: "+id);
  el.name=name;el.required=required;if(max)el.maxLength=max;el.setAttribute("autocomplete","off");el.removeAttribute("data-path");
  if(id==="zip")el.pattern="[0-9]{5}(-[0-9]{4})?";
 }
}
