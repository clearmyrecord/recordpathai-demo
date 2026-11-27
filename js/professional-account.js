// Actual professional verification requests. No case data, payment or dispatch.
(async()=>{
"use strict";
const $=id=>document.getElementById(id);
const say=t=>$("status").textContent=t;
const ok=r=>{if(r.error)throw Error("Request failed");return r.data;};
let api,user,factorId,epoch=0;
function clear(){epoch++;factorId=null;user=null;for(const id of ["signed-out","mfa","request","submitted","logout","secret","verify-form"])$(id).hidden=true;$("secret").textContent="";$("request-form").reset();$("verify-form").reset();$("application-state").textContent="";}
async function load(){
 clear();const token=epoch;
 const config=await window.RecordPathSupabase.getConfig();
 if(new URL(config.url).origin!=="https://pfyxjhdlqgpzzzdssqpk.supabase.co"){say("Professional account registration is restricted to the production account service.");return;}
 api=await window.RecordPathSupabase.getClient();
 const result=await api.auth.getUser();
 if(token!==epoch)return;
 if(result.error||!result.data.user){$("signed-out").hidden=false;say("Sign in to apply for professional access.");return;}
 user=result.data.user;$("logout").hidden=false;
 if(!user.email_confirmed_at){say("Confirm your account email before applying.");return;}
 const assurance=ok(await api.auth.mfa.getAuthenticatorAssuranceLevel());
 if(token!==epoch)return;
 if(assurance.currentLevel!=="aal2"){
  $("mfa").hidden=false;const factors=ok(await api.auth.mfa.listFactors());if(token!==epoch)return;
  const existing=factors.totp?.find(f=>f.status==="verified");
  if(existing){factorId=existing.id;$("setup").hidden=true;$("verify-form").hidden=false;say("Enter the code from your enrolled authenticator.");}
  else{$("setup").hidden=false;say("Set up your authenticator before applying.");}
  return;
 }
 const row=ok(await api.from("professional_access_requests").select("status,created_at,plan").eq("user_id",user.id).maybeSingle());
 if(token!==epoch)return;
 if(row){$("submitted").hidden=false;$("application-state").textContent="Status: "+row.status+" · Requested plan: "+row.plan.replaceAll("_"," ")+" · Submitted "+new Date(row.created_at).toLocaleDateString();say("Your professional application is saved in the account service.");}
 else{$("request").hidden=false;say("Identity session verified. Complete your professional verification request.");}
}
async function action(button,fn){button.disabled=true;try{await fn();}catch{say("Unable to complete this step. Check your session or code, then try again.");}finally{button.disabled=false;}}
$("setup").addEventListener("click",()=>action($("setup"),async()=>{
 if(!user||!api)return;const token=epoch;
 const factors=ok(await api.auth.mfa.listFactors());
 if(factors.totp?.some(f=>f.status==="verified")){await load();return;}
 const data=ok(await api.auth.mfa.enroll({factorType:"totp",friendlyName:"RecordPathAI Professional "+Date.now()}));
 if(token!==epoch)return;factorId=data.id;$("secret").textContent="Add a time-based account manually in your authenticator using this secret: "+data.totp.secret;$("secret").hidden=false;$("verify-form").hidden=false;$("setup").hidden=true;say("Add the secret, then enter the six-digit code.");
}));
$("verify-form").addEventListener("submit",e=>{e.preventDefault();action(e.currentTarget.querySelector("button"),async()=>{
 if(!factorId||!user)return;const code=String(new FormData($("verify-form")).get("code")||"");if(!/^\d{6}$/.test(code))throw Error("Invalid code");
 const challenge=ok(await api.auth.mfa.challenge({factorId}));ok(await api.auth.mfa.verify({factorId,challengeId:challenge.id,code}));$("secret").textContent="";await load();
});});
$("request-form").addEventListener("submit",e=>{e.preventDefault();action(e.currentTarget.querySelector("button"),async()=>{
 if(!user||!api)return;const v=Object.fromEntries(new FormData($("request-form")));if(v.verification_consent!=="on")throw Error("Consent required");
 ok(await api.from("professional_access_requests").insert({full_name:v.full_name.trim(),ohio_bar_number:v.ohio_bar_number,organization_name:v.organization_name.trim(),plan:v.plan,professional_contact:v.professional_contact.trim(),verification_consent:true}));await load();
});});
$("logout").addEventListener("click",async()=>{clear();try{await api.auth.signOut();}finally{location.reload();}});
window.addEventListener("pagehide",clear);
try{await load();if(api)api.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"||event==="USER_DELETED"){clear();$("signed-out").hidden=false;say("Session ended.");}});}catch{clear();say("Professional account service unavailable. Please contact support.");}
})();
