/* Official public links only. Research agents cannot add a link here without review.
   This widget never searches records or transfers applicant information. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.RecordPathRecordCollection=api;
}(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const OHIO_DIRECTORY="https://www.supremecourt.ohio.gov/courts/judicial-system/ohio-trial-courts/";
  const WOOD_COMMON_PLEAS="https://clerkofcourt.co.wood.oh.us/169/Dockets-Online";
  function normalizeState(value){
    const s=String(value||"").trim().toLowerCase();
    return s==="oh"||s==="ohio"?"OH":s.toUpperCase();
  }
  function normalizeCounty(value){
    return String(value||"").trim().toLowerCase().replace(/\s+county$/,"");
  }
  function linkFor({state,county,courtType}={}){
    const st=normalizeState(state),co=normalizeCounty(county);
    if(st==="OH"&&co==="wood"&&courtType==="court-of-common-pleas"){
      return {url:WOOD_COMMON_PLEAS,label:"Open Wood County Common Pleas court records",
        note:"This is the official Wood County Clerk's docket page. Select CourtView and search by name or case number."};
    }
    if(st==="OH"){
      return {url:OHIO_DIRECTORY,label:"Find your court in Ohio's official directory",
        note:co?
          "Select "+String(county).trim()+" County and the court that handled your case. This directory is not a case-search portal; follow the court's website to look for public records.":
          "Select your case county and court. This directory is not a case-search portal; look for public records on the clerk's website."};
    }
    return {url:null,label:"",note:st?
      "We do not yet have a verified online docket link for this court. Please contact its clerk and ask how to see your case records.":
      "Select the state and county where your case was filed above to find an official court resource."};
  }
  function update(){
    if(typeof document==="undefined")return null;
    const input=id=>document.getElementById(id)?.value||"";
    const info=linkFor({state:input("caseState"),county:input("county"),courtType:input("courtType")});
    const link=document.getElementById("recordCollectionDocketLink");
    const guide=document.getElementById("recordCollectionInstructions");
    if(guide)guide.textContent=info.note;
    if(link){
      link.hidden=!info.url;
      if(info.url){link.href=info.url;link.textContent=info.label;}
      else{link.removeAttribute("href");link.textContent="";}
    }
    return info;
  }
  return Object.freeze({OHIO_DIRECTORY,WOOD_COMMON_PLEAS,normalizeState,normalizeCounty,linkFor,update});
}));
