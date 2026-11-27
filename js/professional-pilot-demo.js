// Fictional cases only: no API, persistence, personal data or live filing.
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const scenarios=Object.freeze({
 dismissal:{routing:"Nonconviction form (illustrative)",fee:"$0 for qualifying dismissal-only filing",blocked:false},
 conviction:{routing:"Conviction form (illustrative)",fee:"$100 standard Wood County deposit; waivers may apply",blocked:false},
 mixed:{routing:"Manual legal review required; no automatic template selection",fee:"Undetermined",blocked:true}
});
let stage=0;
const render=()=>{
 const s=scenarios[$("scenario").value];
 $("routing").textContent=s.routing;
 $("fee").textContent=s.fee;
 $("status").textContent=["Awaiting simulated attorney review",s.blocked?"Manual review required — mock preparation blocked":"Review simulated","Mock checklist prepared","Mock final review recorded — no filing"][stage];
 $("review").disabled=stage!==0;
 $("prepare").disabled=stage!==1||s.blocked;
 $("approve").disabled=stage!==2||s.blocked;
 $("checklist").textContent=stage>=2?"Mock checklist: verify disposition, dates, case scope, official form version, required signatures and applicable filing fees. No actual document generated.":"";
};
const reset=()=>{stage=0;render();};
$("scenario").addEventListener("change",reset);
$("reset").addEventListener("click",reset);
$("review").addEventListener("click",()=>{if(stage===0){stage=1;render();}});
$("prepare").addEventListener("click",()=>{if(stage===1&&!scenarios[$("scenario").value].blocked){stage=2;render();}});
$("approve").addEventListener("click",()=>{if(stage===2&&!scenarios[$("scenario").value].blocked){stage=3;render();}});
render();
})();