/* Browser-only applicant import preview. No bulk database search or network upload. */
(function(){
  "use strict";
  function boot(){
    const anchor=document.getElementById("formRequirementsPanel");
    const core=window.RecordPathCaseImport,bridge=window.RecordPathDataBridge;
    if(!anchor||!core||!bridge)return;
    const panel=document.createElement("section");
    panel.setAttribute("aria-label","Review and prefill your own court case");
    panel.style.cssText="border:1px solid #cbd5e1;border-radius:14px;padding:16px;margin:16px 0;background:#f8fbff;color:#20365e";
    const h=document.createElement("h3");h.textContent="Have a copy of your court record?";
    h.style.cssText="margin:0 0 8px;font-size:19px";
    const desc=document.createElement("p");
    desc.textContent="Preview a single-case JSON export from a court or approved record provider, confirm it is yours, and prefill known charge and docket fields. This does not search public records, upload the file, or establish eligibility. Missing court-form information is requested during screening.";
    desc.style.cssText="font-size:14px;line-height:1.5;margin:0 0 10px";
    const sample=document.createElement("a");
    sample.href="data/example-user-case-import.json";sample.download="recordpathai-example-case-import.json";
    sample.textContent="Download example JSON format (fictional)";
    sample.style.cssText="display:inline-block;margin-bottom:12px;font-size:14px;text-decoration:underline";
    const file=document.createElement("input");
    file.type="file";file.accept=".json,application/json";file.setAttribute("aria-label","Select single-case court record JSON");
    file.style.cssText="display:block;width:100%;margin-bottom:10px";
    const label=document.createElement("label");
    label.style.cssText="display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:8px 0 12px";
    const checkbox=document.createElement("input");checkbox.type="checkbox";
    const labelText=document.createElement("span");labelText.textContent="I confirm this record concerns me or I am authorized to prepare this applicant's case, and I will verify every charge before using a court form.";
    label.append(checkbox,labelText);
    const actions=document.createElement("div");actions.style.cssText="display:flex;gap:10px;flex-wrap:wrap";
    const preview=document.createElement("button");preview.type="button";preview.textContent="Preview record fields";
    const apply=document.createElement("button");apply.type="button";apply.textContent="Use these details for screening";apply.disabled=true;
    for(const btn of [preview,apply])btn.style.cssText="border:1px solid #6995d5;border-radius:8px;padding:10px 14px;cursor:pointer;background:#eaf2ff;color:#20365e;font-weight:600";
    actions.append(preview,apply);
    const status=document.createElement("div");
    status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    status.style.cssText="font-size:14px;white-space:pre-line;margin-top:12px;line-height:1.5";
    const privacy=document.createElement("p");
    privacy.textContent="Privacy: the import file stays in this browser. Applied details use the site's existing browser-local case draft; do not use shared devices for sensitive records. No database upload is performed by this feature.";
    privacy.style.cssText="font-size:12px;line-height:1.45;margin:12px 0 0;color:#566a89";
    panel.append(h,desc,sample,file,label,actions,status,privacy);
    anchor.parentNode.insertBefore(panel,anchor);
    let prepared=null;
    function clear(){prepared=null;apply.disabled=true;status.textContent="";}
    file.addEventListener("change",clear);
    checkbox.addEventListener("change",clear);
    preview.addEventListener("click",async()=>{
      clear();
      if(!checkbox.checked){status.textContent="Confirm that you are authorized to review this applicant's record first.";return;}
      const selected=file.files?.[0];
      if(!selected){status.textContent="Select a court-record JSON file.";return;}
      if(selected.size>256*1024){status.textContent="File is too large for single-case preview (maximum 256 KB).";return;}
      try{
        const obj=JSON.parse(await selected.text());
        prepared=core.normalize(obj,{confirmOwnRecord:true});
        const info=prepared.summary;
        status.textContent="Preview only — NOT independently verified or court-ready.\n"+
          "Case: "+info.caseNumber+" · "+info.county+", "+info.state+"\n"+
          "Applicant: "+info.applicant+" · "+info.charges+" charge(s)\n"+
          prepared.warnings.join("\n");
        apply.disabled=false;
      }catch(err){status.textContent="Cannot preview: "+String(err?.message||"invalid document").slice(0,200);}
    });
    apply.addEventListener("click",()=>{
      if(!prepared||!checkbox.checked){status.textContent="Preview the file and confirm authorization first.";return;}
      try{
        const current=bridge.loadPacketData();
        const incoming=prepared.draft;
        const mismatch=Boolean(
          current?.court?.case_number&&String(current.court.case_number).toLowerCase()!==incoming.court.case_number.toLowerCase()||
          current?.petitioner?.full_name&&String(current.petitioner.full_name).toLowerCase()!==incoming.petitioner.full_name.toLowerCase()
        );
        const confirmed=mismatch?window.confirm("This replaces a different applicant or case currently in your browser. Continue only if authorized."):false;
        if(mismatch&&!confirmed){status.textContent="Existing case preserved. Nothing imported.";return;}
        const result=core.merge(bridge,prepared,{confirmReplace:confirmed});
        file.value="";prepared=null;apply.disabled=true;
        status.textContent=result.chargeCount+" charge(s) added for review. Every outcome, deadline, court form and fee still needs verification. Refreshing the intake…";
        document.dispatchEvent(new CustomEvent("recordpath:data-updated"));
        window.location.reload();
      }catch(err){status.textContent="Import was not applied: "+String(err?.message||"review failed").slice(0,200);}
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
