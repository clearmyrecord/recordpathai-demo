(function () {
  "use strict";
  // Read-only customer filing tracker. Never triggers checkout, email or Lob.
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function el(id){return document.getElementById(id);}
  function label(stage) {
    return stage.state==="complete" ? "Verified" :
      stage.state==="attention" ? "Needs attention" : "Pending";
  }
  function currentCase(){
    var url=new URLSearchParams(window.location.search).get("caseId") || "";
    var active=window.RecordPathUserStore?.getActiveCaseId?.() || "";
    if(UUID.test(url))return url;
    return UUID.test(active)?active:"";
  }
  function renderTimeline(data){
    var steps=el("recordwatchFilingSteps");
    steps.replaceChildren();
    if(!Array.isArray(data.steps))return;
    data.steps.forEach(function(stage){
      var item=document.createElement("div");
      item.className="recordwatch-fulfillment-stage "+(stage.state||"pending");
      var header=document.createElement("strong");
      header.textContent=stage.label+" · "+label(stage);
      var detail=document.createElement("span");
      detail.textContent=stage.description||"Status unavailable";
      item.append(header,detail);
      steps.appendChild(item);
    });
    el("recordwatchFilingStatus").textContent=data.summary||
      "Your filing records cannot be verified.";
    var ref=el("recordwatchFilingReference");
    if(data.lob_submitted && data.lob_check_reference){
      ref.textContent="Lob check order reference: "+data.lob_check_reference+
        ". This is not a USPS tracking number.";
    }else{
      ref.textContent="No verified Lob mailing reference or postal tracking number.";
    }
    if(data.packet_payment_verified){
      var amount=Number(data.preparation_fee_cents||0)+Number(data.court_fee_cents||0);
      ref.textContent+=" Packet checkout recorded: $"+(amount/100).toFixed(2)+
        " ($50 preparation + verified court fee).";
    }
  }
  async function refresh(){
    var btn=el("refreshRecordwatchFiling");
    var status=el("recordwatchFilingStatus");
    var caseId=currentCase();
    var link=el("recordwatchPacketLink");
    if(link)link.href=caseId?"packet.html?caseId="+encodeURIComponent(caseId):"packet.html";
    if(!caseId){
      status.textContent="Choose a saved case before checking filing and mailing status.";
      el("recordwatchFilingSteps").replaceChildren();
      return;
    }
    btn.disabled=true;
    status.textContent="Checking private packet and filing records…";
    try{
      if(window.RecordPathUserStore?.readyForAuth)
        await RecordPathUserStore.readyForAuth;
      const client=await window.RecordPathSupabase.getClient();
      const auth=await client.auth.getSession();
      const token=auth?.data?.session?.access_token;
      if(!token)throw new Error("Sign in before opening your private filing status.");
      const response=await fetch("/api/packet/filing-status?case_id="+encodeURIComponent(caseId),{
        method:"GET",cache:"no-store",headers:{"Authorization":"Bearer "+token}
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok!==true||data.case_id!==caseId)
        throw new Error(data.error||"Private filing status is unavailable.");
      renderTimeline(data);
    }catch(error){
      status.textContent=(error?.message||"Cannot verify private filing status")+
        " No checkout or mailing was initiated.";
      el("recordwatchFilingSteps").replaceChildren();
      el("recordwatchFilingReference").textContent="";
    }finally{btn.disabled=false;}
  }
  document.addEventListener("DOMContentLoaded",function(){
    var btn=el("refreshRecordwatchFiling");
    if(!btn)return;
    btn.addEventListener("click",refresh);
    refresh();
    document.addEventListener("recordpath:auth-change",function(){refresh();});
    window.addEventListener("focus",function(){
      if(document.visibilityState==="visible")refresh();
    });
  });
}());
