import {metroCourtResource} from "./ohio-metro-court-resources.js";
const $=id=>document.getElementById(id);
const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(cents/100);
try{
 const r=await fetch("data/ohio-metro-court-resources.json",{credentials:"omit",cache:"no-store"});
 if(!r.ok)throw Error("resource registry unavailable");
 const registry=await r.json();
 for(const c of registry.courts){const o=document.createElement("option");o.value=c.id;o.textContent=c.name;$("court").appendChild(o);}
 const update=()=>{
  const result=metroCourtResource(registry,$("court").value,$("outcome").value);
  $("details").hidden=!result;
  $("notice").textContent=result?"Published standard fee; confirm with the clerk before filing.":$("outcome").value==="mixed"?"Mixed, unknown or other dispositions require individual legal review. No automatic quote.":"Choose the court and final outcome.";
  if(!result)return;
  $("name").textContent=result.name;$("court-fee").textContent=money(result.courtFeeCents);$("total").textContent=money(result.illustrativeTotalCents);
  $("form-note").textContent=result.formNote;$("filing").textContent=result.filing;
  $("official-form").href=result.officialForm;$("official-directory").href=result.officialDirectory;$("fee-source").href=result.source;
 };
 $("court").addEventListener("change",update);$("outcome").addEventListener("change",update);update();
}catch{$("notice").textContent="Court resources are unavailable. Please use the official Ohio court directory.";const a=document.createElement("a");a.href="https://www.supremecourt.ohio.gov/courts/judicial-system/ohio-trial-courts/";a.textContent="Ohio court directory";$("notice").append(" ",a);}
