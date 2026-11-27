import {bowlingGreenResource} from "./bowling-green-municipal-resource.js";
const $=id=>document.getElementById(id);
try{
 const response=await fetch("data/bowling-green-municipal-resources.json",{credentials:"omit",cache:"no-store"});
 if(!response.ok)throw new Error("Registry unavailable");
 const profile=await response.json();
 const update=()=>{
  const result=bowlingGreenResource(profile,{courtId:profile.courtId,relief:$("relief").value,outcome:$("outcome").value});
  $("result").hidden=!result||!result.officialForm;
  $("notice").textContent=!result||!$("outcome").value?"Select relief and final outcome.":!result.officialForm?"Acquittal, mixed or unknown outcomes require manual review of the correct form and fee with the clerk.":"Official blank form located. This is not an eligibility or filing approval.";
  if(!result?.officialForm)return;
  $("fee").textContent=result.feeClerkConfirmed?"Published conviction court fee: $100 (nonrefundable)":"Expected qualifying dismissal court fee: $0 — confirm with clerk";
  $("total").textContent="Illustrative future total: $"+result.illustrativeTotalCents/100+" ($50 optional preparation; not available for purchase here).";
  $("review").textContent=result.dismissalAffidavitClarificationRequired?"Ask how the conviction-worded affidavit should be handled for dismissed cases. Do not make any false sworn statement.":"Verify eligibility, notarization, service, and local procedures. Fee waivers may apply.";
  $("form").href=result.officialForm;
 };
 $("relief").addEventListener("change",update);$("outcome").addEventListener("change",update);update();
}catch{$("notice").textContent="Unable to load the selector. Use the official forms index below or contact the clerk.";}
