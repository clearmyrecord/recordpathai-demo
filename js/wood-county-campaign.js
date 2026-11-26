/* Public landing only. No cookies, identifiers, case facts, or third-party pixels. */
(()=>{
  const allowed=new Set(["google","social","library","court","probation","reentry","workforce","bgsu","legal-aid","staffing","local-media","community","poster"]);
  const param=new URLSearchParams(location.search).get("src");
  const channel=allowed.has(param)?param:"direct";
  const report=(event)=>{
    fetch("/api/marketing/wood-county/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,event}),credentials:"omit",referrerPolicy:"no-referrer",keepalive:true}).catch(()=>{});
  };
  report("landing_view");
  document.querySelectorAll("[data-campaign-start]").forEach(a=>a.addEventListener("click",()=>report("eligibility_click")));
})();