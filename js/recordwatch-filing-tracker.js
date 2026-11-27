(function () {
  "use strict";
  // Read-only customer filing tracker. Never triggers checkout, email or Lob.
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function el(id){return document.getElementById(id);}
  function label(stage) {
    return stage.state==="complete" ? "Verified" :
      stage.state==="attention" ? "Needs attention" : "Pending";
  }
  var epoch=0,selectedJob=null,selectedOwner=null;
  function resetLibrary(){selectedJob=null;el("recordwatchPacketDownload").hidden=true;el("recordwatchPacketLink").hidden=true;el("recordwatchPacketSaved").textContent="Select a case to find its saved packet.";}
  function currentCase(){
    var picked=el("recordwatchPacketCase")?.value||"";
    if(UUID.test(picked))return picked;
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
    const seq=++epoch;resetLibrary();
    var caseId=currentCase();
    var link=el("recordwatchPacketLink");
    if(link)link.href=caseId?"packet.html?caseId="+encodeURIComponent(caseId):"packet.html";
    el("recordwatchFilingSteps").replaceChildren();el("recordwatchFilingReference").textContent="";
    btn.disabled=true;
    status.textContent="Checking private packet and filing records…";
    try{
      if(window.RecordPathUserStore?.readyForAuth)
        await RecordPathUserStore.readyForAuth;
      const client=await window.RecordPathSupabase.getClient();
      const auth=await client.auth.getSession();
      const token=auth?.data?.session?.access_token;
      const owner=auth?.data?.session?.user?.id;
      if(!token||!owner)throw new Error("Sign in before opening your private filing status.");
      const cases=await RecordPathUserStore.getSupabaseCases();if(seq!==epoch)return;
      const select=el("recordwatchPacketCase");select.replaceChildren();
      const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Select a saved case";select.append(placeholder);
      for(const c of cases){const id=c.case_id||c.id;if(!UUID.test(id))continue;const o=document.createElement("option");o.value=id;o.textContent=[c.caseNumber||id,c.courtName||c.court,c.packetStatus].filter(v=>typeof v==="string"&&v).join(" · ");select.append(o);}
      if(!Array.from(select.options).some(o=>o.value===caseId)||selectedOwner&&selectedOwner!==owner)caseId="";
      selectedOwner=owner;select.value=caseId;
      if(!caseId){status.textContent="Choose a saved case to view its packet.";return;}
      link.href="packet.html?caseId="+encodeURIComponent(caseId);link.hidden=false;
      const response=await fetch("/api/packet/filing-status?case_id="+encodeURIComponent(caseId),{
        method:"GET",cache:"no-store",headers:{"Authorization":"Bearer "+token}
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok!==true||data.case_id!==caseId)
        throw new Error(data.error||"Private filing status is unavailable.");
      if(seq!==epoch)return;
      renderTimeline(data);
      const lib=data.packet_library||{};
      el("recordwatchPacketSaved").textContent=lib.generated?"Signed packet saved privately"+(lib.generated_at?" · "+new Date(lib.generated_at).toLocaleDateString():"")+(lib.page_count?" · "+lib.page_count+" pages":"")+". Reopen for review or checkout.":"No signed packet saved. Open packet preparation to generate one.";
      link.textContent=lib.generated?"Open saved packet":"Prepare packet";
      link.href="packet.html?caseId="+encodeURIComponent(caseId)+(lib.generated?"&savedPacket=1":"");
      if(UUID.test(lib.paid_download_job||"")){selectedJob={caseId,jobId:lib.paid_download_job,owner};el("recordwatchPacketDownload").hidden=false;}
    }catch(error){
      if(seq!==epoch)return;resetLibrary();
      el("recordwatchPacketCase").replaceChildren();
      status.textContent=(error?.message||"Cannot verify private filing status")+
        " No checkout or mailing was initiated.";
      el("recordwatchFilingSteps").replaceChildren();
      el("recordwatchFilingReference").textContent="";
    }finally{if(seq===epoch)btn.disabled=false;}
  }
  async function download(){
    const job=selectedJob;if(!job)return;const seq=epoch,btn=el("recordwatchPacketDownload");btn.disabled=true;
    try{
      const client=await window.RecordPathSupabase.getClient();const auth=await client.auth.getSession();
      if(auth.data?.session?.user?.id!==job.owner||seq!==epoch)throw Error("Sign in again.");
      const r=await fetch("/api/packet/download-approved",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth.data.session.access_token},body:JSON.stringify({case_id:job.caseId,recordwatch_job_id:job.jobId})});
      if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||"Saved packet unavailable. Do not pay again.");}
      const blob=await r.blob();if(seq!==epoch||blob.type!=="application/pdf"||blob.size<500)return;
      const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="recordpathai-signed-packet.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);
    }catch(e){if(seq===epoch)el("recordwatchPacketSaved").textContent=e.message||"Download unavailable. Do not pay again.";}finally{btn.disabled=false;}
  }
  document.addEventListener("DOMContentLoaded",function(){
    var btn=el("refreshRecordwatchFiling");
    if(!btn)return;
    btn.addEventListener("click",refresh);
    el("recordwatchPacketCase").addEventListener("change",refresh);
    el("recordwatchPacketDownload").addEventListener("click",download);
    refresh();
    document.addEventListener("recordpath:auth-change",function(){resetLibrary();el("recordwatchPacketCase").replaceChildren();refresh();});
    window.addEventListener("focus",function(){
      if(document.visibilityState==="visible")refresh();
    });
  });
}());
