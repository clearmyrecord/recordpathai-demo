/* Form-aware intake UI. Reads only this site's approved local template index and mappings.
   Court form metadata from an unreviewed scraper manifest never becomes an active form. */
(function(){
  "use strict";
  const engine=window.RecordPathFormRequirements;
  const bridge=window.RecordPathDataBridge;
  if(!engine||!bridge)return;
  const panel=document.getElementById("formRequirementsPanel");
  if(!panel)return;
  const stateNode=document.getElementById("formRequirementsState");
  const summaryNode=document.getElementById("formRequirementsSummary");
  const listNode=document.getElementById("formRequirementsList");
  const mappingNode=document.getElementById("formRequirementsMapping");
  let registry=[],mapping=[],lastMapKey="",lastData=null,currentAssessment=null,timer;
  function safeText(node,content){if(node)node.textContent=String(content||"");}
  async function getJson(url){
    const response=await fetch(url,{cache:"no-store",credentials:"same-origin"});
    if(!response.ok)throw Error("Cannot load local form catalog");
    return response.json();
  }
  async function loadRegistry(){
    try{
      const data=await getJson("templates/index.json");
      registry=Array.isArray(data)?data.filter(x=>x&&x.status==="active"):[];
    }catch(_err){registry=[];}
  }
  async function selectLocalMap(data){
    const entry=engine.relevantEntry(data,registry);
    const key=entry?String(entry.mappingPath||""):"";
    if(key===lastMapKey)return;
    lastMapKey=key;mapping=[];
    if(!/^templates\/[a-zA-Z0-9/_-]+\.json$/.test(key))return;
    try{
      const raw=await getJson(key);
      mapping=Array.isArray(raw?.mappings)?raw.mappings:[];
    }catch(_err){mapping=[];}
  }
  function hasResponse(assessment,key){
    const value=engine.get(lastData,key);
    return value!==null&&value!==undefined&&String(value).trim()!=="";
  }

  function displayList(assessment){
    if(!listNode)return;
    listNode.replaceChildren();
    const entries=assessment.requirements;
    const missingSet=new Set(assessment.missing.map(x=>x.key));
    for(const r of entries){
      const li=document.createElement("li");
      const missing=missingSet.has(r.key);
      const provisional=r.source==="state-screen-provisional";
      const provided=hasResponse(assessment,r.key);
      li.textContent=provisional?(provided?"Recorded (provisional): ":"Suggested for verification: ")+r.label
        :(missing?"Missing: ":"Captured: ")+r.label+
        (r.source==="court-pdf-mapping"?" (from mapped court PDF)":"");
      if(missing)li.style.color="#9a3412";
      listNode.append(li);
    }
    const extra=assessment.missing.filter(x=>!entries.some(r=>r.key===x.key));
    for(const r of extra){
      const li=document.createElement("li");
      li.style.color="#9a3412";
      li.textContent="Missing: "+r.label+" (per-charge detail)";
      listNode.append(li);
    }
  }
  // Browser-only preparation worksheet: no upload, API call or court filing.
  let worksheetButton=null, chargeAudit=null;
  function renderChargeAudit(data){
    if(!chargeAudit){
      const container=document.createElement("div");
      container.id="formRequirementsChargeAudit";
      const h=document.createElement("h4");
      h.textContent="Charge-by-charge record verification";
      const detail=document.createElement("p");
      detail.textContent="Disposition is the judgment/outcome date; final discharge is when the sentence and supervision actually ended. Never assume they match.";
      detail.style.fontSize="0.9rem";
      chargeAudit=document.createElement("ul");
      container.append(h,detail,chargeAudit);
      (document.getElementById("formRequirementsReviewDetails") || panel).append(container);
    }
    chargeAudit.replaceChildren();
    const charges=Array.isArray(data?.charges)?data.charges:[];
    if(!charges.length){
      const li=document.createElement("li");
      li.textContent="No charges recorded yet. Continue to Record Details to identify each count.";
      chargeAudit.append(li);
    }
    charges.forEach((c,index)=>{
      const li=document.createElement("li");
      const normalized=engine.normalizeOutcome(c.final_disposition||c.disposition);
      const disposition=engine.dateStatus(c.disposition_date);
      const discharge=engine.dateStatus(c.discharge_date);
      let summary="Charge "+(index+1)+": "+(c.charge_name||"final charge unknown")+
        " | Final outcome: "+(normalized==="unknown"?"verify":normalized)+
        " | Judgment: "+(disposition==="valid"?c.disposition_date:"verify");
      if(normalized==="convicted")
        summary+=" | Final discharge: "+(discharge==="valid"?c.discharge_date:"verify separately");
      if(c.reported_termination_date_unverified&&!c.discharge_date)
        summary+=" | Imported termination is unverified";
      li.textContent=summary;
      chargeAudit.append(li);
    });
    if(!worksheetButton){
      worksheetButton=document.createElement("button");
      worksheetButton.type="button";
      worksheetButton.id="downloadPreparationWorksheet";
      worksheetButton.textContent="Download case preparation worksheet (private TXT)";
      worksheetButton.style.margin="10px 0";
      worksheetButton.addEventListener("click",()=>{
        const current=bridge.loadPacketData();
        const text=engine.buildPreparationWorksheet(current,{registry,mapping});
        const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
        const url=URL.createObjectURL(blob);
        const link=document.createElement("a");
        link.href=url;
        link.download="recordpathai-private-preparation-worksheet.txt";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
      });
      (document.getElementById("formRequirementsReviewDetails") || panel).append(worksheetButton);
    }
  }
  // Legal eligibility review remains available in the rule engine, but the
  // repetitive Ohio pilot/legal preflight panel is not customer-facing.
  function renderMappedInputs(assessment,data){
    const extra=document.getElementById("formRequirementsExtraFields");
    const validator=window.RecordPathFormPipeline;
    if(!extra||!validator)return;
    const isDetails=Boolean(document.getElementById("recordDetailsForm"));
    const existingScreen=new Set(Array.from(document.querySelectorAll("[data-path]")).map(n=>n.dataset.path));
    const knownIds={
      "court.state":"caseState","court.court_type":"courtType",
      "court.case_number":"caseNumber","court.name":"courtName",
      "court.county":"county","court.judge_name":"judgeName",
      "court.prosecutor_agency":"prosecutorAgency",
      "case.all_charges_confirmed":"allChargesConfirmed",
      "case.proceedings_status":"proceedingsStatus"
    };
    const needed=assessment.requirements.filter(x=>
      ["court-pdf-mapping","state-screen-provisional"].includes(x.source)&&validator.validKey(x.key)&&
      !/(ssn|social_security|bank|account_number)/i.test(x.key)&&
      !existingScreen.has(x.key)&&
      !(isDetails&&(
        x.key.startsWith("charges.") ||
        x.key.startsWith("petitioner.") || // Already collected in Step 1
        (knownIds[x.key] && document.getElementById(knownIds[x.key]))
      ))&&
      !/^signatures\.|^generated\./.test(x.key)&&
      !/^charges\.[1-9]/.test(x.key)
    ).slice(0,50);
    const wanted=new Set(needed.map(x=>x.key));
    for(const wrapper of Array.from(extra.children)){
      if(!wanted.has(wrapper.dataset.forPath))wrapper.remove();
    }
    for(const r of needed){
      if(Array.from(extra.children).some(n=>n.dataset.forPath===r.key))continue;
      const wrapper=document.createElement("div");wrapper.dataset.forPath=r.key;
      wrapper.style.margin="10px 0";
      const id="mappedExtra_"+r.key.replace(/[^a-z0-9]/gi,"_");
      const label=document.createElement("label");
      label.htmlFor=id;
      label.textContent=r.label+(r.source==="court-pdf-mapping"
        ?" — mapped court-form field"
        :" — suggested early field (not yet court-verified)");
      label.style.display="block";
      const input=document.createElement("input");
      input.id=id;
      input.dataset.canonicalPath=r.key;
      input.autocomplete="off";
      input.type=/(^|_)(date|dob)$/.test(r.key)?"date":"text";
      input.style.width="100%";input.style.padding="9px";
      input.value=String(engine.get(data,r.key)||"");
      const saveMappedField=()=>{
        if(!validator.validKey(r.key))return;
        const current=bridge.loadPacketData();
        bridge.setValueByPath(current,r.key,input.value.trim());
        bridge.derivePacketData(current);
        bridge.savePacketData(current);
        document.dispatchEvent(new CustomEvent("recordpath:data-updated"));
      };
      input.addEventListener("input",saveMappedField);
      input.addEventListener("change",saveMappedField);
      wrapper.append(label,input);extra.append(wrapper);
    }
  }

  function display(assessment){
    currentAssessment=assessment;
    if(stateNode)safeText(stateNode,"Case readiness");
    if(summaryNode)safeText(summaryNode,
      assessment.missing.length
        ? "Your details are saved. Some outcomes or court-form fields still need verification before a final packet is prepared."
        : "Your details are saved. Confirm the court's current filing requirements before preparing your packet.");
    if(mappingNode)safeText(mappingNode,assessment.sourceForm&&mapping.length
      ? "An approved court form mapping was found. Review any additional fields below."
      : "The exact court form is not yet verified. You can still save your case and review packet preparation options.");
    displayList(assessment);
    renderChargeAudit(lastData);
    renderMappedInputs(assessment,lastData);
    const review=document.getElementById("formRequirementsReview");
    if(review)safeText(review,assessment.review.length
      ? assessment.review.join(" ")
      : "Form and eligibility requirements must be verified before filing.");
    panel.dataset.screeningComplete=assessment.screeningComplete?"true":"false";
    panel.dataset.formStatus=assessment.sourceForm&&mapping.length?"mapped":"unmapped";
  }
  async function update(){
    const data=bridge.loadPacketData();
    const stateSelect=document.getElementById("caseState");
    if(stateSelect){
      const state=engine.normalizeState(stateSelect.value);
      if(state&&(state!==engine.normalizeState(data.court?.state))){
        if(!data.court)data.court={};
        if(!data.meta)data.meta={};
        data.court.state=state;
        data.meta.source_state=state;
        bridge.savePacketData(data);
      }
    }
    await selectLocalMap(data);
    lastData=data;
    display(engine.assess(data,{registry,mapping}));
  }
  function scheduleUpdate(){
    clearTimeout(timer);
    timer=setTimeout(()=>{update().catch(()=>{})},100);
  }
  async function ready(){
    await loadRegistry();
    await update();
    document.addEventListener("recordpath:data-updated",scheduleUpdate);
    document.getElementById("caseState")?.addEventListener("change",scheduleUpdate);
  }
  window.RecordPathWave1Intake={
    getAssessment(){return currentAssessment;},
    async refresh(){await update();return currentAssessment;},
    getCurrentData(){return lastData;}
  };
  ready().catch(()=>{});
}());