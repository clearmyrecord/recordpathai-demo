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
async function refresh(){
 if(!active)return;
 const seq=++epoch,org=orgId();
 $("clients").replaceChildren();$("cases").replaceChildren();
 const [a,b,c,d]=await Promise.all(["professional_clients","professional_cases","professional_case_decisions","professional_case_events"].map(t=>api.from(t).select("*").eq("org_id",org).order("created_at",{ascending:false}).limit(100)));
 if(seq!==epoch||!active||org!==orgId())return;
 const clients=ok(a),cases=ok(b),decisions=ok(c),events=ok(d);
 for(const client of clients)$("clients").append(option(client.id,client.full_name));
 $("role").textContent="Verified attorney · assigned records only";
 for(const row of cases){
  const client=clients.find(x=>x.id===row.client_id);if(!client)continue;
  const card=document.createElement("article");add(card,"h3",client.full_name+" — "+row.case_number);
  add(card,"p",row.outcome+" · "+row.charge_name+" · "+row.charge_code+" · "+row.charge_level+" · disposition "+row.disposition_date+(row.final_discharge_date?" · discharge "+row.final_discharge_date:""));
  add(card,"p","Mailing: "+[client.line1,client.line2,client.city,client.state,client.zip].filter(Boolean).join(", ")+" · "+client.email+" · "+client.phone);
  const decision=decisions.find(x=>x.case_id===row.id);
  add(card,"p",decision?"Review: "+decision.decision.replaceAll("_"," "):"Awaiting attorney review");
  const button=(label,fn)=>{const btn=add(card,"button",label);btn.type="button";btn.addEventListener("click",async()=>{if(!active||org!==orgId())return;btn.disabled=true;try{await fn();}catch{notice("Action rejected. Check saved information and access.");}finally{btn.disabled=false;}});return btn;};
  if(!decision){
   const label=add(card,"label","");const checked=document.createElement("input");checked.type="checkbox";label.append(checked,document.createTextNode(" I reviewed the complete docket, charge inventory, eligibility and filing requirements."));
   const decide=async value=>{if(!checked.checked)throw Error("Review required");ok(await api.from("professional_case_decisions").insert({org_id:org,case_id:row.id,decision:value,entire_case_reviewed:true}));await refresh();};
   button("Hold for review",()=>decide("hold"));
   if(row.outcome!=="mixed")button("Approve unsigned draft",()=>decide("approved_for_unsigned_draft"));
  }else if(decision.decision==="approved_for_unsigned_draft"){
   button("Download unsigned review draft",async()=>{
    const token=epoch;
    const [freshClient,freshCase,freshDecision]=await Promise.all([api.from("professional_clients").select("*").eq("id",client.id).single(),api.from("professional_cases").select("*").eq("id",row.id).single(),api.from("professional_case_decisions").select("*").eq("case_id",row.id).single()]);
    const bytes=await renderProfessionalDraft({client:ok(freshClient),caseRow:ok(freshCase),decision:ok(freshDecision),today:new Date().toISOString().slice(0,10),PDFLib:window.PDFLib});
    if(!active||token!==epoch||org!==orgId())return;
    const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));const a=document.createElement("a");a.href=url;a.download="wood-county-unsigned-review-draft.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   });
   const event=document.createElement("select");event.setAttribute("aria-label","Manual status event");
   for(const [v,t] of [["manual_filing_reported","Filing reported by attorney"],["manual_hearing_reported","Hearing reported by attorney"],["manual_order_reported","Order reported by attorney"],["manual_followup","Follow-up"]])event.append(option(v,t));
   const date=document.createElement("input");date.type="date";date.setAttribute("aria-label","Event date");date.value=new Date().toISOString().slice(0,10);card.append(event,date);
   button("Save manual event",async()=>{if(!date.value)throw Error("Date required");ok(await api.from("professional_case_events").insert({org_id:org,case_id:row.id,event_type:event.value,event_date:date.value}));await refresh();});
   for(const e of events.filter(x=>x.case_id===row.id))add(card,"p",e.event_date+" — "+e.event_type.replaceAll("_"," "));
  }
  $("cases").append(card);
 }
 notice("Staging workspace loaded. No payments, actual filings or live court monitoring.");
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
