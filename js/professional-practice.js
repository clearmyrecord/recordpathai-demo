import {renderProfessionalDraft} from "./professional-wood-draft.js";
import {mountProfessionalRecordIntake,buildProfessionalRecordPayload,sameRecordSnapshot} from "./professional-record-intake.js";
let sharedIntake=null;
const $=id=>document.getElementById(id), notice=t=>$("notice").textContent=t;
const production="pfyxjhdlqgpzzzdssqpk.supabase.co";
let api,orgs=[],epoch=0,active=false,renewal=null,packetCaseId=null,internalTestAccess=false;
const caseFilter=()=>$("client-filter").value;
const setStep=n=>{$("professional-steps").hidden=!n;for(const [i,id] of ["step-personal","step-record","step-packet"].entries()){if(i+1===n)$(id).setAttribute("aria-current","step");else $(id).removeAttribute("aria-current");}};
const hideIntake=()=>{for(const id of ["client-intake","case-intake"])$(id).hidden=true;};
const returnDashboard=()=>{$("client-form").reset();$("case-form").reset();sharedIntake?.reset();hideIntake();packetCaseId=null;setStep(0);$("case-filter").value="";$("client-filter").value="";refresh().catch(fail);$("saved-clients").scrollIntoView({block:"start"});};
const showIntake=id=>{if(!active)return;if(id==="client-intake")$("client-form").reset();else{const selected=$("clients").value;$("case-form").reset();sharedIntake?.reset();if(selected)$("clients").value=selected;}hideIntake();packetCaseId=null;setStep(id==="client-intake"?1:2);$(id).hidden=false;$(id).scrollIntoView({block:"start"});};
const clear=()=>{hideIntake();packetCaseId=null;setStep(0);$("client-list").replaceChildren();for(const id of ["client-count","case-count","packet-count","watch-count"])$(id).textContent="0";if(renewal)clearInterval(renewal);renewal=null;epoch++;active=false;internalTestAccess=false;$("app").hidden=true;$("client-form").reset();$("case-form").reset();$("recordDetailsForm").replaceChildren();sharedIntake=null;$("clients").replaceChildren();$("cases").replaceChildren();$("org").replaceChildren();$("client-filter").replaceChildren(option("","All clients"));$("case-filter").value="";$("case-summary").textContent="";orgs=[];};
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
 sharedIntake=await mountProfessionalRecordIntake($("recordDetailsForm"));if(seq!==epoch)return;
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
 $("clients").replaceChildren();$("cases").replaceChildren();$("client-list").replaceChildren();
 const [a,b,c,d,docs,reviewRows,counselRows,enrollRows,taskRows,verifiedRows,observedRows,generatedRows]=await Promise.all([...["professional_clients","professional_cases","professional_case_decisions","professional_case_events"].map(t=>api.from(t).select("*").eq("org_id",org).order("created_at",{ascending:false}).limit(100)),api.from("professional_signed_documents").select("id,org_id,case_id,attorney_id,sha256,page_count,created_at,signature_mode,counsel_name,counsel_bar_number").eq("org_id",org).order("created_at",{ascending:false}).limit(100),api.from("professional_signed_reviews").select("*").eq("org_id",org).limit(100),api.from("professional_counsel_profiles").select("*").eq("org_id",org).limit(1),api.from("professional_watch_enrollments").select("*").eq("org_id",org).limit(100),api.from("professional_watch_tasks").select("*").eq("org_id",org).order("due_date").limit(500),api.from("professional_verified_court_events").select("id,case_id,event_type,occurred_on,evidence_url,verified_at").eq("org_id",org).order("occurred_on",{ascending:false}).limit(500),api.from("professional_watch_observations").select("*").limit(100),api.from("professional_generated_packets").select("id,case_id,kind,sha256,page_count,created_at").eq("org_id",org).order("created_at",{ascending:false}).limit(500)]);
 if(seq!==epoch||!active||org!==orgId())return;
 const clients=ok(a),cases=ok(b),decisions=ok(c),events=ok(d),documents=ok(docs),signedReviews=ok(reviewRows),counsel=ok(counselRows)[0],enrollments=ok(enrollRows),tasks=ok(taskRows),verified=ok(verifiedRows),observations=ok(observedRows),generated=ok(generatedRows);
 $("client-filter").replaceChildren(option("","All clients"));
 for(const client of clients){$("clients").append(option(client.id,client.full_name));$("client-filter").append(option(client.id,client.full_name));}
 if(clients.some(c=>c.id===selectedClient))$("clients").value=selectedClient;
 if(clients.some(c=>c.id===selectedFilter))$("client-filter").value=selectedFilter;
 if(!clients.length)add($("client-list"),"p","No saved clients yet. Add a client to start the three-step application.");
 for(const client of clients){const card=add($("client-list"),"article","");card.className="saved-case-card";add(card,"h3",client.full_name).className="saved-case-title";const own=cases.filter(c=>c.client_id===client.id);add(card,"p",own.length+" saved case"+(own.length===1?"":"s")+(own.length?"":" · Ready for Step 2 — Record Details"));const actions=add(card,"div","");actions.className="saved-case-actions";const view=add(actions,"button",own.length?"View client cases":"Continue to Record Details");view.type="button";view.className="btn";view.addEventListener("click",()=>{if(!active||seq!==epoch||org!==orgId())return;if(!own.length){$("clients").value=client.id;showIntake("case-intake");}else{hideIntake();packetCaseId=null;setStep(0);$("client-filter").value=client.id;$("case-filter").value="";refresh().catch(fail);$("saved-cases").scrollIntoView({block:"start"});}});if(own.length){const next=add(actions,"button","Add case");next.type="button";next.className="btn secondary";next.addEventListener("click",()=>{if(!active||seq!==epoch||org!==orgId())return;$("clients").value=client.id;showIntake("case-intake");});}}
 const visible=cases.filter(c=>(!caseFilter()||c.client_id===caseFilter())&&c.case_number.toLowerCase().includes($("case-filter").value.trim().toLowerCase()));
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
  const openPanel=panel=>{hideIntake();packetCaseId=panel===packetPanel?row.id:null;setStep(panel===packetPanel?3:0);for(const p of [reviewPanel,watchPanel,packetPanel])p.d.open=p===panel;panel.d.scrollIntoView({block:"nearest"});};
  const nav=(label,p,primary=false)=>{const b=add(actions,"button",label);b.type="button";b.className=primary?"btn":"btn secondary";b.addEventListener("click",()=>{if(active&&org===orgId())openPanel(p)});};
  nav("Resume",packetStatus==="Not generated"||packetStatus==="Reviewed"?packetPanel:watchPanel,true);nav("Record Details",reviewPanel);nav("Open Packet",packetPanel);nav("Open RecordWatch",watchPanel);
  add(card,"p",row.outcome+" · "+row.charge_name+" · "+row.charge_code+" · "+row.charge_level+" · disposition "+row.disposition_date+(row.final_discharge_date?" · discharge "+row.final_discharge_date:""));
  add(card,"p","Mailing: "+[client.line1,client.line2,client.city,client.state,client.zip].filter(Boolean).join(", ")+" · "+client.email+" · "+client.phone);
  if(row.record_details?.schemaVersion===1){const detail=document.createElement("details");add(detail,"summary","View all saved Step 2 fields");card.append(detail);const renderValues=(parent,obj)=>{for(const [key,val] of Object.entries(obj||{})){const line=add(parent,"p","");add(line,"strong",key.replace(/([a-z])([A-Z])/g,"$1 $2").replaceAll("_"," ") + ": ");line.append(document.createTextNode(val===true?"Yes":val===false?"No":String(val||"Not entered")));}};renderValues(detail,detailFields);for(const [i,charge] of row.record_details.charges.entries()){add(detail,"h4","Charge "+(i+1));renderValues(detail,charge);}}
  if(row.outcome==="mixed")add(card,"p","Eligibility and filing review required: unsupported court, multiple charges, incomplete or unresolved record information. All entered details are saved.");
  else if(window.RecordPathEligibilityEngine?.resolveEligibilityForCase){
   const disposition={dismissal:"dismissed",not_guilty:"not guilty",conviction:"convicted"}[row.outcome]||"";
   const result=window.RecordPathEligibilityEngine.resolveEligibilityForCase({id:row.id,court:{caseState:"OH",county:"Wood",courtName:"Wood County Court of Common Pleas",caseNumber:row.case_number},charges:[{chargeName:row.charge_name,statuteCode:row.charge_code,chargeLevel:row.charge_level,disposition,dispositionDate:row.disposition_date,finalDischargeDate:row.final_discharge_date||"",probationCompletedDate:row.probation_end_date||""}],outcome:{outcome:disposition,dispositionDate:row.disposition_date,finalDischargeDate:row.final_discharge_date||""}});
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

  card=packetPanel.body;
  add(card,"h4","Step 3 — Prepare and review your application");
  add(card,"p","Client: "+client.full_name+" · Case: "+row.case_number+" · Eligibility: "+eligibilityBadge.textContent+" · Estimated date: "+estimated.textContent);
  add(card,"p","RecordPathAI packet preparation: $0 — included with professional access. Applicable court fees are separate: "+(row.outcome==="conviction"?"$100 for a qualifying conviction":row.outcome==="mixed"?"Requires review":"$0 for qualifying dismissal or not-guilty cases")+".");
  if(!decision){
   const label=add(card,"label","");const checked=document.createElement("input");checked.type="checkbox";label.append(checked,document.createTextNode(" I reviewed the complete docket, charge inventory, eligibility and filing requirements."));
   const decide=async value=>{if(!checked.checked)throw Error("Review required");ok(await api.from("professional_case_decisions").insert({org_id:org,case_id:row.id,decision:value,entire_case_reviewed:true}));await refresh();};
   button("Hold for review",()=>decide("hold"));
   if(row.outcome!=="mixed")button("Approve unsigned draft",()=>decide("approved_for_unsigned_draft"));
  }else if(decision.decision==="approved_for_unsigned_draft"){
   card=packetPanel.body;
   add(card,"p","Professional preparation: included. Court fee: "+(row.outcome==="conviction"?"$100":"$0 for qualifying nonconvictions")+". File directly with the court; no payment collected here.");
   if(row.outcome==="conviction"&&!internalTestAccess&&orgs.some(o=>o.id===org&&o.access_kind==="paid")){
    add(card,"h4","Optional Pay and Mail");
    add(card,"p","RecordPathAI mailing: $10 · court filing deposit: $100 · combined $110 before applicable tax. No $50 preparation fee.");
    const mailStatus=add(card,"p","Checking private mailing status…");mailStatus.setAttribute("role","status");
    const consentLabel=add(card,"label","");const consent=document.createElement("input");consent.type="checkbox";consentLabel.append(consent,document.createTextNode(" I authorize mailing the independently approved signed application and $100 court deposit, and agree to pay the $10 mailing fee plus applicable tax."));consentLabel.hidden=true;
    const pay=button("Pay and Mail — $110 + applicable tax",async()=>{
     if(!consent.checked||!active||org!==orgId())throw Error("Consent required");
     const token=epoch,session=ok(await api.auth.getSession()).session;if(!session?.access_token||token!==epoch||!active||org!==orgId())throw Error("Session changed");
     const response=await fetch("/api/professional/mail/"+encodeURIComponent(row.id)+"/checkout",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"x-professional-mail-consent":"yes"},cache:"no-store"});
     const data=await response.json();if(!response.ok||!data.ok||token!==epoch||!active||org!==orgId()||new URL(data.url).origin!=="https://checkout.stripe.com")throw Error("Checkout unavailable");location.assign(data.url);
    });pay.hidden=true;
    void (async()=>{try{
     const token=epoch,session=ok(await api.auth.getSession()).session;if(!session?.access_token||!active||org!==orgId()||token!==epoch)return;
     const response=await fetch("/api/professional/mail/"+encodeURIComponent(row.id),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
     const data=await response.json();if(!response.ok||!data.ok)throw Error("Unavailable");
     if(!active||org!==orgId()||token!==epoch)return;
     const labels={awaiting_independent_review:"Awaiting independent signed application review",approved:"Reviewed — mailing readiness check",paid_hold:"Payment verified — awaiting mailing",dispatch_claimed:"Mailing being reconciled — do not pay again",submitted_to_lob:"Accepted by Lob for processing — court filing not yet confirmed"};
     mailStatus.textContent=(labels[data.status]||"Mailing status unavailable")+(data.lobCheckId?" · Lob reference: "+data.lobCheckId:"")+(data.expectedDeliveryDate?" · Estimated delivery: "+data.expectedDeliveryDate:"");
     if(data.checkoutReady===true){consentLabel.hidden=false;pay.hidden=false;mailStatus.textContent="Approved for secure mailing checkout";}
     if(Array.isArray(data.providerEvents))for(const e of data.providerEvents){if(e.name) add(mailStatus,"span"," · "+e.name+(e.time?" ("+e.time+")":""));}
    }catch{mailStatus.textContent="Mailing status unavailable. Do not pay again."}})();
   }
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
    const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));const a=document.createElement("a");a.href=url;a.download="wood-county-official-unsigned-application.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    await refresh();notice("Unsigned application downloaded and saved in RecordWatch. Obtain the applicant signature before filing.");
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
  if(!decision||decision.decision!=="approved_for_unsigned_draft")add(packetPanel.body,"p","Complete eligibility review and approve the draft before preparing a packet.");
  const back=add(packetPanel.body,"button","Save & return to RecordWatch");back.type="button";back.className="btn secondary";back.addEventListener("click",returnDashboard);
  $("cases").append(shell);if(packetCaseId===row.id){packetPanel.d.open=true;setStep(3);}
 }
 notice(internalTestAccess?"Internal testing workspace — no paid subscription. Use fictional client records only; live mailing is unavailable.":"Professional workspace loaded. Manual filing, case reminders and verified-event tracking; no automated court filing.");
}
function bindForm(id,table,build){
 $(id).addEventListener("submit",async e=>{
 e.preventDefault();if(!active)return;const form=e.currentTarget,btn=form.querySelector("button");btn.disabled=true;
 try{const org=orgId(),seq=epoch,values=Object.fromEntries(new FormData(form));const payload=build(values,org);const saved=ok(await api.from(table).insert(payload).select("*").single());if(!saved?.id)throw Error("Save not confirmed");const persisted=ok(await api.from(table).select("*").eq("id",saved.id).eq("org_id",org).single());if(!persisted||persisted.id!==saved.id||(table==="professional_cases"&&persisted.court_id!=="oh-wood-common-pleas")||Object.entries(payload).some(([key,value])=>persisted[key]!==value))throw Error("Supabase readback mismatch");if(!active||org!==orgId()||seq!==epoch)return;form.reset();await refresh();if(!active||org!==orgId())return;if(table==="professional_clients"){ $("clients").value=saved.id;showIntake("case-intake");notice("Client saved. Continue to record details."); }else{hideIntake();packetCaseId=saved.id;setStep(3);$("case-filter").value=persisted.case_number;$("client-filter").value=persisted.client_id;await refresh();if(!active||org!==orgId()||packetCaseId!==saved.id)return;const target=Array.from($("cases").children).find(el=>el.dataset.caseId===saved.id);if(target)target.scrollIntoView({block:"start"});notice("Case saved. Step 3 — Packet is ready for eligibility review and preparation.");}}catch{notice("Unable to save. Confirm required fields and authorization.");}finally{btn.disabled=false;}
 });
}
bindForm("client-form","professional_clients",(v,org)=>({org_id:org,full_name:v.full_name,dob:v.dob,line1:v.line1,line2:v.line2||"",city:v.city,state:v.state,zip:v.zip,email:v.email,phone:v.phone,authorization_confirmed:v.authorization_confirmed==="on"}));
$("case-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!active||!sharedIntake)return;
 const btn=$("case-save");btn.disabled=true;
 try{
  const org=orgId(),seq=epoch,snapshot=sharedIntake.capture(),client=$("clients").value;
  const payload=buildProfessionalRecordPayload(snapshot,org,client);
  const saved=ok(await api.from("professional_cases").insert(payload).select("id").single());
  if(!saved?.id)throw Error("Case save not confirmed");
  const persisted=ok(await api.from("professional_cases").select("*").eq("id",saved.id).eq("org_id",org).single());
  if(!persisted||persisted.id!==saved.id||persisted.client_id!==client||!sameRecordSnapshot(snapshot,persisted.record_details))throw Error("Supabase full record readback mismatch");
  if(!active||org!==orgId()||seq!==epoch)return;
  $("case-form").reset();sharedIntake.reset();hideIntake();packetCaseId=persisted.id;setStep(3);$("case-filter").value=persisted.case_number;$("client-filter").value=persisted.client_id;
  await refresh();if(!active||org!==orgId()||packetCaseId!==persisted.id)return;
  const target=Array.from($("cases").children).find(el=>el.dataset.caseId===persisted.id);if(target)target.scrollIntoView({block:"start"});
  notice(persisted.outcome==="mixed"?"All record details saved to Supabase. Packet held for further review.":"All record details saved and verified in Supabase. Continue to Step 3 — Packet.");
 }catch(error){notice(error?.message?.startsWith("Enter")?error.message:"Unable to save and verify full record details. Check the court, dates and required fields.");}
 finally{btn.disabled=false;}
});
$("new-client").addEventListener("click",()=>showIntake("client-intake"));
$("add-client-top").addEventListener("click",()=>showIntake("client-intake"));
$("return-dashboard").addEventListener("click",returnDashboard);
$("new-case").addEventListener("click",()=>showIntake($("clients").options.length?"case-intake":"client-intake"));
$("close-client").addEventListener("click",returnDashboard);$("close-case").addEventListener("click",returnDashboard);
$("org").addEventListener("change",()=>{hideIntake();packetCaseId=null;setStep(0);$("client-form").reset();$("case-form").reset();sharedIntake?.reset();refresh().catch(fail);});
$("refresh").addEventListener("click",()=>refresh().catch(fail));
$("client-filter").addEventListener("change",()=>{packetCaseId=null;setStep(0);refresh().catch(fail);});
$("case-filter").addEventListener("change",()=>{packetCaseId=null;setStep(0);refresh().catch(fail);});
$("logout").addEventListener("click",async()=>{clear();try{await api.auth.signOut();}finally{location.reload();}});
window.addEventListener("pagehide",clear);
try{await load();if(api)api.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"||event==="USER_DELETED"){clear();notice("Session ended.");$("login").hidden=false;$("logout").hidden=true;}});}catch{fail();}
