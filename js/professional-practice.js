import {renderProfessionalDraft,prepareProfessionalDraftData} from "./professional-wood-draft.js";
import {mountProfessionalRecordIntake,mountProfessionalPersonalIntake,buildProfessionalRecordPayload,sameRecordSnapshot} from "./professional-record-intake.js";
let sharedIntake=null;
const workflowFiles=["professional-practice.html","professional-eligibility.html","professional-record-details.html","professional-packet.html"];
const routeStep=Math.max(0,workflowFiles.indexOf(location.pathname.split("/").pop()));
const routeParams=new URLSearchParams(location.search);
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
let routeClient=null,routeCase=null;
function navigateWorkflow(step,{clientId=null,caseId=null}={}){
 const url=new URL(workflowFiles[step],location.href);
 if(orgId())url.searchParams.set("org",orgId());
 if(uuid(clientId))url.searchParams.set("clientId",clientId);
 if(uuid(caseId))url.searchParams.set("caseId",caseId);
 location.assign(url.href);
}
const $=id=>document.getElementById(id), notice=t=>$("notice").textContent=t;
const production="pfyxjhdlqgpzzzdssqpk.supabase.co";
let api,orgs=[],epoch=0,active=false,renewal=null,packetCaseId=null,internalTestAccess=false;
const caseFilter=()=>$("client-filter").value;
const setStep=n=>{$("app").classList.toggle("professional-packet-mode",n===3);$("app").classList.toggle("professional-intake-mode",n===1||n===2);if($("workflow-progress"))$("workflow-progress").textContent=Math.max(0,n-1)+" of 3 steps completed";$("professional-steps").hidden=!n;for(const [i,id] of ["step-personal","step-record","step-packet"].entries()){const el=$(id);el.classList.toggle("step-completed",i+1<n);el.classList.toggle("step-locked",i+1>n);if(i+1===n)el.setAttribute("aria-current","step");else el.removeAttribute("aria-current");el.querySelector(".step-status")?.replaceChildren(i+1<n?"Completed":i+1===n?"Current":"Locked");}};
const hideIntake=()=>{for(const id of ["client-intake","case-intake"])$(id).hidden=true;};
const returnDashboard=()=>{if(routeStep){navigateWorkflow(0);return;}$("client-form").reset();$("case-form").reset();sharedIntake?.reset();hideIntake();packetCaseId=null;setStep(0);$("case-filter").value="";$("client-filter").value="";refresh().catch(fail);$("saved-clients").scrollIntoView({block:"start"});};
const showIntake=id=>{if(!active)return;if(!routeStep){navigateWorkflow(id==="case-intake"?2:1,{clientId:id==="case-intake"?$("clients").value:null});return;}if((id==="client-intake"?1:2)!==routeStep)return;if(id==="client-intake")$("client-form").reset();else{const selected=$("clients").value;$("case-form").reset();sharedIntake?.reset();if(routeClient)$("clients").value=routeClient.id;else if(selected)$("clients").value=selected;}hideIntake();packetCaseId=null;setStep(id==="client-intake"?1:2);$(id).hidden=false;$(id).scrollIntoView({block:"start"});};
const clear=()=>{routeClient=null;routeCase=null;hideIntake();packetCaseId=null;setStep(0);$("client-list").replaceChildren();for(const id of ["client-count","case-count","packet-count","watch-count"])$(id).textContent="0";if(renewal)clearInterval(renewal);renewal=null;epoch++;active=false;internalTestAccess=false;$("app").hidden=true;$("client-form").reset();$("professional-personal-fields").replaceChildren();$("case-form").reset();$("recordDetailsForm").replaceChildren();sharedIntake=null;$("clients").replaceChildren();$("cases").replaceChildren();$("org").replaceChildren();$("client-filter").replaceChildren(option("","All clients"));$("case-filter").value="";$("case-summary").textContent="";orgs=[];};
const fail=()=>{clear();notice("Access or request unavailable. No filing or payment was made. Reload or contact the pilot operator.");};
const ok=r=>{if(r.error)throw Error("Request rejected");return r.data;};
const orgId=()=>$("org").value;
const option=(value,label)=>{const o=document.createElement("option");o.value=value;o.textContent=label;return o;};
const add=(el,tag,text)=>{const n=document.createElement(tag);n.textContent=text;el.append(n);return n;};
async function refreshPaidLease(){
 const session=ok(await api.auth.getSession()).session;if(!session?.access_token)return false;
 const r=await fetch("/api/professional/live-billing/refresh",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
 if(!r.ok)return false;const data=await r.json();internalTestAccess=data.ok===true&&data.active===true&&data.test_access===true;return data.ok===true&&data.mode==="live"&&data.active===true;
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
 const requestedOrg=routeParams.get("org");
 if(requestedOrg){if(!orgs.some(o=>o.id===requestedOrg)){notice("This workspace is not accessible. Return to RecordWatch.");return;}$("org").value=requestedOrg;}
 if(routeStep){
  const requestedCase=routeParams.get("caseId"),requestedClient=routeParams.get("clientId");
  if(routeStep===3){
   if(!uuid(requestedCase)){notice("Open a saved case from RecordWatch to prepare its packet.");return;}
   routeCase=ok(await api.from("professional_cases").select("*").eq("org_id",orgId()).eq("id",requestedCase).maybeSingle());
   if(!routeCase){notice("Saved case is not accessible in this workspace.");return;}
  }
  const clientId=routeCase?.client_id||requestedClient;
  if(clientId){
   if(!uuid(clientId)){notice("Select an accessible saved client in RecordWatch.");return;}
   routeClient=ok(await api.from("professional_clients").select("*").eq("org_id",orgId()).eq("id",clientId).maybeSingle());
   if(!routeClient||routeClient.authorization_confirmed!==true){notice("An authorized saved client is required.");return;}
  }else if(routeStep===3){notice("Begin with personal information before continuing.");return;}
  if(seq!==epoch)return;
  if(routeStep===1&&!routeClient)await mountProfessionalPersonalIntake($("professional-personal-fields"));
  if(routeStep===2&&routeClient)sharedIntake=await mountProfessionalRecordIntake($("recordDetailsForm"));
  if(seq!==epoch)return;
  packetCaseId=routeCase?.id||null;
 }
 active=true;$("app").hidden=false;setStep(routeStep);await refresh();
 if(!active)return;
 if(routeStep===1){
  showIntake("client-intake");
  const picker=$("existing-client-picker");picker.replaceChildren(option("","Create a new client"),...Array.from($("clients").options,o=>option(o.value,o.textContent)));
  picker.value=routeClient?.id||"";
  picker.addEventListener("change",()=>navigateWorkflow(1,{clientId:picker.value}));
  if(routeClient){
   $("client-form").hidden=true;
   const summary=$("existing-client-review");summary.hidden=false;summary.replaceChildren();
   add(summary,"h3","Verify saved personal and contact information");
   const grid=add(summary,"div","");grid.className="professional-packet-contact";
   for(const [label,value] of [["Full legal name",routeClient.full_name],["Date of birth",routeClient.dob],["Other names",routeClient.other_names],["Email",routeClient.email],["Telephone",routeClient.phone],["Mailing address",[routeClient.line1,routeClient.line2,routeClient.city,routeClient.state,routeClient.zip].filter(Boolean).join(", ")]]){const item=add(grid,"div","");add(item,"strong",label);add(item,"span",value||"Not entered");}
   const next=add(summary,"button","Continue to Case Information");next.type="button";next.addEventListener("click",()=>navigateWorkflow(2,{clientId:routeClient.id}));
  }
 }else if(routeStep===2){
  showIntake("case-intake");
  const picker=$("clients");
  picker.insertBefore(option("","Select a saved client"),picker.firstChild);
  picker.value=routeClient?.id||"";
  picker.disabled=false;
  picker.addEventListener("change",()=>navigateWorkflow(2,{clientId:picker.value}));
  $("recordDetailsForm").hidden=!routeClient;
  $("case-save").hidden=!routeClient;
  $("case-save").disabled=!routeClient;
  $("back-personal").href=workflowFiles[1]+"?"+new URLSearchParams(routeClient?{org:orgId(),clientId:routeClient.id}:{org:orgId()});
  $("back-personal").textContent=routeClient?"Back to Personal Information":"Add a new client in Step 1";
  if(!routeClient)notice("Select a saved client to add a new case in Step 2. If the client is new, complete Step 1 first.");
 }else if(routeStep===3){
  if(!Array.from($("cases").children).some(el=>el.dataset.caseId===packetCaseId)){notice("Saved packet case could not be loaded. Return to RecordWatch.");return;}
 }
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
 $("clients").replaceChildren();$("cases").replaceChildren();$("client-list").replaceChildren();
 const scoped=(table,fields="*")=>{
  let q=api.from(table).select(fields);
  if(table!=="professional_watch_observations")q=q.eq("org_id",org);
  if(routeStep===3&&routeCase){
   if(table==="professional_clients")q=q.eq("id",routeCase.client_id);
   else if(table==="professional_cases")q=q.eq("id",routeCase.id);
   else if(table!=="professional_counsel_profiles")q=q.eq("case_id",routeCase.id);
  }
  return q;
 };
 const [a,b,c,d,docs,reviewRows,counselRows,enrollRows,taskRows,verifiedRows,observedRows,generatedRows]=await Promise.all([...["professional_clients","professional_cases","professional_case_decisions","professional_case_events"].map(t=>scoped(t).order("created_at",{ascending:false}).limit(100)),scoped("professional_signed_documents","id,org_id,case_id,attorney_id,sha256,page_count,created_at,signature_mode,counsel_name,counsel_bar_number").order("created_at",{ascending:false}).limit(100),scoped("professional_signed_reviews","*").limit(100),scoped("professional_counsel_profiles","*").limit(1),scoped("professional_watch_enrollments","*").limit(100),scoped("professional_watch_tasks","*").order("due_date").limit(500),scoped("professional_verified_court_events","id,case_id,event_type,occurred_on,evidence_url,verified_at").order("occurred_on",{ascending:false}).limit(500),scoped("professional_watch_observations").limit(100),scoped("professional_generated_packets","id,case_id,kind,sha256,page_count,created_at").order("created_at",{ascending:false}).limit(500)]);
 if(seq!==epoch||!active||org!==orgId())return;
 const clients=ok(a),cases=ok(b),decisions=ok(c),events=ok(d),documents=ok(docs),signedReviews=ok(reviewRows),counsel=ok(counselRows)[0],enrollments=ok(enrollRows),tasks=ok(taskRows),verified=ok(verifiedRows),observations=ok(observedRows),generated=ok(generatedRows);
 if(routeStep&&routeClient&&!clients.some(c=>c.id===routeClient.id)){if(routeStep===3){fail();return;}clients.push(routeClient);}
 if(routeStep===3&&routeCase){const current=cases.find(c=>c.id===routeCase.id);if(!current){fail();return;}routeCase=current;}
 $("client-filter").replaceChildren(option("","All clients"));
 for(const client of clients){$("clients").append(option(client.id,client.full_name));$("client-filter").append(option(client.id,client.full_name));}
 if(clients.some(c=>c.id===selectedClient))$("clients").value=selectedClient;
 if(clients.some(c=>c.id===selectedFilter))$("client-filter").value=selectedFilter;
 if(!clients.length)add($("client-list"),"p","No saved clients yet. Add a client to start the three-step application.");
 for(const client of clients){const card=add($("client-list"),"article","");card.className="saved-case-card";add(card,"h3",client.full_name).className="saved-case-title";const own=cases.filter(c=>c.client_id===client.id);add(card,"p",own.length+" saved case"+(own.length===1?"":"s")+(own.length?"":" · Ready for Step 2 — Record Details"));const actions=add(card,"div","");actions.className="saved-case-actions";const view=add(actions,"button",own.length?"View client cases":"Continue to Record Details");view.type="button";view.className="btn";view.addEventListener("click",()=>{if(!active||seq!==epoch||org!==orgId())return;if(!own.length){$("clients").value=client.id;showIntake("case-intake");}else{hideIntake();packetCaseId=null;setStep(0);$("client-filter").value=client.id;$("case-filter").value="";refresh().catch(fail);$("saved-cases").scrollIntoView({block:"start"});}});if(own.length){const next=add(actions,"button","Add case");next.type="button";next.className="btn secondary";next.addEventListener("click",()=>{if(!active||seq!==epoch||org!==orgId())return;$("clients").value=client.id;showIntake("case-intake");});}}
 const visible=cases.filter(c=>(routeStep!==3||c.id===packetCaseId)&&(!caseFilter()||c.client_id===caseFilter())&&c.case_number.toLowerCase().includes($("case-filter").value.trim().toLowerCase()));
 $("case-summary").textContent=clients.length+" saved clients · "+cases.length+" saved cases · "+visible.length+" shown (most recent 100 records).";
 $("client-count").textContent=String(clients.length);$("case-count").textContent=String(cases.length);$("packet-count").textContent=String(generated.length);$("watch-count").textContent=String(enrollments.filter(e=>e.enabled).length);
 if(!visible.length)add($("cases"),"p","No matching saved cases. Add a client or enter record details to get started.");
 $("role").textContent="Secure professional account · assigned records only";

 for(const row of visible){
  const client=clients.find(x=>x.id===row.client_id);if(!client)continue;
  const shell=document.createElement("article");shell.className="saved-case-card";shell.dataset.caseId=row.id;
  const summary=add(shell,"div","");summary.className="saved-case-header";const identity=add(summary,"div","");add(identity,"p","Case Number").className="eyebrow-mini";add(identity,"h3",row.case_number).className="saved-case-title";add(identity,"p",client.full_name).className="muted";
  const eligibilityBadge=add(summary,"span","Needs review");eligibilityBadge.className="case-status-badge needs-review";
  const statuses=add(shell,"div","");statuses.className="saved-case-status-row";
  const packetStatus=documents.some(d=>d.case_id===row.id)?"Signed document saved":generated.some(d=>d.case_id===row.id)?"Generated":decisions.some(d=>d.case_id===row.id&&d.decision==="approved_for_unsigned_draft")?"Reviewed":"Not generated";
  const watchEnabled=enrollments.some(e=>e.case_id===row.id&&e.enabled);add(statuses,"span","Packet: "+packetStatus).className="case-status-badge "+(packetStatus==="Generated"?"generated":"not-screened");add(statuses,"span","RecordWatch: "+(watchEnabled?"Active":"Not activated")).className="case-status-badge "+(watchEnabled?"generated":"not-screened");
  const meta=add(shell,"div","");meta.className="saved-case-detail-grid";const field=(label,value)=>{const el=add(meta,"div","");el.className="saved-case-meta";add(el,"strong",label);return add(el,"span",value||"Not available");};
  const detailFields=row.record_details?.fields||{};const actualCourt=detailFields.courtName||(row.court_id==="oh-wood-common-pleas"?"Wood County Court of Common Pleas":"Review required");
  field("Court",actualCourt);field("County / State",[detailFields.county,detailFields.caseState].filter(Boolean).join(", ")||(row.court_id==="oh-wood-common-pleas"?"Wood, OH":"Not entered"));field("Primary Charge",row.charge_name);const estimated=field("Estimated Eligibility Date","Not available");field("Last Updated",new Date(row.updated_at||row.created_at).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}));
  const actions=add(shell,"div","");actions.className="saved-case-actions";
  const section=(label)=>{const d=document.createElement("details");d.className="professional-case-panel";add(d,"summary",label);const body=add(d,"div","");shell.append(d);return {d,body};};
  const reviewPanel=section("Record details & eligibility screening"),watchPanel=section("RecordWatch"),packetPanel=section("Step 3 — Packet");let card=reviewPanel.body;
  let loadCurrentPreview=null;
  const openPanel=panel=>{if(panel===packetPanel&&!routeStep){navigateWorkflow(3,{caseId:row.id});return;}hideIntake();packetCaseId=panel===packetPanel?row.id:null;for(const el of $("cases").children)el.classList.toggle("packet-focused",el===shell&&packetCaseId===row.id);setStep(panel===packetPanel?3:0);for(const p of [reviewPanel,watchPanel,packetPanel])p.d.open=p===panel;panel.d.scrollIntoView({block:"start"});if(panel===packetPanel&&loadCurrentPreview)void loadCurrentPreview().catch(()=>{});};
  const nav=(label,p,primary=false)=>{const b=add(actions,"button",label);b.type="button";b.className=primary?"btn":"btn secondary";b.addEventListener("click",()=>{if(active&&org===orgId())openPanel(p)});};
  nav("Resume",packetStatus==="Not generated"||packetStatus==="Reviewed"?packetPanel:watchPanel,true);nav("Record Details",reviewPanel);nav("Open Packet",packetPanel);nav("Open RecordWatch",watchPanel);
  add(card,"p",row.outcome+" · "+row.charge_name+" · "+row.charge_code+" · "+row.charge_level+" · disposition "+row.disposition_date+(row.final_discharge_date?" · discharge "+row.final_discharge_date:""));
  if(client.other_names)add(card,"p","Other names used: "+client.other_names);
  add(card,"p","Mailing: "+[client.line1,client.line2,client.city,client.state,client.zip].filter(Boolean).join(", ")+" · "+client.email+" · "+client.phone);
  if(row.record_details?.schemaVersion===1){const detail=document.createElement("details");add(detail,"summary","View all saved Step 2 fields");card.append(detail);const renderValues=(parent,obj)=>{for(const [key,val] of Object.entries(obj||{})){const line=add(parent,"p","");add(line,"strong",key.replace(/([a-z])([A-Z])/g,"$1 $2").replaceAll("_"," ") + ": ");line.append(document.createTextNode(val===true?"Yes":val===false?"No":String(val||"Not entered")));}};renderValues(detail,detailFields);for(const [i,charge] of row.record_details.charges.entries()){add(detail,"h4","Charge "+(i+1));renderValues(detail,charge);}}
  let packetEligibility=null;
  if(row.outcome==="mixed")add(card,"p","Eligibility and filing review required: unsupported court, multiple charges, incomplete or unresolved record information. All entered details are saved.");
  else if(window.RecordPathEligibilityEngine?.resolveEligibilityForCase){
   const disposition={dismissal:"dismissed",not_guilty:"not guilty",conviction:"convicted"}[row.outcome]||"";
   const result=window.RecordPathEligibilityEngine.resolveEligibilityForCase({id:row.id,court:{caseState:"OH",county:"Wood",courtName:"Wood County Court of Common Pleas",caseNumber:row.case_number},charges:[{chargeName:row.charge_name,statuteCode:row.charge_code,chargeLevel:row.charge_level,disposition,dispositionDate:row.disposition_date,finalDischargeDate:row.final_discharge_date||"",probationCompletedDate:row.probation_end_date||""}],outcome:{outcome:disposition,dispositionDate:row.disposition_date,finalDischargeDate:row.final_discharge_date||""}});
   packetEligibility=result;
   eligibilityBadge.textContent=result.status||"Needs review";eligibilityBadge.className="case-status-badge "+(String(result.status||"").toLowerCase()==="eligible"?"eligible":"needs-review");estimated.textContent=result.formattedEligibilityDate||"Not available";
   add(card,"h4","Eligibility screening");add(card,"p",result.status+" · "+(result.formattedEligibilityDate||"Date not available")+" · "+(result.ruleCitation||"Review local rules"));
   for(const flag of result.flags||[])add(card,"p",flag);
   add(card,"p","Estimate using the same consumer eligibility engine. Full charge inventory, exclusions and other eligibility requirements must be reviewed before filing.");
  }else add(card,"p","Eligibility screening unavailable. Do not rely on an estimate.");
  const decision=decisions.find(x=>x.case_id===row.id);
  add(card,"p",decision?"Review: "+decision.decision.replaceAll("_"," "):"Awaiting authorized review");
  const button=(label,fn)=>{const btn=add(card,"button",label);btn.type="button";btn.addEventListener("click",async()=>{if(!active||org!==orgId())return;btn.disabled=true;try{await fn();}catch{notice("Action rejected. Check saved information and access.");}finally{btn.disabled=false;}});return btn;};
  card=watchPanel.body;
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
  const docketInfo=window.RecordPathRecordCollection.linkFor({state:detailFields.caseState||(row.court_id==="oh-wood-common-pleas"?"OH":""),county:detailFields.county||(row.court_id==="oh-wood-common-pleas"?"Wood":""),courtType:detailFields.courtType||(row.court_id==="oh-wood-common-pleas"?"court-of-common-pleas":""),courtName:actualCourt});if(docketInfo.url){const docket=add(card,"a",docketInfo.label);docket.href=docketInfo.url;docket.target="_blank";docket.rel="noopener noreferrer";}else add(card,"p",docketInfo.note);

  if(routeStep!==3){packetPanel.d.remove();$("cases").append(shell);continue;}
  card=packetPanel.body;card.classList.add("professional-packet-page");
  const packetCard=(heading)=>{const section=add(packetPanel.body,"section","");section.className="professional-consumer-card";add(section,"h2",heading);return section;};
  const fmtDate=value=>value?window.RecordPathRuleDateUtils.formatDate(value)||"Not entered":"Not entered";
  const nonconviction=["dismissal","not_guilty"].includes(row.outcome);
  const screening=packetCard("Eligibility Status"),result=packetEligibility;
  const banner=add(screening,"div","");banner.className="professional-status-banner";
  const eligible=result?.isEligibleNow===true&&!result.needsReview&&!(result.flags||[]).length;
  const pill=add(banner,"span",eligible?"Likely Eligible":result?.statusLabel||"Eligibility Needs Review");pill.className="professional-status-pill "+(eligible?"eligible":"pending");
  add(banner,"h3",eligible?(row.outcome==="dismissal"?"Dismissed case — likely eligible for sealing":row.outcome==="not_guilty"?"Not-guilty case — likely eligible for sealing":"Likely eligible for record relief"):result?.statusLabel||"Eligibility needs review").className="professional-status-headline";
  add(banner,"p",result?.ruleCitation||"Review the complete saved case and applicable court requirements.");
  const flags=result?.flags||[];
  if(flags.length){const list=add(banner,"ul","");for(const flag of flags)add(list,"li",flag);}
  const dates=add(screening,"div","");dates.className="professional-date-grid";
  for(const [label,value] of [["Relief Type",result?.reliefType], [nonconviction?"Dismissal / disposition date":"Sentence completion / discharge date",result?fmtDate(result.completionDate):"Review required"],["Required Waiting Period",result?.waitingPeriodText],["Estimated Eligible Date",result?.formattedEligibilityDate]]){
   const box=add(dates,"div","");box.className="professional-date-box";add(box,"span",label);add(box,"strong",value||"Review required");
  }
  add(screening,"p",eligible?"Eligible now":result?.status||"More information needed").className="professional-meta-note";
  add(screening,"p","This is a screening result, not legal advice. Final approval depends on the court.").className="professional-meta-note";
  const tracking=add(screening,"aside","");tracking.className="professional-tracking-panel";add(tracking,"h3","RecordWatch background tracking");add(tracking,"p","RecordWatch uses the same eligibility and record details powering this packet.");
  const trackGrid=add(tracking,"div","");trackGrid.className="professional-tracking-grid";
  for(const [label,value] of [["Tracking",watchEnabled?"Enabled":"Not activated"],["Estimated eligibility",eligible?"Eligible now":result?.status||"Review required"],["Missing requirements",flags.length?flags.join("; "):result?"None recorded":"Case review required"],["Next action",eligible?"Generate court packet.":"Review saved case requirements."]]){const item=add(trackGrid,"div","");add(item,"strong",label);add(item,"span",value);}
  add(tracking,"p","Professional preparation and digital download are included. Optional mailing and SMS/email case alerts are $10 per filing plus applicable court fees and tax.").className="professional-meta-note";
  const watchLink=add(tracking,"a","View RecordWatch Professional →");watchLink.href=workflowFiles[0]+"?"+new URLSearchParams({org});
  const intake=packetCard("Intake Summary"),summaryGrid=add(intake,"div","");summaryGrid.className="professional-summary-grid";
  const summaryBox=(heading,fields)=>{const box=add(summaryGrid,"div","");box.className="professional-summary-box";add(box,"h3",heading);for(const [label,value] of fields){const line=add(box,"div","");line.className="professional-summary-row";add(line,"strong",label);add(line,"span",value||"Not entered");}};
  summaryBox("Person",[["Name",client.full_name],["Email",client.email],["Phone",client.phone],["Address",[client.line1,client.line2,client.city,client.state,client.zip].filter(Boolean).join(", ")],["Residence State",client.state]]);
  const outcomeLabel={dismissal:"Dismissed",not_guilty:"Not guilty",conviction:"Convicted",mixed:"Review required"}[row.outcome]||row.outcome;
  summaryBox("Selected Record",[["Case State",detailFields.caseState],["Charge",row.charge_name],["Offense Code",row.charge_code],["Level",row.charge_level],["Case Number",row.case_number],["Court",actualCourt],["Judge Name",row.judge_name||detailFields.judgeName],["County",detailFields.county],["Outcome",outcomeLabel]]);
  const offenses=packetCard("All Saved Offenses");add(offenses,"p","The packet and eligibility banner above use the current selected record. This section shows every saved offense for this client’s selected case.");
  const charges=Array.isArray(row.record_details?.charges)&&row.record_details.charges.length?row.record_details.charges:[{charge_name:row.charge_name,charge_code:row.charge_code,degree:row.charge_level,disposition:outcomeLabel,disposition_date:row.disposition_date,discharge_date:row.final_discharge_date}];
  for(const [i,charge] of charges.entries()){const item=add(offenses,"article","");item.className="professional-offense-item";const head=add(item,"div","");head.className="professional-offense-head";add(head,"h3","Offense "+(i+1)+": "+(charge.charge_name||"Not entered"));if(i===0&&charges.length===1)add(head,"span","Current packet record").className="professional-record-tag";
   const grid=add(item,"div","");grid.className="professional-offense-grid";
   for(const [label,value] of [["Case Number",row.case_number],["Statute",charge.charge_code],["Degree",charge.degree],["Outcome",charge.disposition||charge.outcome||(charges.length===1?outcomeLabel:"Not entered")],["Disposition Date",fmtDate(charge.disposition_date)],["Discharge Date",fmtDate(charge.discharge_date)],["Court",actualCourt],["County",detailFields.county]]){const line=add(grid,"div","");add(line,"strong",label+": ");line.append(document.createTextNode(value||"Not entered"));}
  }
  card=packetCard("Generate Packet");
  add(card,"p","RecordPathAI packet preparation: $0 — included with professional access. Applicable court fees are separate: "+(row.outcome==="conviction"?"$100 for a qualifying Wood County conviction":row.outcome==="mixed"?"Requires review":"$0 for qualifying Wood County dismissal or not-guilty cases")+".");
  const generateCard=card;
  const fees=add(card,"section","");fees.className="professional-packet-fees";add(fees,"h3","Your packet and court fees");
  for(const [label,value] of [["RecordPathAI application preparation","$0 — included"],["Court filing fee / deposit",row.outcome==="conviction"?"$100":row.outcome==="mixed"?"Review required":"$0"],["Mailing + SMS/email case alerts",row.outcome==="conviction"?"$10 + applicable tax":"$10 when mailing is available"]]){const line=add(fees,"div","");add(line,"span",label);add(line,"strong",value);}
  const stage=(title,desc)=>{const section=add(generateCard,"section","");section.className="professional-packet-stage";add(section,"h3",title);add(section,"p",desc);return section;};
  const prepare=stage("Step 1 — Prepare and Submit Your Real Signed Packet","Verify saved client and case information, draw the applicant’s signature, and authorize private review. The signed two-page application is saved securely. This does not charge or file anything.");
  const contact=add(prepare,"fieldset","");contact.className="professional-packet-contact";add(contact,"legend","Verify contact and mailing details on both court forms");
  for(const [label,value] of [["Full legal name",client.full_name],["Mailing street address",client.line1],["Apartment / P.O. box (optional)",client.line2],["City",client.city],["State",client.state],["ZIP / postal code",client.zip],["Telephone number",client.phone],["Email address",client.email],["Court",actualCourt],["Case number",row.case_number]]){const line=add(contact,"div","");add(line,"strong",label);add(line,"span",value||"Not entered");}
  const contactLabel=add(prepare,"label",""),contactConfirmed=document.createElement("input");contactConfirmed.type="checkbox";contactLabel.append(contactConfirmed,document.createTextNode(" I reviewed the full legal name, mailing address, telephone, email, court and case number and confirm these details are correct."));
  const preview=stage("Step 2 — Preview Your Actual Application (View Only)","This preview shows the last submitted signed application. If contact or case details change, submit a new signed packet. Review both watermarked pages and confirm this exact document before checkout.");
  const payment=stage("Step 3 — Checkout After Independent Approval","Application preparation is included. Optional mailing and SMS/email case alerts cost $10 per filing plus applicable court fees and tax, after independent review and confirmation.");
  const delivery=add(payment,"fieldset","");delivery.className="professional-delivery-choice";add(delivery,"legend","Choose how your approved packet is fulfilled");
  function deliveryOption(value,label){const wrap=add(delivery,"label",""),input=document.createElement("input");input.type="radio";input.name="professional-delivery-"+row.id;input.value=value;wrap.append(input,document.createTextNode(" "+label));return input;}
  const mailChoice=deliveryOption("mail","Mail my approved application to the court where available. $10 mailing + SMS/email alerts, plus applicable court fee and tax.");mailChoice.checked=true;
  const digitalChoice=deliveryOption("digital","$0 approved digital PDF — I file and pay the court separately.");
  const mailArea=add(payment,"div",""),digitalArea=add(payment,"div","");digitalArea.hidden=true;
  const syncDelivery=()=>{mailArea.hidden=!mailChoice.checked;digitalArea.hidden=!digitalChoice.checked;};mailChoice.addEventListener("change",syncDelivery);digitalChoice.addEventListener("change",syncDelivery);
  const supported=row.court_id==="oh-wood-common-pleas"&&["conviction","dismissal","not_guilty"].includes(row.outcome);
  if(!supported||decision&&!["hold","approved_for_unsigned_draft"].includes(decision.decision)){
   add(prepare,"p","This court or outcome requires separate review before a supported packet can be prepared.");
   add(preview,"p","No signed preview is available yet.");add(payment,"p","Checkout is unavailable for this case.");delivery.disabled=true;
  }else{
   if(decision?.decision==="hold")add(prepare,"p","This case was held for review. Confirm the renewed complete case review below before submitting a signed application.");
   const reviewLabel=add(prepare,"label",""),caseReviewed=document.createElement("input");caseReviewed.type="checkbox";reviewLabel.append(caseReviewed,document.createTextNode(" I reviewed the complete docket, charge inventory, eligibility and filing requirements."));
   const approvedShape={case_id:row.id,org_id:org,attorney_id:row.attorney_id,decision:"approved_for_unsigned_draft",entire_case_reviewed:true};
   const confirmCaseReview=async()=>{
    if(!contactConfirmed.checked||!caseReviewed.checked)throw Error("Confirm the contact details and complete case review.");
    const current=ok(await api.from("professional_case_decisions").select("*").eq("case_id",row.id).eq("org_id",org).maybeSingle());
    if(current?.decision==="approved_for_unsigned_draft"&&current.entire_case_reviewed===true)return;
    if(current?.decision==="hold"){
     const session=ok(await api.auth.getSession()).session;if(!session?.access_token)throw Error("Session unavailable");
     const response=await fetch("/api/professional/case/"+encodeURIComponent(row.id)+"/resume-review",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({entire_case_reviewed:true}),cache:"no-store"});
     if(!response.ok||(await response.json()).decision!=="approved_for_unsigned_draft")throw Error("Renewed review not saved");
    }else if(!current){ok(await api.from("professional_case_decisions").insert({org_id:org,case_id:row.id,decision:"approved_for_unsigned_draft",entire_case_reviewed:true}));}
    else throw Error("This case requires separate review.");
   };
   card=mailArea;
   add(card,"p","Professional preparation: included. Court fee: "+(row.outcome==="conviction"?"$100":"$0 for qualifying nonconvictions")+". Choose included digital delivery or Pay and Mail when the court-specific route is available.");
   if(internalTestAccess){add(mailArea,"p","Internal test access: preview and confirm the packet without a subscription. Live Stripe and Lob mailing are disabled for this workspace.");const disabledPay=add(mailArea,"button","Pay and Mail");disabledPay.type="button";disabledPay.disabled=true;}
   if(["conviction","dismissal","not_guilty"].includes(row.outcome)&&row.court_id==="oh-wood-common-pleas"&&!internalTestAccess&&orgs.some(o=>o.id===org&&o.access_kind==="paid")){
    const courtFee=row.outcome==="conviction"?100:0;
    add(card,"h4","Optional Pay and Mail");
    add(card,"p","Preparation: included. Mailing + SMS/email case alerts: $10. Court filing deposit: $"+courtFee+". Total: $"+(courtFee+10)+" before applicable tax.");
    const mailStatus=add(card,"p","Checking private mailing status…");mailStatus.setAttribute("role","status");
    const consentLabel=add(card,"label","");const consent=document.createElement("input");consent.type="checkbox";consentLabel.append(consent,document.createTextNode(" I authorize mailing the independently approved signed application and agree to pay $"+(courtFee+10)+" plus applicable service tax, including $"+courtFee+" court deposit and $10 mailing and case alerts."));consentLabel.hidden=true;
    let checkoutReady=false;
    const pay=button(courtFee?"Pay and Mail — $110 + applicable tax":"Pay and Mail — $10 + applicable tax",async()=>{
     if(!checkoutReady){mailStatus.textContent="Checkout is not available yet. Complete the signed application preview and independent review, then check status again. No payment was taken.";return;}
     if(!consent.checked||!active||org!==orgId())throw Error("Consent required");
     const token=epoch,session=ok(await api.auth.getSession()).session;if(!session?.access_token||token!==epoch||!active||org!==orgId())throw Error("Session changed");
     const response=await fetch("/api/professional/mail/"+encodeURIComponent(row.id)+"/checkout",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"x-professional-mail-consent":"yes"},cache:"no-store"});
     const data=await response.json();if(!response.ok||!data.ok||token!==epoch||!active||org!==orgId()||new URL(data.url).origin!=="https://checkout.stripe.com")throw Error("Checkout unavailable");location.assign(data.url);
    });pay.hidden=false;
    const alertBox=add(card,"section","");alertBox.hidden=true;
    add(alertBox,"h4","SMS and email case alerts");
    add(alertBox,"p","Opt in separately to email and SMS alerts to your verified professional account contacts. Messages contain no client or case details. SMS frequency varies; message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is optional and can be withdrawn here.");
    const emailLabel=add(alertBox,"label",""),emailOpt=document.createElement("input");emailOpt.type="checkbox";emailLabel.append(emailOpt,document.createTextNode(" Email case updates"));
    const smsLabel=add(alertBox,"label",""),smsOpt=document.createElement("input");smsOpt.type="checkbox";smsLabel.append(smsOpt,document.createTextNode(" SMS case updates to my verified number"));
    const alertStatus=add(alertBox,"p","");alertStatus.setAttribute("role","status");
    const alertButton=add(alertBox,"button","Save alert preferences");alertButton.type="button";
    const alertUrl="/api/professional/mail/"+encodeURIComponent(row.id)+"/alerts";
    async function alertHeaders(){const session=ok(await api.auth.getSession()).session;if(!session?.access_token||!active||org!==orgId())throw Error("Session changed");return {Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"};}
    alertButton.addEventListener("click",async()=>{
     alertButton.disabled=true;
     try{
      const result=await fetch(alertUrl,{method:"POST",headers:await alertHeaders(),body:JSON.stringify({emailEnabled:emailOpt.checked&&!emailOpt.disabled,smsEnabled:smsOpt.checked&&!smsOpt.disabled,consentConfirmed:true}),cache:"no-store"});
      const data=await result.json();if(!result.ok||!data.ok)throw Error(data.error||"Preferences unavailable");
      alertStatus.textContent="Alert preferences saved. Delivery requires a verified payment.";
     }catch(error){alertStatus.textContent=error.message||"Unable to save preferences.";}finally{alertButton.disabled=false;}
    });
    async function loadAlertPreferences(){
     const response=await fetch(alertUrl,{headers:await alertHeaders(),cache:"no-store"});const data=await response.json();
     if(!response.ok||!data.ok)return;
     alertBox.hidden=false;emailOpt.disabled=!data.emailAvailable;smsOpt.disabled=!data.smsAvailable;emailOpt.checked=data.emailEnabled&&data.emailAvailable;smsOpt.checked=data.smsEnabled&&data.smsAvailable;
     if(!data.smsAvailable)alertStatus.textContent="SMS requires a verified, non-suppressed account phone number. Email can be enabled independently.";
    }
    const checkMailStatus=async()=>{try{
     const token=epoch,session=ok(await api.auth.getSession()).session;if(!session?.access_token||!active||org!==orgId()||token!==epoch)return;
     const response=await fetch("/api/professional/mail/"+encodeURIComponent(row.id),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
     const data=await response.json();if(!response.ok||!data.ok)throw Error("Unavailable");
     if(!active||org!==orgId()||token!==epoch)return;
     const labels={awaiting_independent_review:"Awaiting independent signed application review",approved:"Reviewed — mailing readiness check",paid_hold:"Payment verified — awaiting mailing",dispatch_claimed:"Mailing being reconciled — do not pay again",submitted_to_lob:"Accepted by Lob for processing — court filing not yet confirmed"};
     mailStatus.textContent=(labels[data.status]||"Mailing status unavailable")+((data.lobCheckId||data.lobLetterId)?" · Lob reference: "+(data.lobCheckId||data.lobLetterId):"")+(data.expectedDeliveryDate?" · Estimated delivery: "+data.expectedDeliveryDate:"");
     checkoutReady=data.checkoutReady===true;consentLabel.hidden=!checkoutReady;if(checkoutReady)mailStatus.textContent="Approved for secure mailing checkout";
     if(data.status!=="awaiting_independent_review")await loadAlertPreferences().catch(()=>{});
     if(Array.isArray(data.providerEvents))for(const e of data.providerEvents){if(e.name) add(mailStatus,"span"," · "+e.name+(e.time?" ("+e.time+")":""));}
    }catch{checkoutReady=false;consentLabel.hidden=true;mailStatus.textContent="Mailing status unavailable. Do not pay again.";}};
    button("Check review status",checkMailStatus);void checkMailStatus();
   }
   card=prepare;
   const currentDraft=async()=>{
    const [freshClient,freshCase,freshDecision]=await Promise.all([api.from("professional_clients").select("*").eq("id",client.id).eq("org_id",org).single(),api.from("professional_cases").select("*").eq("id",row.id).eq("org_id",org).single(),api.from("professional_case_decisions").select("*").eq("case_id",row.id).eq("org_id",org).single()]);
    return {client:ok(freshClient),caseRow:ok(freshCase),decision:ok(freshDecision),today:new Date().toISOString().slice(0,10),PDFLib:window.PDFLib};
   };
   const snapshotOf=(c,m,d,today)=>JSON.stringify(prepareProfessionalDraftData(c,m,d,today));
   let signatureInk=false;
   const draftStatus=add(prepare,"p","Draw the actual applicant signature below, then submit the signed packet.");draftStatus.setAttribute("role","status");
   add(prepare,"h4","Draw your signature below");
   add(prepare,"p","The applicant must personally draw their own signature. Do not sign for another person.");
   const canvas=document.createElement("canvas");canvas.className="professional-signature-pad";canvas.width=640;canvas.height=160;canvas.style.cssText="width:100%;max-width:640px;height:160px;border:1px solid #cfd9ea;background:#fff;border-radius:8px;touch-action:none";canvas.setAttribute("aria-label","Draw your actual applicant signature");prepare.append(canvas);
   const pen=canvas.getContext("2d");pen.strokeStyle="#142b49";pen.lineWidth=3;pen.lineCap="round";pen.lineJoin="round";let drawing=false,last=null;
   const point=e=>{const rect=canvas.getBoundingClientRect();return [(e.clientX-rect.left)*canvas.width/rect.width,(e.clientY-rect.top)*canvas.height/rect.height];};
   canvas.addEventListener("pointerdown",e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();drawing=true;last=point(e);canvas.setPointerCapture(e.pointerId);});
   canvas.addEventListener("pointermove",e=>{if(!drawing||!e.isPrimary)return;e.preventDefault();const next=point(e);if(Math.hypot(next[0]-last[0],next[1]-last[1])>0.5){pen.beginPath();pen.moveTo(...last);pen.lineTo(...next);pen.stroke();signatureInk=true;last=next;}});
   for(const event of ["pointerup","pointercancel","lostpointercapture"])canvas.addEventListener(event,()=>{drawing=false;last=null;});
   button("Use Drawn Signature",async()=>{if(!signatureInk){draftStatus.textContent="Draw the applicant signature first.";return;}draftStatus.textContent="Signature ready. Confirm the authorization and prepare the signed packet.";});
   button("Clear Pad",async()=>{pen.clearRect(0,0,canvas.width,canvas.height);signatureInk=false;});
   const signatureLabel=add(prepare,"label",""),signatureConsent=document.createElement("input");signatureConsent.type="checkbox";signatureLabel.append(signatureConsent,document.createTextNode(" I authorize RecordPathAI to place the signature personally drawn by the applicant on the court application and store the completed PDF privately for case review. This does not authorize a payment or court filing."));
   button("Prepare My Real Signed Packet for Private Review",async()=>{
    if(!signatureInk||!signatureConsent.checked||!contactConfirmed.checked||!caseReviewed.checked){draftStatus.textContent="Confirm the contact details and case review, draw the applicant signature and authorize private review.";throw Error("Signature and confirmation required");}
    const token=epoch,today=new Date().toISOString().slice(0,10),shownSnapshot=snapshotOf(client,row,approvedShape,today);
    await confirmCaseReview();
    const fresh=await currentDraft();
    if(snapshotOf(fresh.client,fresh.caseRow,fresh.decision,today)!==shownSnapshot)throw Error("Record details changed; reload and verify before signing.");
    const png=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!png)throw Error("Signature unavailable");
    const applicantSignature=new Uint8Array(await png.arrayBuffer());
    const bytes=await renderProfessionalDraft({...fresh,signatureReady:true,applicantSignature});
    if(!active||token!==epoch||org!==orgId()||!signatureConsent.checked||!signatureInk||!contactConfirmed.checked||!caseReviewed.checked)return;
    const session=ok(await api.auth.getSession()).session;if(!session?.access_token)throw Error("Session unavailable");
    const response=await fetch("/api/professional/signed-review",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/pdf","x-professional-case-id":row.id,"x-professional-signature-attested":"yes"},body:bytes,cache:"no-store"});
    const result=await response.json();if(!response.ok||result.ok!==true||!result.document?.id)throw Error(result.error||"Signed application not saved");
    pen.clearRect(0,0,canvas.width,canvas.height);signatureInk=false;packetCaseId=row.id;notice("Signed packet saved. Loading Step 2 preview.");await refresh();document.querySelector(".professional-packet-preview")?.scrollIntoView({block:"start"});
   });
   const external=add(prepare,"details","");add(external,"summary","Alternative: upload an externally signed application");card=external;
   add(card,"p","Upload the exact signed official two-page PDF. Watermarked review drafts are not accepted.");
   const file=document.createElement("input");file.type="file";file.accept="application/pdf";file.setAttribute("aria-label","Signed two-page official PDF");card.append(file);
   const label=add(card,"label","");const attested=document.createElement("input");attested.type="checkbox";label.append(attested,document.createTextNode(" I attest that the applicant signed this exact official application."));
   const auth=async()=>{const session=ok(await api.auth.getSession()).session;if(!session?.access_token)throw Error("Session unavailable");return {Authorization:"Bearer "+session.access_token};};
   add(card,"p","Attorney-only signing is held pending confirmation of the court’s local signature rules. Do not sign the applicant’s name.");
   button("Upload signed PDF",async()=>{
    const selected=file.files[0];if(!attested.checked||!selected||selected.size>2097152)throw Error("Signed PDF and attestation required");
    const token=epoch;await confirmCaseReview();const headers=await auth();if(!active||token!==epoch||org!==orgId())return;
    const response=await fetch("/api/professional/signed-review",{method:"POST",headers:{...headers,"Content-Type":"application/pdf","x-professional-case-id":row.id,"x-professional-signature-attested":"yes"},body:selected,cache:"no-store"});
    if(!response.ok)throw Error("Upload rejected");file.value="";packetCaseId=row.id;await refresh();
   });
   card=preview;preview.classList.add("professional-packet-preview");
   const rowDocs=documents.filter(x=>x.case_id===row.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,1);
   const rowReviews=signedReviews.filter(x=>x.case_id===row.id);
   if(!rowDocs.length)add(card,"p","Prepare your signed packet in Step 1. Both watermarked pages will appear here automatically.");
   for(const doc of rowDocs){
    add(card,"p",(doc.signature_mode==="counsel_assumption_staging"?"Counsel assumption — not filing-ready · ":"Applicant-signed · ")+"PDF SHA-256: "+doc.sha256+" · "+(rowReviews.some(r=>r.document_id===doc.id)?"Reviewed":"Awaiting exact-document review"));
    let downloaded=false;
    const previewPages=add(card,"div","");previewPages.className="professional-preview-pages";const previewStatus=add(card,"p","");previewStatus.setAttribute("role","status");
    const loadPreview=async()=>{
      const token=epoch,headers=await auth();downloaded=false;previewPages.replaceChildren();previewStatus.textContent="Loading both private watermarked pages…";
      try{
       for(const page of [1,2]){
        const response=await fetch("/api/professional/signed-review/"+encodeURIComponent(doc.id)+"/preview/"+page,{headers,cache:"no-store"});
        if(!response.ok)throw Error("Preview unavailable");const blob=await response.blob();
        if(!active||token!==epoch||org!==orgId())return;if(blob.type!=="image/png")throw Error("Unexpected preview");
        const url=URL.createObjectURL(blob);const img=document.createElement("img");img.alt="Watermarked signed application — page "+page;img.src=url;previewPages.append(img);try{await img.decode();}finally{URL.revokeObjectURL(url);}if(!active||token!==epoch||org!==orgId())return;
       }
       downloaded=true;previewStatus.textContent="Both pages loaded. Review the exact document.";
      }catch{previewPages.replaceChildren();previewStatus.textContent="Unable to load the signed application preview. Retry before confirming.";throw Error("Preview unavailable");}
    };
    button("Reload Signed Application Preview (View Only)",loadPreview);
    if(doc===rowDocs[0]){loadCurrentPreview=loadPreview;if(packetCaseId===row.id)void loadPreview().catch(()=>{});}
    if(!rowReviews.some(r=>r.document_id===doc.id)){
      const reviewLabel=add(card,"label","");const reviewed=document.createElement("input");reviewed.type="checkbox";reviewLabel.append(reviewed,document.createTextNode(" I inspected this exact signed PDF, confirmed the signature and information, and accept responsibility for any subsequent manual filing."));
      button("Confirm My Reviewed Pages Before Payment",async()=>{if(!reviewed.checked||!downloaded)throw Error("Open and review both pages first");ok(await api.from("professional_signed_reviews").insert({document_id:doc.id,org_id:org,case_id:row.id,exact_document_reviewed:true}));await refresh();});
    }
   }
   card=digitalArea;
   if(!rowDocs.some(d=>rowReviews.some(r=>r.document_id===d.id)))add(card,"p","Complete Step 1 and confirm both signed pages in Step 2 to download your included digital application.");
   for(const doc of rowDocs.filter(d=>rowReviews.some(r=>r.document_id===d.id))){button("Download Signed Application — $0",async()=>{const token=epoch,headers=await auth();const response=await fetch("/api/professional/signed-review/"+encodeURIComponent(doc.id),{headers,cache:"no-store"});if(!response.ok)throw Error("Download unavailable");const blob=await response.blob();if(!active||token!==epoch||org!==orgId())return;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="signed-application.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
   if(rowReviews.some(r=>rowDocs.some(d=>d.id===r.document_id&&d.signature_mode==="applicant_external"))){
    add(card,"h4","Manual filing instructions");
    add(card,"p","Mail the reviewed signed Address Verification and application to Wood County Clerk of Courts, One Courthouse Square, Bowling Green, OH 43402. Counsel must handle any required service or additional copies.");
    if(row.outcome==="conviction"){
     add(card,"p","Include the applicable $100 court deposit, payable to Wood County Clerk of Courts, with the case number on the check memo. Alternatively pay the court online and email the signed documents with the payment confirmation number to clerkofcourts@woodcountyohio.gov.");
     const pay=add(card,"a","Official court payment instructions");pay.href="https://clerkofcourt.co.wood.oh.us/166/Make-a-Payment";pay.target="_blank";pay.rel="noopener noreferrer";
    }else add(card,"p","Qualifying dismissal/not-guilty applications have no court fee. Do not include a court-fee check. No-fee email filing acceptance is unconfirmed; use the verified manual route.");
    add(card,"p","RecordPathAI does not submit the application or charge for manual filing. Confirm clerk acceptance on the official docket.");
   }
   card=add(payment,"details","");add(card,"summary","RecordWatch filing status and manual events");
   const event=document.createElement("select");event.setAttribute("aria-label","Manual status event");
   for(const [v,t] of [["manual_filing_reported","Filing reported by attorney"],["manual_hearing_reported","Hearing reported by attorney"],["manual_order_reported","Order reported by attorney"],["manual_followup","Follow-up"]])if(v==="manual_followup"||rowReviews.some(r=>rowDocs.some(d=>d.id===r.document_id&&d.signature_mode==="applicant_external")))event.append(option(v,t));
   const date=document.createElement("input");date.type="date";date.setAttribute("aria-label","Event date");date.value=new Date().toISOString().slice(0,10);card.append(event,date);
   button("Save manual event",async()=>{if(!date.value)throw Error("Date required");ok(await api.from("professional_case_events").insert({org_id:org,case_id:row.id,event_type:event.value,event_date:date.value}));await refresh();});
   for(const e of events.filter(x=>x.case_id===row.id))add(card,"p",e.event_date+" — "+e.event_type.replaceAll("_"," "));
  }

  const back=add(packetPanel.body,"button","Save & return to RecordWatch");back.type="button";back.className="btn secondary";back.addEventListener("click",returnDashboard);
  $("cases").append(shell);if(packetCaseId===row.id){shell.classList.add("packet-focused");packetPanel.d.open=true;setStep(3);}
 }
 notice(internalTestAccess?"Internal testing workspace — no paid subscription. Use fictional client records only; live mailing is unavailable.":"Professional workspace loaded. Manual filing, case reminders and verified-event tracking; no automated court filing.");
}
function bindForm(id,table,build){
 $(id).addEventListener("submit",async e=>{
 e.preventDefault();if(!active||routeStep!==1||routeClient)return;const form=e.currentTarget,btn=form.querySelector("button");btn.disabled=true;
 try{const org=orgId(),seq=epoch,values=Object.fromEntries(new FormData(form));const payload=build(values,org);const saved=ok(await api.from(table).insert(payload).select("*").single());if(!saved?.id)throw Error("Save not confirmed");const persisted=ok(await api.from(table).select("*").eq("id",saved.id).eq("org_id",org).single());if(!persisted||persisted.id!==saved.id||(table==="professional_cases"&&persisted.court_id!=="oh-wood-common-pleas")||Object.entries(payload).some(([key,value])=>persisted[key]!==value))throw Error("Supabase readback mismatch");if(!active||org!==orgId()||seq!==epoch)return;form.reset();navigateWorkflow(2,{clientId:saved.id});}catch{notice("Unable to save. Confirm required fields and authorization.");}finally{btn.disabled=false;}
 });
}
bindForm("client-form","professional_clients",(v,org)=>({org_id:org,full_name:v.full_name,dob:v.dob,other_names:v.other_names||"",line1:v.line1,line2:v.line2||"",city:v.city,state:v.state,zip:v.zip,email:v.email,phone:v.phone,authorization_confirmed:v.authorization_confirmed==="on"}));
$("case-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!active||routeStep!==2||!routeClient||!sharedIntake)return;
 const btn=$("case-save");btn.disabled=true;
 try{
  const org=orgId(),seq=epoch,snapshot=sharedIntake.capture(),client=routeClient.id;
  const payload=buildProfessionalRecordPayload(snapshot,org,client);
  const saved=ok(await api.from("professional_cases").insert(payload).select("id").single());
  if(!saved?.id)throw Error("Case save not confirmed");
  const persisted=ok(await api.from("professional_cases").select("*").eq("id",saved.id).eq("org_id",org).single());
  if(!persisted||persisted.id!==saved.id||persisted.client_id!==client||persisted.case_number!==payload.case_number||!sameRecordSnapshot(snapshot,persisted.record_details))throw Error("Supabase full record readback mismatch");
  if(!active||org!==orgId()||seq!==epoch)return;
  $("case-form").reset();sharedIntake.reset();navigateWorkflow(3,{caseId:persisted.id});
 }catch(error){notice(error?.message?.startsWith("Enter")?error.message:"Unable to save and verify full record details. Check the court, dates and required fields.");}
 finally{btn.disabled=false;}
});
$("new-client").addEventListener("click",()=>showIntake("client-intake"));
$("add-client-top").addEventListener("click",()=>showIntake("client-intake"));
$("return-dashboard").addEventListener("click",returnDashboard);
$("new-case").addEventListener("click",()=>navigateWorkflow(2,{clientId:caseFilter()||null}));
$("close-client").addEventListener("click",returnDashboard);$("close-case").addEventListener("click",returnDashboard);
$("org").addEventListener("change",()=>{if(routeStep){navigateWorkflow(1);return;}hideIntake();packetCaseId=null;setStep(0);$("client-form").reset();$("case-form").reset();sharedIntake?.reset();refresh().catch(fail);});
$("refresh").addEventListener("click",()=>refresh().catch(fail));
$("client-filter").addEventListener("change",()=>{packetCaseId=null;setStep(0);refresh().catch(fail);});
$("case-filter").addEventListener("change",()=>{packetCaseId=null;setStep(0);refresh().catch(fail);});
$("logout").addEventListener("click",async()=>{clear();try{await api.auth.signOut();}finally{location.reload();}});
window.addEventListener("pagehide",clear);
try{await load();if(api)api.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"||event==="USER_DELETED"){clear();notice("Session ended.");$("login").hidden=false;$("logout").hidden=true;}});}catch{fail();}
