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
  function displayList(assessment){
    if(!listNode)return;
    listNode.replaceChildren();
    const entries=assessment.requirements;
    const missingSet=new Set(assessment.missing.map(x=>x.key));
    for(const r of entries){
      const li=document.createElement("li");
      const missing=missingSet.has(r.key);
      li.textContent=(missing?"Missing: ":"Captured: ")+r.label+
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
  function renderMappedInputs(assessment,data){
    const extra=document.getElementById("formRequirementsExtraFields");
    const validator=window.RecordPathFormPipeline;
    if(!extra||!validator)return;
    const isDetails=Boolean(document.getElementById("recordDetailsForm"));
    const existingScreen=new Set(Array.from(document.querySelectorAll("[data-path]")).map(n=>n.dataset.path));
    const knownIds={
      "court.case_number":"caseNumber","court.name":"courtName",
      "court.county":"county","court.judge_name":"judgeName",
      "petitioner.dob":"dateOfBirth","petitioner.email":"email",
      "petitioner.phone":"phone","petitioner.full_name":"fullName"
    };
    const needed=assessment.requirements.filter(x=>
      x.source==="court-pdf-mapping"&&validator.validKey(x.key)&&
      !existingScreen.has(x.key)&&
      !(isDetails&&((x.key.startsWith("charges."))||document.getElementById(knownIds[x.key])))&&
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
      label.textContent=r.label+" — additional court-form field";
      label.style.display="block";
      const input=document.createElement("input");
      input.id=id;
      input.dataset.canonicalPath=r.key;
      input.autocomplete="off";
      input.type=/(^|_)(date|dob)$/.test(r.key)?"date":"text";
      input.style.width="100%";input.style.padding="9px";
      input.value=String(engine.get(data,r.key)||"");
      input.addEventListener("change",()=>{
        if(!validator.validKey(r.key))return;
        const current=bridge.loadPacketData();
        bridge.setValueByPath(current,r.key,input.value.trim());
        bridge.derivePacketData(current);
        bridge.savePacketData(current);
        document.dispatchEvent(new CustomEvent("recordpath:data-updated"));
      });
      wrapper.append(label,input);extra.append(wrapper);
    }
  }

  function display(assessment){
    currentAssessment=assessment;
    if(stateNode)safeText(stateNode,
      assessment.stateName+" — "+(
        assessment.scope==="wave1"?"Wave 1 intake":
        assessment.scope==="pilot"?"Ohio pilot intake":
        assessment.scope==="preparatory"?"Initial-pilot preparation":"General screening"));
    if(summaryNode)safeText(summaryNode,
      assessment.classification.outcome==="mixed"
        ?"Mixed case outcomes detected. No form selected automatically; judicial-rule review is required."
        :assessment.classification.candidateFormType
         ?"Potential form route: "+assessment.classification.candidateFormType+
          ". This does not establish legal eligibility."
         :"Form selection pending verification of every charge's final outcome.");
    if(mappingNode)safeText(mappingNode,assessment.sourceForm&&mapping.length
      ?"Official mapping located for "+assessment.sourceForm.county+" County, "+assessment.sourceForm.type+
      ". Its fields are included in the requirements below."
      :"No court-verified mapped PDF is active for this exact jurisdiction and outcome. Baseline data is captured now; court-specific fields may still need review before a packet can be prepared.");
    displayList(assessment);
    renderMappedInputs(assessment,lastData);
    const review=document.getElementById("formRequirementsReview");
    if(review)safeText(review,assessment.review.length
      ? "Review needed: "+assessment.review.join(" ")
      : "Baseline case details captured. Court eligibility and form approval are separate checks.");
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