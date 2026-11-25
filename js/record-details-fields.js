// Step 2 field inventory and read-only RecordWatch rendering.
// The only persistent source is an authenticated Supabase saved_cases.metadata row.
(function(root){
"use strict";
function readControl(el){
  return el.type==="checkbox" ? el.checked : String(el.value||"").trim();
}
function capture(form){
  if(!form)throw new Error("Step 2 form was not found.");
  const fields={};
  for(const el of form.querySelectorAll("input[id],select[id],textarea[id]")){
    if(el.closest(".record-card")||el.type==="button"||el.type==="submit")continue;
    fields[el.id]=readControl(el);
  }
  const charges=Array.from(form.querySelectorAll(".record-card")).map(card=>{
    const row={};
    for(const el of card.querySelectorAll("[data-field]"))row[el.dataset.field]=readControl(el);
    return row;
  });
  return {schemaVersion:1,fields,charges};
}
function restoreControl(el,value){
  if(!el)return;
  if(el.type==="checkbox")el.checked=value===true;
  else el.value=value===null||value===undefined?"":String(value);
}
function hydrate(form,snapshot){
  if(!form||snapshot?.schemaVersion!==1)return false;
  for(const el of form.querySelectorAll("input[id],select[id],textarea[id]")){
    if(el.closest(".record-card")||!Object.hasOwn(snapshot.fields||{},el.id))continue;
    const value=snapshot.fields[el.id];
    // Older snapshots contain empty court controls even when the case has
    // valid court information. Keep the saved case values in that situation.
    if(!value && ["caseState","county","courtName","courtType","caseNumber"].includes(el.id))continue;
    restoreControl(el,value);
  }
  return true;
}
function savedCharges(charges,snapshot){
  const validRows=rows=>Array.isArray(rows)
    ? rows.filter(row=>row && typeof row==="object" && !Array.isArray(row) &&
        Object.values(row).some(value=>value===true ||
          (typeof value==="string" && value.trim()!=="")))
    : [];
  const canonical=validRows(charges);
  return canonical.length ? canonical : validRows(snapshot?.schemaVersion===1 ? snapshot.charges : []);
}
const escape=x=>String(x??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function label(name){
  const custom={
    caseState:"Case state",courtType:"Court division / type",
    courtName:"Court name",caseNumber:"Case number",judgeName:"Judge",
    allChargesConfirmed:"All charges confirmed",proceedingsStatus:"Related proceedings",
    original_charge_name:"Original alleged charge",original_charge_code:"Original alleged statute",
    charge_name:"Final charge name",charge_code:"Final offense code",
    final_disposition:"Final outcome",disposition_date:"Judgment date",
    discharge_date:"Final supervision completion",offense_date:"Offense date",
    isTraffic:"Traffic offense",isSexOffense:"Sex offense",
    isDomesticViolenceConviction:"Domestic violence",isViolentOffense:"Violent offense",
    notes:"Charge notes",courtCostsPaid:"Court costs paid",finesPaid:"Fines paid",
    restitutionPaid:"Restitution paid",fineAmountDue:"Fines due",
    restitutionDue:"Restitution due"
  };
  return custom[name]||String(name).replace(/([a-z])([A-Z])/g,"$1 $2")
    .replace(/[_-]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function view(value){return value===true?"Yes":value===false?"No":value==null||value===""?"Not entered":String(value);}
function rows(fields){
  return Object.entries(fields||{}).map(([key,value])=>
    '<div class="detail-row"><strong>'+escape(label(key))+'</strong><span>'+escape(view(value))+'</span></div>'
  ).join("");
}
function render(snapshot){
  if(!snapshot||snapshot.schemaVersion!==1)
    return '<p class="muted">This case was saved before full Step 2 field synchronization. Review and save it from Record Details to synchronize all fields.</p>';
  return '<details class="recordwatch-case-full-details"><summary>View all saved Step 2 fields</summary>'+
    '<h4>Court, arrest, payment and case-level answers</h4><div class="detail-list">'+rows(snapshot.fields)+'</div>'+
    (snapshot.charges||[]).map((charge,i)=>
      '<h4>Charge '+(i+1)+'</h4><div class="detail-list">'+rows(charge)+'</div>'
    ).join("")+'</details>';
}
root.RecordPathRecordDetailsFields=Object.freeze({capture,hydrate,savedCharges,render});
})(typeof window!=="undefined"?window:globalThis);
