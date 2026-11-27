// Staging-only. No real client inputs or payment/filing controls.
(async()=>{
"use strict";
const $=id=>document.getElementById(id);
const show=(message)=>{$("notice").textContent=message;};
const clear=()=>{$("workspace").hidden=true;$("matters").replaceChildren();$("org").replaceChildren();};
const stagingHost="ckrqmlnckhagskpumjbh.supabase.co";
let client, memberships=[],orgs=[],epoch=0;
function ok(r){if(r.error)throw new Error("Workspace request failed.");return r.data;}
function fail(){epoch++;clear();show("Workspace unavailable. Sign in with an approved staging account and verified multi-factor session.");}
async function load(){
 const token=++epoch;
 clear();
 const config=await window.RecordPathSupabase.getConfig();
 if(new URL(config.url).hostname!==stagingHost){show("This workspace is restricted to the staging database. Production access has not been enabled.");return;}
 client=await window.RecordPathSupabase.getClient();
 const user=await client.auth.getUser();
 if(token!==epoch)return;
 if(user.error||!user.data.user){$("sign-in").hidden=false;show("Sign in to your approved staging account.");return;}
 $("sign-in").hidden=true;$("sign-out").hidden=false;
 const aal=ok(await client.auth.mfa.getAuthenticatorAssuranceLevel());
 if(aal.currentLevel!=="aal2"){show("Multi-factor verification is required. Contact the pilot operator for approved enrollment and sign-in instructions.");return;}
 const [o,m]=await Promise.all([client.from("professional_pilot_orgs").select("id,pilot_code,ends_at"),client.from("professional_pilot_members").select("org_id,role,attorney_verified")]);
 if(token!==epoch)return;
 orgs=ok(o);memberships=ok(m);
 if(!orgs.length){show("No active professional pilot membership. Contact RecordPathAI for access.");return;}
 for(const org of orgs){const option=document.createElement("option");option.value=org.id;option.textContent=org.pilot_code;$("org").appendChild(option);}
 $("workspace").hidden=false;await refresh();
}
async function refresh(){
 const token=++epoch;
 const orgId=$("org").value;
 $("matters").replaceChildren();
 const member=memberships.find(m=>m.org_id===orgId),org=orgs.find(o=>o.id===orgId);
 if(!member||!org){fail();return;}
 const [c,r]=await Promise.all([client.from("professional_pilot_matters").select("id,scenario,created_at").eq("org_id",orgId).order("created_at",{ascending:false}).limit(100),client.from("professional_pilot_reviews").select("matter_id,decision").eq("org_id",orgId).limit(1000)]);
 if(token!==epoch||$("org").value!==orgId)return;
 const cases=ok(c),reviews=ok(r);
 $("pilot-status").textContent="Role: "+member.role+" · Pilot ends "+new Date(org.ends_at).toLocaleDateString();
 for(const item of cases){
  const node=document.createElement("article"),title=document.createElement("strong"),details=document.createElement("p");
  title.textContent="DEMO-"+item.id.slice(0,8).toUpperCase()+" · "+item.scenario;
  const review=reviews.find(x=>x.matter_id===item.id);
  details.textContent=review?"Mock review: "+review.decision.replaceAll("_"," "):item.scenario==="mixed"?"Manual review only · no automatic form or fee":"Awaiting review · illustrative court fee: "+(item.scenario==="conviction"?"$100":"$0");
  node.append(title,details);
  if(!review&&member.role==="attorney"&&member.attorney_verified){
   const button=document.createElement("button");button.textContent=item.scenario==="mixed"?"Record manual-review hold":"Record fictional review";button.addEventListener("click",async()=>{
    button.disabled=true;
    try{ok(await client.from("professional_pilot_reviews").insert({org_id:orgId,matter_id:item.id,decision:item.scenario==="mixed"?"needs_review":"mock_review_complete"}));await refresh();}catch{fail();}
   });node.append(button);
  }
  $("matters").append(node);
 }
 show(cases.length?"Staging workspace loaded. No live actions enabled.":"No fictional matters yet. Create a test matter.");
}
$("org").addEventListener("change",()=>refresh().catch(fail));
$("refresh").addEventListener("click",()=>refresh().catch(fail));
$("create").addEventListener("click",async()=>{
 $("create").disabled=true;
 try{ok(await client.from("professional_pilot_matters").insert({org_id:$("org").value,scenario:$("scenario").value}));await refresh();}catch{fail();}finally{$("create").disabled=false;}
});
$("sign-out").addEventListener("click",async()=>{epoch++;clear();try{await client.auth.signOut();}finally{location.reload();}});
try{await load();}catch{fail();}
})();