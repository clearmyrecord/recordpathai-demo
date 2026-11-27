import {renderProfessionalDraft} from "./professional-wood-draft.js";
const $=id=>document.getElementById(id), notice=t=>$("notice").textContent=t;
const production="pfyxjhdlqgpzzzdssqpk.supabase.co";
let api,orgs=[],epoch=0,active=false,renewal=null;
const caseFilter=()=>$("client-filter").value;
const clear=()=>{if(renewal)clearInterval(renewal);renewal=null;epoch++;active=false;$("app").hidden=true;$("client-form").reset();$("case-form").reset();$("clients").replaceChildren();$("cases").replaceChildren();$("org").replaceChildren();$("client-filter").replaceChildren(option("","All clients"));$("case-filter").value="";$("case-summary").textContent="";orgs=[];};
const fail=()=>{clear();notice("Access or request unavailable. No filing or payment was made. Reload or contact the pilot operator.");};
const ok=r=>{if(r.error)throw Error("Request rejected");return r.data;};
const orgId=()=>$("org").value;
const option=(value,label)=>{const o=document.createElement("option");o.value=value;o.textContent=label;return o;};
const add=(el,tag,text)=>{const n=document.createElement(tag);n.textContent=text;el.append(n);return n;};
async function refreshPaidLease(){
 const session=ok(await api.auth.getSession()).session;if(!session?.access_token)return false;
 const r=await fetch("/api/professional/live-billing/refresh",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
 if(!r.ok)return false;const data=await r.json();return data.ok===true&&data.mode==="live"&&data.active===true;
}
async function load(){
 clear();const seq=epoch;
 const config=await window.RecordPathSupabase.getConfig();
 if(new URL(config.url).origin!=="https://"+production){notice("Professional practice requires the production account service.");return;}
 api=await window.RecordPathSupabase.getClient();
 const user=await api.auth.getUser();
 if(seq!==epoch)return;
 if(user.error||!user.data.user){$("login").hidden=false;notice("Sign in to an approved professional account.");return;}
 $("login").hidden=true;$("logout").hidden=false;
 if(ok(await api.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel!=="aal2"){notice("Two-step verification is required before opening client records.");location.replace("professional-account.html?secure=1");return;}
 const paidRows=ok(await api.from("professional_live_billing").select("org_id").limit(2));
 if(paidRows.length){if(paidRows.length!==1||!await refreshPaidLease()){notice("A current paid subscription is required. Visit Professional account to manage billing.");return;}}
 if(seq!==epoch)return;
 const [o,m]=await Promise.all([api.from("professional_pilot_orgs").select("id,pilot_code,client_intake_enabled,access_kind,self_service_terms_at"),api.from("professional_pilot_members").select("org_id,role,attorney_verified")]);
 if(seq!==epoch)return;
 const members=ok(m);orgs=ok(o).filter(x=>x.client_intake_enabled&&members.some(y=>y.org_id===x.id&&((y.role==="attorney"&&y.attorney_verified)||(x.access_kind==="paid"&&x.self_service_terms_at&&y.role==="staff"&&!y.attorney_verified))));
 if(!orgs.length){notice("No active workspace. Subscribe or apply for the complimentary organization pilot.");return;}
 for(const org of orgs)$("org").append(option(org.id,org.pilot_code));
 active=true;$("app").hidden=false;await refresh();
 if(paidRows.length&&active)renewal=setInterval(async()=>{try{if(active&&!await refreshPaidLease()){clear();notice("Subscription access expired. Return to Professional account.");}}catch{fail();}},10*60*1000);
}
async function saveGeneratedPacket(bytes,caseId,kind,seq,org){
 const session=ok(await api.auth.getSession()).session;if(!session?.access_token||!active||seq!==epoch||org!==orgId())throw Error("Workspace changed");
 const response=await fetch("/api/professional/recordwatch/generated-packet",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/pdf","x-professional-case-id":caseId,"x-professional-packet-kind":kind},body:bytes,cache:"no-store"});
 const result=await response.json().catch(()=>({}));if(!response.ok||result.ok!==true||result.document?.case_id!==caseId||result.document?.kind!==kind)throw Error("Generated packet not saved");
 if(!active||seq!==epoch||org!==orgId())throw Error("Workspace changed");
 return result.document;
}
async function refresh(){
 if(!active)return;
 const seq=++epoch,org=orgId();
 const selectedClient=$("clients").value,selectedFilter=caseFilter();
 $("clients").replaceChildren();$("cases").replaceChildren();
 const [a,b,c,d,docs,reviewRows,counselRows,enrollRows,taskRows,verifiedRows,observedRows,generatedRows]=await Promise.all([...["professional_clients","professional_cases","professional_case_decisions","professional_case_events"].map(t=>api.from(t).select("*").eq("org_id",org).order("created_at",{ascending:false}).limit(100)),api.from("professional_signed_documents").select("id,org_id,case_id,attorney_id,sha256,page_count,created_at,signature_mode,counsel_name,counsel_bar_number").eq("org_id",org).order("created_at",{ascending:false}).limit(100),api.from("professional_signed_reviews").select("*").eq("org_id",org).limit(100),api.from("professional_counsel_profiles").select("*").eq("org_id",org).limit(1),api.from("professional_watch_enrollments").select("*").eq("org_id",org).limit(100),api.from("professional_watch_tasks").select("*").eq("org_id",org).order("due_date").limit(500),api.from("professional_verified_court_events").select("id,case_id,event_type,occurred_on,evidence_url,verified_at").eq("org_id",org).order("occurred_on",{ascending:false}).limit(500),api.from("professional_watch_observations").select("*").limit(100),api.from("professional_generated_packets").select("id,case_id,kind,sha256,page_count,created_at").eq("org_id",org).order("created_at",{ascending:false}).limit(500)]);
 if(seq!==epoch||!active||org!==orgId())return;
 const clients=ok(a),cases=ok(b),decisions=ok(c),events=ok(d),documents=ok(docs),signedReviews=ok(reviewRows),counsel=ok(counselRows)[0],enrollments=ok(enrollRows),tasks=ok(taskRows),verified=ok(verifiedRows),observations=ok(observedRows),generated=ok(generatedRows);
 $("client-filter").replaceChildren(option("","All clients"));
 for(const client of clients){$("clients").append(option(client.id,client.full_name));$("client-filter").append(option(client.id,client.full_name));}
 if(clients.some(c=>c.id===selectedClient))$("clients").value=selectedClient;
 if(clients.some(c=>c.id===selectedFilter))$("client-filter").value=selectedFilter;
 const visible=cases.filter(c=>(!caseFilter()||c.client_id===caseFilter())&&c.case_number.toLowerCase().includes($("case-filter").value.trim().toLowerCase()));
 $("case-summary").textContent=clients.length+" saved clients · "+cases.length+" saved cases · "+visible.length+" shown (most recent 100 records).";
 if(!visible.length)add($("cases"),"p","No matching saved cases. Choose another client or save a new case above.");
 $("role").textContent="Secure professional account · assigned records only";

 for(const row of visible){
  const client=clients.find(x=>x.id===row.client_id);if(!client)continue;
  const card=document.createElement("article");add(card,"h3",client.full_name+" — "+row.case_number);
  add(card,"p",row.outcome+" · "+row.charge_name+" · "+row.charge_code+" · "+row.charge_level+" · disposition "+row.disposition_date+(row.final_discharge_date?" · discharge "+row.final_discharge_date:""));
  add(card,"p","Mailing: "+[client.line1,client.line2,client.city,client.state,client.zip].filter(Boolean).join(", ")+" · "+client.email+" · "+client.phone);
  if(row.outcome==="mixed")add(card,"p","Eligibility: mixed dispositions require review before packet preparation.");
  else if(window.RecordPathEligibilityEngine?.resolveEligibilityForCase){
   const disposition={dismissal:"dismissed",not_guilty:"not guilty",conviction:"convicted"}[row.outcome]||"";
   const result=window.RecordPathEligibilityEngine.resolveEligibilityForCase({id:row.id,court:{caseState:"OH",county:"Wood",courtName:"Wood County Court of Common Pleas",caseNumber:row.case_number},charges:[{chargeName:row.charge_name,statuteCode:row.charge_code,chargeLevel:row.charge_level,disposition,dispositionDate:row.disposition_date,finalDischargeDate:row.final_discharge_date||"",probationCompletedDate:row.probation_end_date||""}],outcome:{outcome:disposition,dispositionDate:row.disposition_date,finalDischargeDate:row.final_discharge_date||""}});
   add(card,"h4","Eligibility screening");add(card,"p",result.status+" · "+(result.formattedEligibilityDate||"Date not available")+" · "+(result.ruleCitation||"Review local rules"));
   for(const flag of result.flags||[])add(card,"p",flag);
   add(card,"p","Estimate using the same consumer eligibility engine. Full charge inventory, exclusions and other eligibility requirements must be reviewed before filing.");
  }else add(card,"p","Eligibility screening unavailable. Do not rely on an estimate.");
  const decision=decisions.find(x=>x.case_id===row.id);
  add(card,"p",decision?"Review: "+decision.decision.replaceAll("_"," "):"Awaiting authorized review");
  const button=(label,fn)=>{const btn=add(card,"button",label);btn.type="button";btn.addEventListener("click",async()=>{if(!active||org!==orgId())return;btn.disabled=true;try{await fn();}catch{notice("Action rejected. Check saved information and access.");}finally{btn.disabled=false;}});return btn;};
  add(card,"h4","RecordWatch Professional");
  const enrollment=enrollments.find(e=>e.case_id===row.id);
  const observed=observations.find(e=>e.case_id===row.id);
  if(enrollment?.enabled){
   const nowParts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(p=>[p.type,p.value]));
   const day=nowParts.year+"-"+nowParts.month+"-"+nowParts.day;
   const next=new Date(day+"T00:00:00Z");next.setUTCDate(next.getUTCDate()+7);const week=next.toISOString().slice(0,10);
   const ownTasks=tasks.filter(t=>t.case_id===row.id),ownEvents=verified.filter(v=>v.case_id===row.id);
   add(card,"p",ownTasks.filter(t=>!t.completed&&t.due_date<day).length+" overdue · "+ownTasks.filter(t=>!t.completed&&t.due_date>=day&&t.due_date<=week).length+" due within seven days");
   if(observed)add(card,"p","Last scheduled reminder summary: "+new Date(observed.checked_at).toLocaleString());
   const kind=document.createElement("select");kind.setAttribute("aria-label","Reminder type");for(const [v,t] of [["follow_up","Follow-up"],["hearing","Hearing"],["filing_deadline","Filing deadline"]])kind.append(option(v,t));
   const due=document.createElement("input");due.type="date";due.setAttribute("aria-label","Attorney-entered due date");due.value=day;card.append(kind,due);
   button("Add case reminder",async()=>{if(!due.value)throw Error("Date required");ok(await api.from("professional_watch_tasks").insert({org_id:org,case_id:row.id,kind:kind.value,due_date:due.value}));await refresh();});
   for(const task of ownTasks){add(card,"p",task.due_date+" · "+task.kind.replaceAll("_"," ")+" · "+(task.completed?"Completed":task.due_date<day?"Overdue":"Open"));button(task.completed?"Reopen reminder":"Complete reminder",async()=>{ok(await api.from("professional_watch_tasks").update({completed:!task.completed}).eq("id",task.id));await refresh();});}
   add(card,"h4","Independently verified court events");
   if(!ownEvents.length)add(card,"p","No independently verified event recorded. This does not indicate that the court has taken no action.");
   for(const v of ownEvents){add(card,"p",v.occurred_on+" · "+v.event_type.replaceAll("_"," ")+" · verified "+new Date(v.verified_at).toLocaleDateString());
    try{const u=new URL(v.evidence_url);if(u.protocol==="https:"&&["pub.clerkofcourt.co.wood.oh.us","clerkofcourt.co.wood.oh.us"].includes(u.hostname)&&!u.username&&!u.password){const a=add(card,"a","Official evidence");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";}}catch{}
   }
   button("Pause RecordWatch",async()=>{ok(await api.from("professional_watch_enrollments").update({enabled:false}).eq("case_id",row.id));await refresh();});
  }else{const label=add(card,"label","");const consent=document.createElement("input");consent.type="checkbox";label.append(consent,document.createTextNode(" I have client authorization to store case reminders and independently verified court events."));
   button("Enable RecordWatch",async()=>{if(!consent.checked)throw Error("Consent required");if(enrollment)ok(await api.from("professional_watch_enrollments").update({enabled:true}).eq("case_id",row.id));else ok(await api.from("professional_watch_enrollments").insert({org_id:org,case_id:row.id,consent_confirmed:true}));await refresh();});}
  add(card,"p","Reminders use attorney-entered dates. Official events require independent verification; no live docket feed or email/SMS dispatch is connected.");
  const docket=add(card,"a","Check official Wood County docket");docket.href="https://pub.clerkofcourt.co.wood.oh.us/eservices/home.page.2";docket.target="_blank";docket.rel="noopener noreferrer";

  if(!decision){
   const label=add(card,"label","");const checked=document.createElement("input");checked.type="checkbox";label.append(checked,document.createTextNode(" I reviewed the complete docket, charge inventory, eligibility and filing requirements."));
   const decide=async value=>{if(!checked.checked)throw Error("Review required");ok(await api.from("professional_case_decisions").insert({org_id:org,case_id:row.id,decision:value,entire_case_reviewed:true}));await refresh();};
   button("Hold for review",()=>decide("hold"));
   if(row.outcome!=="mixed")button("Approve unsigned draft",()=>decide("approved_for_unsigned_draft"));
  }else if(decision.decision==="approved_for_unsigned_draft"){
   add(card,"p","Professional preparation: included. Court fee: "+(row.outcome==="conviction"?"$100":"$0 for qualifying nonconvictions")+". File directly with the court; no payment collected here.");
   button("Generate and save review draft",async()=>{
    const token=epoch;
    const [freshClient,freshCase,freshDecision]=await Promise.all([api.from("professional_clients").select("*").eq("id",client.id).single(),api.from("professional_cases").select("*").eq("id",row.id).single(),api.from("professional_case_decisions").select("*").eq("case_id",row.id).single()]);
    const bytes=await renderProfessionalDraft({client:ok(freshClient),caseRow:ok(freshCase),decision:ok(freshDecision),today:new Date().toISOString().slice(0,10),PDFLib:window.PDFLib});
    if(!active||token!==epoch||org!==orgId())return;
    await saveGeneratedPacket(bytes,row.id,"review_draft",token,org);
    await refresh();notice("Review draft saved in RecordWatch. Open it from the case’s saved packet library.");
   });
   const signLabel=add(card,"label","");const signConsent=document.createElement("input");signConsent.type="checkbox";signLabel.append(signConsent,document.createTextNode(" I reviewed the official form and will obtain the required applicant signature and date before filing."));
   button("Download official form for signature",async()=>{
    if(!signConsent.checked)throw Error("Confirm signature requirement");
    const token=epoch;
    const [freshClient,freshCase,freshDecision]=await Promise.all([api.from("professional_clients").select("*").eq("id",client.id).single(),api.from("professional_cases").select("*").eq("id",row.id).single(),api.from("professional_case_decisions").select("*").eq("case_id",row.id).single()]);
    const bytes=await renderProfessionalDraft({client:ok(freshClient),caseRow:ok(freshCase),decision:ok(freshDecision),today:new Date().toISOString().slice(0,10),PDFLib:window.PDFLib,signatureReady:true});
    if(!active||token!==epoch||org!==orgId()||!signConsent.checked)return;
    await saveGeneratedPacket(bytes,row.id,"unsigned_application",token,org);
    await refresh();notice("Unsigned application saved in RecordWatch. Open it below to obtain the applicant signature.");
   });
   add(card,"h4","Signed document review");
   add(card,"p","Obtain the actual applicant signature on the official form outside this tool. Upload the exact signed official two-page PDF; watermarked review drafts are not accepted.");
   const file=document.createElement("input");file.type="file";file.accept="application/pdf";file.setAttribute("aria-label","Signed two-page official PDF");card.append(file);
   const label=add(card,"label","");const attested=document.createElement("input");attested.type="checkbox";label.append(attested,document.createTextNode(" I attest that the applicant signed this exact official application."));
   const auth=async()=>{const session=ok(await api.auth.getSession()).session;if(!session?.access_token)throw Error("Session unavailable");return {Authorization:"Bearer "+session.access_token};};
   add(card,"p","Attorney-only signing is held pending confirmation of the court’s local signature rules. Do not sign the applicant’s name.");
   button("Upload signed PDF",async()=>{
    const selected=file.files[0];if(!attested.checked||!selected||selected.size>2097152)throw Error("Signed PDF and attestation required");
    const token=epoch;const headers=await auth();if(!active||token!==epoch||org!==orgId())return;
    const response=await fetch("/api/professional/signed-review",{method:"POST",headers:{...headers,"Content-Type":"application/pdf","x-professional-case-id":row.id,"x-professional-signature-attested":"yes"},body:selected,cache:"no-store"});
    if(!response.ok)throw Error("Upload rejected");file.value="";await refresh();
   });
   add(card,"h4","Saved packets");
   const saved=generated.filter(x=>x.case_id===row.id);
   if(!saved.length)add(card,"p","No generated packet saved for this case yet.");
   for(const doc of saved){
    add(card,"p",(doc.kind==="review_draft"?"Review draft — not filing-ready":"Unsigned official application — signature required")+" · "+new Date(doc.created_at).toLocaleString()+" · "+doc.page_count+" pages");
    button("Open saved "+(doc.kind==="review_draft"?"review draft":"unsigned application"),async()=>{
     const token=epoch;const headers=await auth();const response=await fetch("/api/professional/recordwatch/generated-packet/"+encodeURIComponent(doc.id),{headers,cache:"no-store"});
     if(!response.ok)throw Error("Saved packet unavailable");
     const blob=await response.blob();if(!active||token!==epoch||org!==orgId()||blob.type!=="application/pdf")return;
     const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=doc.kind==="review_draft"?"recordwatch-review-draft.pdf":"recordwatch-unsigned-application.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);
    });
   }
   const rowDocs=documents.filter(x=>x.case_id===row.id);
   const rowReviews=signedReviews.filter(x=>x.case_id===row.id);
   for(const doc of rowDocs){
    add(card,"p",(doc.signature_mode==="counsel_assumption_staging"?"Counsel assumption — not filing-ready · ":"Applicant-signed · ")+"PDF SHA-256: "+doc.sha256+" · "+(rowReviews.some(r=>r.document_id===doc.id)?"Reviewed":"Awaiting exact-document review"));
    let downloaded=false;
    button("Open private signed PDF",async()=>{
      const token=epoch;const headers=await auth();const response=await fetch("/api/professional/signed-review/"+encodeURIComponent(doc.id),{headers,cache:"no-store"});
      if(!response.ok)throw Error("Download rejected");const blob=await response.blob();if(!active||token!==epoch||org!==orgId())return;
      const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="signed-review.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);downloaded=true;
    });
    if(!rowReviews.some(r=>r.document_id===doc.id)){
      const reviewLabel=add(card,"label","");const reviewed=document.createElement("input");reviewed.type="checkbox";reviewLabel.append(reviewed,document.createTextNode(" I inspected this exact signed PDF, confirmed the signature and information, and accept responsibility for any subsequent manual filing."));
      button("Record exact signed PDF review",async()=>{if(!reviewed.checked||!downloaded)throw Error("Open and review the PDF first");ok(await api.from("professional_signed_reviews").insert({document_id:doc.id,org_id:org,case_id:row.id,exact_document_reviewed:true}));await refresh();});
    }
   }
   if(rowReviews.some(r=>rowDocs.some(d=>d.id===r.document_id&&d.signature_mode==="applicant_external"))){
    add(card,"h4","Manual filing instructions");
    add(card,"p","Mail the reviewed signed Address Verification and application to Wood County Clerk of Courts, One Courthouse Square, Bowling Green, OH 43402. Counsel must handle any required service or additional copies.");
    if(row.outcome==="conviction"){
     add(card,"p","Include the applicable $100 court deposit, payable to Wood County Clerk of Courts, with the case number on the check memo. Alternatively pay the court online and email the signed documents with the payment confirmation number to clerkofcourts@woodcountyohio.gov.");
     const pay=add(card,"a","Official court payment instructions");pay.href="https://clerkofcourt.co.wood.oh.us/166/Make-a-Payment";pay.target="_blank";pay.rel="noopener noreferrer";
    }else add(card,"p","Qualifying dismissal/not-guilty applications have no court fee. Do not include a court-fee check. No-fee email filing acceptance is unconfirmed; use the verified manual route.");
    add(card,"p","RecordPathAI does not submit the application or charge for manual filing. Confirm clerk acceptance on the official docket.");
   }
   const event=document.createElement("select");event.setAttribute("aria-label","Manual status event");
   for(const [v,t] of [["manual_filing_reported","Filing reported by attorney"],["manual_hearing_reported","Hearing reported by attorney"],["manual_order_reported","Order reported by attorney"],["manual_followup","Follow-up"]])if(v==="manual_followup"||rowReviews.some(r=>rowDocs.some(d=>d.id===r.document_id&&d.signature_mode==="applicant_external")))event.append(option(v,t));
   const date=document.createElement("input");date.type="date";date.setAttribute("aria-label","Event date");date.value=new Date().toISOString().slice(0,10);card.append(event,date);
   button("Save manual event",async()=>{if(!date.value)throw Error("Date required");ok(await api.from("professional_case_events").insert({org_id:org,case_id:row.id,event_type:event.value,event_date:date.value}));await refresh();});
   for(const e of events.filter(x=>x.case_id===row.id))add(card,"p",e.event_date+" — "+e.event_type.replaceAll("_"," "));
  }
  $("cases").append(card);
 }
 notice("Professional workspace loaded. Manual filing, case reminders and verified-event tracking; no automated court filing.");
}
function bindForm(id,table,build){
 $(id).addEventListener("submit",async e=>{
 e.preventDefault();if(!active)return;const form=e.currentTarget,btn=form.querySelector("button");btn.disabled=true;
 try{const org=orgId(),values=Object.fromEntries(new FormData(form));ok(await api.from(table).insert(build(values,org)));form.reset();await refresh();}catch{notice("Unable to save. Confirm required fields and authorization.");}finally{btn.disabled=false;}
 });
}
bindForm("client-form","professional_clients",(v,org)=>({org_id:org,...v,authorization_confirmed:v.authorization_confirmed==="on"}));
bindForm("case-form","professional_cases",(v,org)=>({org_id:org,...v,final_discharge_date:v.final_discharge_date||null,probation_end_date:v.probation_end_date||null}));
$("org").addEventListener("change",()=>{$("client-form").reset();$("case-form").reset();refresh().catch(fail);});
$("refresh").addEventListener("click",()=>refresh().catch(fail));
$("client-filter").addEventListener("change",()=>refresh().catch(fail));
$("case-filter").addEventListener("change",()=>refresh().catch(fail));
$("logout").addEventListener("click",async()=>{clear();try{await api.auth.signOut();}finally{location.reload();}});
window.addEventListener("pagehide",clear);
try{await load();if(api)api.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"||event==="USER_DELETED"){clear();notice("Session ended.");$("login").hidden=false;$("logout").hidden=true;}});}catch{fail();}
