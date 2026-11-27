// Actual professional verification requests. No case data, payment or dispatch.
(async()=>{
"use strict";
const $=id=>document.getElementById(id);
const say=t=>$("status").textContent=t;
const ok=r=>{if(r.error)throw Error("Request failed");return r.data;};
let api,user,factorId,epoch=0,confirmedAccountId=null;
const mode=new URLSearchParams(location.search);
const pilot=mode.get("pilot")==="1",secure=mode.get("secure")==="1";
const preferredPlan=["solo","firm"].includes(mode.get("plan"))?mode.get("plan"):"solo";
function clearMfaSetup(){ $("mfa-qr").removeAttribute("src");$("mfa-qr").hidden=true;$("mfa-setup-details").hidden=true;$("secret").textContent="";$("secret").hidden=true; }
function showMfaSetup(totp){
 clearMfaSetup();
 const qr=String(totp?.qr_code||"");
 // Render locally as an image; never inject SVG markup or transmit the setup key to a QR service.
 if(qr.startsWith("data:image/svg+xml,")||qr.startsWith("data:image/svg+xml;utf-8,")||qr.startsWith("data:image/svg+xml;base64,"))$("mfa-qr").src=qr;
 else if(/^\s*<svg[\s>]/i.test(qr))$("mfa-qr").src="data:image/svg+xml,"+encodeURIComponent(qr);
 if($("mfa-qr").hasAttribute("src"))$("mfa-qr").hidden=false;
 $("secret").textContent=String(totp?.secret||"");$("secret").hidden=false;$("mfa-setup-details").hidden=false;
 if($("mfa-qr").hidden)$("mfa-setup-details").querySelector("details").open=true;
 $("mfa-code-heading").textContent="Step 2 — Enter your six-digit code";
}
$("mfa-qr").addEventListener("error",()=>{$("mfa-qr").hidden=true;$("mfa-setup-details").querySelector("details").open=true;});
function clear(){epoch++;factorId=null;user=null;confirmedAccountId=null;$("confirmed-account-email").textContent="";clearMfaSetup();$("mfa-start").hidden=true;$("mfa-back").hidden=true;$("mfa-error").hidden=true;$("mfa-error").textContent="";$("mfa-code-heading").textContent="Enter your six-digit code";for(const id of ["signed-out","confirm-account","mfa","request","submitted","logout","secret","verify-form","practice-link","live-billing","billing-checkout","billing-portal","billing-refresh","billing-consent-label","plan-choice","pilot-link"])$(id).hidden=true;$("secret").textContent="";$("request-form").reset();$("verify-form").reset();$("application-state").textContent="";$("billing-state").textContent="";$("billing-consent").checked=false;}
async function load(){
 clear();const token=epoch;
 const config=await window.RecordPathSupabase.getConfig();
 if(new URL(config.url).origin!=="https://pfyxjhdlqgpzzzdssqpk.supabase.co"){say("Professional account registration is restricted to the production account service.");return;}
 api=await window.RecordPathSupabase.getClient();
 const result=await api.auth.getUser();
 if(token!==epoch)return;
 if(result.error||!result.data.user){const target="professional-account.html"+location.search;for(const a of $("signed-out").querySelectorAll("a")){const base=a.getAttribute("href").split("?")[0];a.href=base+"?returnUrl="+encodeURIComponent(target);}$("signed-out").hidden=false;say("Sign in or create your regular RecordPathAI account.");return;}
 user=result.data.user;$("logout").hidden=false;
 if(!user.email_confirmed_at){say("Confirm your account email before subscribing. No payment can be collected until your email is verified.");return;}
 if(pilot){
  if(!await ensureMfa(token))return;
  const row=ok(await api.from("professional_access_requests").select("status,created_at,plan").eq("user_id",user.id).maybeSingle());
  if(token!==epoch)return;
  if(row&&["legal_aid","university"].includes(row.plan)){
   $("submitted").hidden=false;$("application-state").textContent="Organization pilot: "+row.status;$("practice-link").hidden=row.status!=="approved";$("practice-link").href="professional-practice.html";say("Your pilot application is saved.");
  }else if(!row){$("request").hidden=false;say("Apply for the complimentary organization pilot.");}
  else say("You have an older professional application. For paid access, return to the Professional account page.");
  return;
 }
 $("confirmed-account-email").textContent=user.email||"Verified RecordPathAI account";
 say("Step 1 — Confirm the account for your professional subscription.");
 $("confirm-account").hidden=false;
 if(secure){await refreshBilling(token);}

}
async function ensureMfa(token){
 const assurance=ok(await api.auth.mfa.getAuthenticatorAssuranceLevel());
 if(token!==epoch)return false;
 if(assurance.currentLevel!=="aal2"){
  $("mfa").hidden=false;const factors=ok(await api.auth.mfa.listFactors());if(token!==epoch)return false;
  const existing=factors.totp?.find(f=>f.status==="verified");
  if(existing){factorId=existing.id;$("mfa-start").hidden=true;$("setup").hidden=true;$("verify-form").hidden=false;say("Open your authenticator app and enter the current six-digit RecordPathAI code.");}
  else{$("mfa-start").hidden=false;$("setup").hidden=false;say("Follow the three steps below to set up two-step verification.");}
  return false;
 }
 return true;
}

async function liveRequest(action,consent=false){
 const session=ok(await api.auth.getSession()).session;if(!user?.id||!user.email_confirmed_at||!session?.access_token||session.user?.id!==user.id)throw Error("Verified account session required");
 if(action==="checkout"&&confirmedAccountId!==user.id)throw Error("Confirm your account first");
 const r=await fetch("/api/professional/live-billing/"+action,{method:"POST",headers:{Authorization:"Bearer "+session.access_token,...(consent?{"x-professional-live-consent":"yes","x-professional-plan":$("paid-plan").value,"x-professional-terms":"accepted-v1","x-professional-account-id":confirmedAccountId||""}:{})},cache:"no-store"});
 const data=await r.json();if(!r.ok||!data.ok||data.mode!=="live")throw Error("Billing unavailable");return data;
}
async function refreshBilling(token=epoch){
 $("billing-checkout").hidden=true;$("billing-portal").hidden=true;$("billing-consent-label").hidden=true;$("practice-link").hidden=true;$("plan-choice").hidden=true;
 try{
  const data=await liveRequest("refresh");if(token!==epoch)return;
  if(confirmedAccountId!==user.id&&!data.subscription_exists){$("submitted").hidden=true;$("confirm-account").hidden=false;return;}
  $("confirm-account").hidden=true;$("submitted").hidden=false;$("live-billing").hidden=false;$("billing-refresh").hidden=false;$("pilot-link").hidden=false;
  if(data.unregistered){$("paid-plan").value=preferredPlan;$("billing-state").textContent="Your verified account is ready. Choose a monthly subscription. No attorney credentials or manual approval required.";$("plan-choice").hidden=false;$("billing-checkout").hidden=false;$("billing-consent-label").hidden=false;return;}
  $("paid-plan").value=data.plan;
  $("billing-state").textContent=(data.plan==="solo"?"Individual":"Firm")+" · $"+(data.amount_cents/100).toFixed(2)+"/month plus applicable tax · "+(data.active?"Subscription verified":data.subscription_exists?"Existing subscription requires attention":"Ready to subscribe");
  $("billing-checkout").hidden=data.subscription_exists;$("billing-consent-label").hidden=data.subscription_exists;$("billing-portal").hidden=!data.subscription_exists;
  if(data.active){
   $("practice-link").hidden=false;$("practice-link").href="professional-account.html?secure=1";$("practice-link").textContent="Open RecordWatch";
   if(secure){$("submitted").hidden=true;$("pilot-link").hidden=true;if(await ensureMfa(token)&&token===epoch)location.replace("professional-practice.html");}
  }
 }catch{if(token===epoch)$("billing-state").textContent="Subscription verification unavailable. Contact professional support or refresh.";}
}
$("confirm-account-continue").addEventListener("click",()=>action($("confirm-account-continue"),async()=>{const token=epoch,fresh=ok(await api.auth.getUser()).user;if(token!==epoch||!fresh?.id||!fresh.email_confirmed_at||fresh.id!==user?.id)throw Error("Verified account required");confirmedAccountId=fresh.id;$("confirm-account").hidden=true;$("submitted").hidden=false;$("live-billing").hidden=false;$("billing-refresh").hidden=false;$("pilot-link").hidden=false;say("Signed in as "+fresh.email+". Subscription will be linked to this account.");await refreshBilling(token);}));
$("switch-account").addEventListener("click",()=>action($("switch-account"),async()=>{const target="professional-account.html"+location.search;ok(await api.auth.signOut());clear();location.assign("signup.html?returnUrl="+encodeURIComponent(target));}));
$("billing-refresh").addEventListener("click",()=>action($("billing-refresh"),()=>refreshBilling()));
$("billing-checkout").addEventListener("click",()=>action($("billing-checkout"),async()=>{
 if(!$("billing-consent").checked)throw Error("Recurring payment consent required");
 const token=epoch,data=await liveRequest("checkout",true);if(token!==epoch)return;
 if(new URL(data.url).origin!=="https://checkout.stripe.com")throw Error("Unexpected checkout");location.assign(data.url);
}));
$("billing-portal").addEventListener("click",()=>action($("billing-portal"),async()=>{
 const token=epoch,data=await liveRequest("portal",true);if(token!==epoch)return;
 if(new URL(data.url).origin!=="https://billing.stripe.com")throw Error("Unexpected billing portal");location.assign(data.url);
}));
async function action(button,fn){button.disabled=true;try{await fn();}catch{say("Unable to complete this step. Check your session or code, then try again.");}finally{button.disabled=false;}}
$("setup").addEventListener("click",()=>action($("setup"),async()=>{
 if(!user||!api)return;const token=epoch;
 const factors=ok(await api.auth.mfa.listFactors());
 if(factors.totp?.some(f=>f.status==="verified")){await load();return;}
 const data=ok(await api.auth.mfa.enroll({factorType:"totp",friendlyName:"RecordPathAI Professional "+Date.now(),issuer:"RecordPathAI"}));
 if(token!==epoch)return;factorId=data.id;showMfaSetup(data.totp);$("mfa-start").hidden=true;$("verify-form").hidden=true;$("setup").hidden=true;$("mfa-code-heading").textContent="3. Enter your six-digit code";say("Add RecordPathAI in your authenticator app before continuing.");
}));
$("mfa-continue").addEventListener("click",()=>{if(!user||!factorId)return;$("mfa-setup-details").hidden=true;$("verify-form").hidden=false;$("mfa-back").hidden=false;$("mfa-error").hidden=true;say("Enter the six-digit number shown in your app, not the long setup key.");$("verify-form").elements.code.focus();});
$("mfa-back").addEventListener("click",()=>{if(!user||!factorId)return;$("verify-form").reset();$("verify-form").hidden=true;$("mfa-error").hidden=true;$("mfa-setup-details").hidden=false;say("Add RecordPathAI to your authenticator app.");});
$("verify-form").addEventListener("submit",e=>{e.preventDefault();action(e.currentTarget.querySelector("button"),async()=>{
 if(!factorId||!user)return;const code=String(new FormData($("verify-form")).get("code")||"");if(!/^\d{6}$/.test(code))throw Error("Invalid code");
 $("mfa-error").hidden=true;try{const challenge=ok(await api.auth.mfa.challenge({factorId}));ok(await api.auth.mfa.verify({factorId,challengeId:challenge.id,code}));}catch{$("mfa-error").textContent="That code could not be verified. Make sure you are using the current six-digit code for RecordPathAI Professional, then try again. If it is about to change, wait for a fresh code.";$("mfa-error").hidden=false;return;}clearMfaSetup();await load();
});});
$("request-form").addEventListener("submit",e=>{e.preventDefault();action(e.currentTarget.querySelector("button"),async()=>{
 if(!user||!api)return;const v=Object.fromEntries(new FormData($("request-form")));if(v.verification_consent!=="on")throw Error("Consent required");
 ok(await api.from("professional_access_requests").insert({full_name:v.full_name.trim(),ohio_bar_number:v.ohio_bar_number,organization_name:v.organization_name.trim(),plan:v.plan,professional_contact:v.professional_contact.trim(),verification_consent:true}));await load();
});});
$("logout").addEventListener("click",async()=>{clear();try{await api.auth.signOut();}finally{location.reload();}});
window.addEventListener("pagehide",clear);
try{await load();if(api)api.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"||event==="USER_DELETED"){clear();$("signed-out").hidden=false;say("Session ended.");}});}catch{clear();say("Professional account service unavailable. Please contact support.");}
})();
