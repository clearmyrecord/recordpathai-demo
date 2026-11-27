import {renderProfessionalDraft} from "./professional-wood-draft.js";
const $=id=>document.getElementById(id), notice=t=>$("notice").textContent=t;
const staging="ckrqmlnckhagskpumjbh.supabase.co";
let api,orgs=[],epoch=0,active=false;
const clear=()=>{epoch++;active=false;$("app").hidden=true;$("client-form").reset();$("case-form").reset();$("clients").replaceChildren();$("cases").replaceChildren();$("org").replaceChildren();orgs=[];};
const fail=()=>{clear();notice("Access or request unavailable. No filing or payment was made. Reload or contact the pilot operator.");};
const ok=r=>{if(r.error)throw Error("Request rejected");return r.data;};
const orgId=()=>$("org").value;
const option=(value,label)=>{const o=document.createElement("option");o.value=value;o.textContent=label;return o;};
const add=(el,tag,text)=>{const n=document.createElement(tag);n.textContent=text;el.append(n);return n;};
async function load(){
 clear();const seq=epoch;
 const config=await window.RecordPathSupabase.getConfig();
 if(new URL(config.url).hostname!==staging){notice("Staging only. Client intake is disabled in production.");return;}
 api=await window.RecordPathSupabase.getClient();
 const user=await api.auth.getUser();
 if(seq!==epoch)return;
 if(user.error||!user.data.user){$("login").hidden=false;notice("Sign in to an approved staging account.");return;}
 $("login").hidden=true;$("logout").hidden=false;
 if(ok(await api.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel!=="aal2"){notice("Verified MFA session required.");return;}
 const [o,m]=await Promise.all([api.from("professional_pilot_orgs").select("id,pilot_code,client_intake_enabled"),api.from("professional_pilot_members").select("org_id,role,attorney_verified")]);
 if(seq!==epoch)return;
 const members=ok(m);orgs=ok(o).filter(x=>x.client_intake_enabled&&members.some(y=>y.org_id===x.id&&y.role==="attorney"&&y.attorney_verified));
 if(!orgs.length){notice("No approved attorney intake access. The operator must enable a staging test organization.");return;}
 for(const org of orgs)$("org").append(option(org.id,org.pilot_code));
 active=true;$("app").hidden=false;await refresh();
}
async function renderBilling(org,seq){
 const panel=$("professional-billing");if(!panel)return;panel.replaceChildren();
 add(panel,"p","Approved legal aid/university pilot: $0 for 90 days; court fees and actual postage separate. Paid plans include unlimited preparation and RecordWatch. Optional automated filing is $10 plus applicable court fees. Sandbox only; no live charge or entitlement.");
 try{
  const session=ok(await api.auth.getSession()).session;if(!session?.access_token)return;
  const headers={Authorization:"Bearer "+session.access_token};
  const response=await fetch("/api/professional/billing/status?org_id="+encodeURIComponent(org),{headers,cache:"no-store"});
  if(!active||epoch!==seq||org!==orgId())return;
  if(!response.ok){add(panel,"p","Sandbox billing is not configured for this organization.");return;}
  const data=await response.json();if(!data.ok||data.mode!=="sandbox")return;
  add(panel,"p",data.plan+" · $"+(data.amount_cents/100).toFixed(2)+"/month (test only) · "+data.subscription_status);
  for(const [label,action] of [[data.test_active?"Manage test subscription":"Start test subscription",data.test_active?"portal":"checkout"]]){
   const btn=add(panel,"button",label);btn.type="button";btn.addEventListener("click",async()=>{if(!active||epoch!==seq||org!==orgId())return;btn.disabled=true;
    try{if(!window.confirm("Continue to Stripe test mode? No real card or payment should be used."))return;
     const r=await fetch("/api/professional/billing/"+action+"?org_id="+encodeURIComponent(org),{method:"POST",headers:{...headers,"x-professional-sandbox-consent":"yes"},cache:"no-store"});
     const result=await r.json();if(!r.ok||result.mode!=="sandbox"||!["https://checkout.stripe.com","https://billing.stripe.com"].includes(new URL(result.url).origin))throw Error("Unavailable");
     location.assign(result.url);
    }catch{notice("Test billing is unavailable.");}finally{btn.disabled=false;}
   });
  }
 }catch{if(active&&epoch===seq)add(panel,"p","Sandbox billing verification unavailable.");}
}
async function refresh(){
 if(!active)return;
 const seq=++epoch,org=orgId();
 $("clients").replaceChildren();$("cases").replaceChildren();
 const [a,b,c,d,docs,reviewRows,counselRows,watchRows,observationRows]=await Promise.all([...["professional_clients","professional_cases","professional_case_decisions","professional_case_events"].map(t=>api.from(t).select("*").eq("org_id",org).order("created_at",{ascending:false}).limit(100)),api.from("professional_signed_documents").select("id,org_id,case_id,attorney_id,sha256,page_count,created_at,signature_mode,counsel_name,counsel_bar_number").eq("org_id",org).order("created_at",{ascending:false}).limit(100),api.from("professional_signed_reviews").select("*").eq("org_id",org).limit(100),api.from("professional_counsel_profiles").select("*").eq("org_id",org).limit(1),api.from("professional_watch_enrollments").select("*").eq("org_id",org).limit(100),api.from("professional_watch_observations").select("case_id,checked_at,source_as_of,status,source_updated_at,source_changed").limit(100)]);
 if(seq!==epoch||!active||org!==orgId())return;
 const clients=ok(a),cases=ok(b),decisions=ok(c),events=ok(d),documents=ok(docs),signedReviews=ok(reviewRows),counsel=ok(counselRows)[0],watch=ok(watchRows),observations=ok(observationRows);
 for(const client of clients)$("clients").append(option(client.id,client.full_name));
 $("role").textContent="Verified attorney · assigned records only";
 void renderBilling(org,seq);
 for(const row of cases){
  const client=clients.find(x=>x.id===row.client_id);if(!client)continue;
  const card=document.createElement("article");add(card,"h3",client.full_name+" — "+row.case_number);
  add(card,"p",row.outcome+" · "+row.charge_name+" · "+row.charge_code+" · "+row.charge_level+" · disposition "+row.disposition_date+(row.final_discharge_date?" · discharge "+row.final_discharge_date:""));
  add(card,"p","Mailing: "+[client.line1,client.line2,client.city,client.state,client.zip].filter(Boolean).join(", ")+" · "+client.email+" · "+client.phone);
  const decision=decisions.find(x=>x.case_id===row.id);
  add(card,"p",decision?"Review: "+decision.decision.replaceAll("_"," "):"Awaiting attorney review");
  const button=(label,fn)=>{const btn=add(card,"button",label);btn.type="button";btn.addEventListener("click",async()=>{if(!active||org!==orgId())return;btn.disabled=true;try{await fn();}catch{notice("Action rejected. Check saved information and access.");}finally{btn.disabled=false;}});return btn;};
  add(card,"h4","RecordWatch — authorized source monitoring");
  const enrollment=watch.find(x=>x.case_id===row.id),obs=observations.find(x=>x.case_id===row.id);
  if(enrollment?.enabled){add(card,"p",obs?({no_approved_feed:"No approved court import yet",no_verified_match:"No verified match in latest approved import",ambiguous_match:"Ambiguous source match — attorney review needed",verified_source_match:"Verified source match available — check docket directly"}[obs.status]||"Awaiting review")+" · checked "+obs.checked_at+(obs.source_as_of?" · source as of "+obs.source_as_of:"")+(obs.source_changed?" · newer source record detected":""):"Enrolled. Awaiting first source check.");
   button("Pause source monitoring",async()=>{ok(await api.from("professional_watch_enrollments").update({enabled:false}).eq("case_id",row.id));await refresh();});
  }else{
   const lab=add(card,"label","");const consent=document.createElement("input");consent.type="checkbox";lab.append(consent,document.createTextNode(" I have client authorization for private source monitoring."));
   button("Enable source monitoring",async()=>{if(!consent.checked)throw Error("Consent required");if(enrollment){ok(await api.from("professional_watch_enrollments").update({enabled:true}).eq("case_id",row.id));}else{ok(await api.from("professional_watch_enrollments").insert({org_id:org,case_id:row.id,consent_confirmed:true}));}await refresh();});
  }
  add(card,"p","Import-based checks are not a live docket or court ruling. Missing records never establish sealing or eligibility.");
  if(!decision){
   const label=add(card,"label","");const checked=document.createElement("input");checked.type="checkbox";label.append(checked,document.createTextNode(" I reviewed the complete docket, charge inventory, eligibility and filing requirements."));
   const decide=async value=>{if(!checked.checked)throw Error("Review required");ok(await api.from("professional_case_decisions").insert({org_id:org,case_id:row.id,decision:value,entire_case_reviewed:true}));await refresh();};
   button("Hold for review",()=>decide("hold"));
   if(row.outcome!=="mixed")button("Approve unsigned draft",()=>decide("approved_for_unsigned_draft"));
  }else if(decision.decision==="approved_for_unsigned_draft"){
   add(card,"p","Professional preparation: included. Self-filing: no additional software fee. Optional automated filing: $10 plus applicable court fees (paid subscriber).");
   const quoteLine=add(card,"p","Court cost when filed: "+(row.outcome==="conviction"?"$100":"$0")+" · no filing or payment available in staging.");
   button("Verify subscriber filing quote",async()=>{
    const token=epoch,session=ok(await api.auth.getSession()).session;if(!session?.access_token)throw Error("Session required");
    const response=await fetch("/api/professional/billing/filing-quote?org_id="+encodeURIComponent(org)+"&case_id="+encodeURIComponent(row.id)+"&delivery=automated",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
    const q=await response.json();if(!active||token!==epoch||org!==orgId())return;
    if(!response.ok||!q.ok||q.mode!=="sandbox"){quoteLine.textContent="Verified active test subscription required for a paid-subscriber quote. Approved pilot court costs and actual postage are separate.";return;}
    quoteLine.textContent="Verified sandbox quote: preparation $0; automated filing $"+(q.serviceFeeCents/100).toFixed(2)+"; court $"+(q.courtFeeCents/100).toFixed(2)+"; total $"+(q.totalCents/100).toFixed(2)+". Quote only — no charge or dispatch.";
   });

   button("Download unsigned review draft",async()=>{
    const token=epoch;
    const [freshClient,freshCase,freshDecision]=await Promise.all([api.from("professional_clients").select("*").eq("id",client.id).single(),api.from("professional_cases").select("*").eq("id",row.id).single(),api.from("professional_case_decisions").select("*").eq("case_id",row.id).single()]);
    const bytes=await renderProfessionalDraft({client:ok(freshClient),caseRow:ok(freshCase),decision:ok(freshDecision),today:new Date().toISOString().slice(0,10),PDFLib:window.PDFLib});
    if(!active||token!==epoch||org!==orgId())return;
    const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));const a=document.createElement("a");a.href=url;a.download="wood-county-unsigned-review-draft.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   });
   add(card,"h4","Signed document review");
   add(card,"p","Obtain the actual applicant signature on the official form outside this staging tool. Upload only fictional test documents; unsigned review drafts cannot be submitted.");
   const file=document.createElement("input");file.type="file";file.accept="application/pdf";file.setAttribute("aria-label","Signed two-page official test PDF");card.append(file);
   const label=add(card,"label","");const attested=document.createElement("input");attested.type="checkbox";label.append(attested,document.createTextNode(" I attest that the applicant signed this exact official application."));
   const auth=async()=>{const session=ok(await api.auth.getSession()).session;if(!session?.access_token)throw Error("Session unavailable");return {Authorization:"Bearer "+session.access_token};};
   add(card,"h4","Sign as attorney of record");
   if(counsel){
    add(card,"p",counsel.full_name+" · Ohio registration "+counsel.ohio_bar_number+" · "+counsel.firm_name);
    add(card,"p","Staging assumption: counsel may sign in their own capacity. Local court acceptance is not yet verified; the signed test PDF is marked DO NOT FILE.");
    const typed=document.createElement("input");typed.setAttribute("aria-label","Type your own full attorney name to sign");typed.placeholder="Type your full attorney name";typed.autocomplete="off";card.append(typed);
    const lab=add(card,"label","");const consent=document.createElement("input");consent.type="checkbox";lab.append(consent,document.createTextNode(" I am the verified counsel of record, have authorization to act for this client, reviewed the draft, and intend to sign in my own name for this test."));
    button("Sign as counsel and save private test PDF",async()=>{
     if(!consent.checked||typed.value!==counsel.full_name)throw Error("Explicit counsel consent required");
     const token=epoch;
     const [fc,fm,fd,fp]=await Promise.all([api.from("professional_clients").select("*").eq("id",client.id).single(),api.from("professional_cases").select("*").eq("id",row.id).single(),api.from("professional_case_decisions").select("*").eq("case_id",row.id).single(),api.from("professional_counsel_profiles").select("*").eq("org_id",org).single()]);
     const bytes=await renderProfessionalDraft({client:ok(fc),caseRow:ok(fm),decision:ok(fd),today:new Date().toISOString().slice(0,10),PDFLib:window.PDFLib,counsel:ok(fp),typedSignature:typed.value});
     const headers=await auth();if(!active||token!==epoch||org!==orgId()||!consent.checked) return;
     const response=await fetch("/api/professional/signed-review",{method:"POST",headers:{...headers,"Content-Type":"application/pdf","x-professional-case-id":row.id,"x-professional-signature-attested":"yes","x-professional-signature-mode":"counsel_assumption_staging","x-professional-counsel-consent":"yes"},body:bytes,cache:"no-store"});
     if(!response.ok)throw Error("Counsel signature rejected");typed.value="";await refresh();
    });
   }else add(card,"p","Operator verification of counsel name and Ohio registration is required before signing.");
   button("Upload signed test PDF",async()=>{
    const selected=file.files[0];if(!attested.checked||!selected||selected.size>2097152)throw Error("Signed PDF and attestation required");
    const token=epoch;const headers=await auth();if(!active||token!==epoch||org!==orgId())return;
    const response=await fetch("/api/professional/signed-review",{method:"POST",headers:{...headers,"Content-Type":"application/pdf","x-professional-case-id":row.id,"x-professional-signature-attested":"yes"},body:selected,cache:"no-store"});
    if(!response.ok)throw Error("Upload rejected");file.value="";await refresh();
   });
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
   const event=document.createElement("select");event.setAttribute("aria-label","Manual status event");
   for(const [v,t] of [["manual_filing_reported","Filing reported by attorney"],["manual_hearing_reported","Hearing reported by attorney"],["manual_order_reported","Order reported by attorney"],["manual_followup","Follow-up"]])if(v==="manual_followup"||rowReviews.some(r=>rowDocs.some(d=>d.id===r.document_id&&d.signature_mode==="applicant_external")))event.append(option(v,t));
   const date=document.createElement("input");date.type="date";date.setAttribute("aria-label","Event date");date.value=new Date().toISOString().slice(0,10);card.append(event,date);
   button("Save manual event",async()=>{if(!date.value)throw Error("Date required");ok(await api.from("professional_case_events").insert({org_id:org,case_id:row.id,event_type:event.value,event_date:date.value}));await refresh();});
   for(const e of events.filter(x=>x.case_id===row.id))add(card,"p",e.event_date+" — "+e.event_type.replaceAll("_"," "));
  }
  $("cases").append(card);
 }
 notice("Staging workspace loaded. No live payments or actual filings. Monitoring uses approved imports only.");
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
$("logout").addEventListener("click",async()=>{clear();try{await api.auth.signOut();}finally{location.reload();}});
window.addEventListener("pagehide",clear);
try{await load();if(api)api.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"||event==="USER_DELETED"){clear();notice("Session ended.");$("login").hidden=false;$("logout").hidden=true;}});}catch{fail();}
