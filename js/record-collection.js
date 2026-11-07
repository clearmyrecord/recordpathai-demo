/* Record Collection: customer links by the ACTUAL court that heard the case.
   Only exact court matches that a reviewer has approved can become direct links.
   A search-result candidate, county, court type alone or user-entered name is never
   authorization to use an unreviewed portal. No applicant data is transmitted. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.RecordPathRecordCollection=api;
}(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const OHIO_DIRECTORY="https://www.supremecourt.ohio.gov/courts/judicial-system/ohio-trial-courts/";
  const WOOD_COMMON_PLEAS="https://clerkofcourt.co.wood.oh.us/169/Dockets-Online";
  let approvedCourts=[];
  function normalizeState(value){
    const s=String(value||"").trim().toLowerCase();
    return s==="oh"||s==="ohio"?"OH":s.toUpperCase();
  }
  function normalizeCounty(value){
    return String(value||"").trim().toLowerCase().replace(/\s+county$/,"");
  }
  function normalizeCourtName(value){
    return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  }
  function verifiedEntry(entry){
    if(!entry||entry.state!=="OH"||!entry.courtId||!entry.courtName||
        !entry.county||!entry.courtType||!entry.publicLookup?.verified||
        !entry.publicLookup?.approvedForCustomerLink||!entry.courtIdentityReviewed||
        typeof entry.publicLookup.url!=="string")return false;
    try{
      const u=new URL(entry.publicLookup.url);
      return u.protocol==="https:"&&!u.username&&!u.password;
    }catch{return false;}
  }
  function loadReviewedCatalog(data){
    const entries=Array.isArray(data?.courts)?data.courts:[];
    approvedCourts=entries.filter(verifiedEntry).map(c=>({
      ...c,approvedAliases:Array.isArray(c.approvedAliases)?c.approvedAliases:[]
    }));
    return approvedCourts.length;
  }
  function chooseExactCourt(courts,{state,county,courtType,courtName}){
    const s=normalizeState(state),co=normalizeCounty(county),name=normalizeCourtName(courtName);
    if(!name||!courtType||!co||s!=="OH")return null;
    const candidates=courts.filter(c=>verifiedEntry(c)&&c.state===s&&
      normalizeCounty(c.county)===co&&c.courtType===courtType&&
      [c.courtName,...(c.approvedAliases||[])].some(n=>normalizeCourtName(n)===name));
    // Ambiguous aliases and court divisions must not silently route to the wrong docket.
    return candidates.length===1?candidates[0]:null;
  }
  function linkFor({state,county,courtType,courtName}={},courtRegistry=approvedCourts){
    const st=normalizeState(state),co=normalizeCounty(county);
    if(st==="OH"){
      const match=chooseExactCourt(courtRegistry,{state,county,courtType,courtName});
      if(match){
        return {url:match.publicLookup.url,
          label:"Open "+match.courtName+" public case records",
          courtId:match.courtId,linkedToExactCourt:true,
          note:"This link has been reviewed for "+match.courtName+
            ". Search on the official court site using your name or case number if available. Each court may display different information."};
      }
      return {url:OHIO_DIRECTORY,
        label:"Find the court that handled your case in Ohio",
        linkedToExactCourt:false,courtId:null,
        note:co?
          "Find the "+String(county||"").trim()+" County court where your case was heard. Different courts may use different record websites. This directory helps locate the correct court; it is not itself a case-search portal.":
          "Choose the county and exact court where your case was heard. This official directory is not a case-search portal."};
    }
    return {url:null,label:"",linkedToExactCourt:false,courtId:null,
      note:st?
        "We do not yet have a reviewed online link for the exact court in this state. Please contact the clerk of the court that handled your case.":
        "Select the state, county and court where your case was heard to find an official court resource."};
  }
  function update(){
    if(typeof document==="undefined")return null;
    const input=id=>document.getElementById(id)?.value||"";
    const info=linkFor({
      state:input("caseState"),county:input("county"),
      courtType:input("courtType"),courtName:input("courtName")
    });
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
  async function init(){
    if(typeof fetch!=="function")return update();
    try{
      const response=await fetch("data/ohio-court-portal-maps.json",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw Error("Cannot load reviewed court list");
      loadReviewedCatalog(await response.json());
    }catch{
      // Missing court catalog means no direct docket links; official directory remains available.
      approvedCourts=[];
    }
    return update();
  }
  return Object.freeze({
    OHIO_DIRECTORY,WOOD_COMMON_PLEAS,normalizeState,normalizeCounty,
    normalizeCourtName,verifiedEntry,chooseExactCourt,loadReviewedCatalog,linkFor,update,init
  });
}));
