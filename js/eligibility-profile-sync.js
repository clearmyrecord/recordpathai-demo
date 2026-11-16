// Authenticated Supabase-only persistence for Step 1 personal and mailing data.
// This module never reads localStorage and never alters the login email.
(function(root){
"use strict";
const ids=Object.freeze({fullName:"fullName",street:"address1",unit:"address2",city:"city",state:"residenceState",zip:"zip",phone:"phone",email:"email"});
const asText=x=>String(x==null?"":x).trim();
async function owner(){
  if(!root.RecordPathSupabase)throw new Error("Secure account saving is unavailable. Refresh the page.");
  const db=await root.RecordPathSupabase.getClient();
  const response=await db.auth.getUser();
  if(response.error||!response.data?.user?.id)
    throw new Error("Sign in to RecordPathAI, then Save Personal Information to your account.");
  return {db,userId:response.data.user.id};
}
function fromForm(doc=root.document){
  return Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,asText(doc.getElementById(id)?.value)]));
}
function verify(saved,values){
  const mapper=root.RecordPathPacketContact;
  if(!mapper)throw new Error("The filing-profile mapper is unavailable.");
  const actual=mapper.mergeForAccount(null,saved,null);
  if(mapper.validate(actual).length ||
     mapper.fields.some(f=>asText(actual[f.key])!==asText(values[f.key])))
    throw new Error("Supabase did not confirm every filing contact field. Please retry.");
  return actual;
}
async function load(){
  const {db,userId}=await owner();
  const result=await db.from("profiles").select("*").eq("id",userId).maybeSingle();
  if(result.error||result.data?.id!==userId)
    throw new Error("Your authenticated Supabase profile could not be loaded.");
  const r=result.data;
  return {values:{
    fullName:asText(r.filing_full_name||r.full_name),
    street:asText(r.mailing_line1),unit:asText(r.mailing_line2),
    city:asText(r.mailing_city),state:asText(r.mailing_state),zip:asText(r.mailing_zip),
    phone:asText(r.filing_phone||r.phone),email:asText(r.filing_email||r.email)
  },fullySaved:Boolean(r.filing_full_name&&r.mailing_line1&&r.mailing_city&&r.mailing_state&&r.mailing_zip&&r.filing_phone&&r.filing_email)};
}
async function save(values){
  const mapper=root.RecordPathPacketContact;
  if(!mapper)throw new Error("The filing-profile mapper is unavailable.");
  const problems=mapper.validate(values);
  if(problems.length){
    const field=mapper.fields.find(f=>problems.includes(f.key));
    throw new Error("Complete or correct "+(field?.label||"your contact details")+" before saving.");
  }
  const {db,userId}=await owner();
  const result=await db.from("profiles")
    .update(mapper.profileUpdate(values)).eq("id",userId).select("*").single();
  if(result.error||result.data?.id!==userId)
    throw new Error("Supabase could not save your personal information. Your browser draft was retained.");
  return verify(result.data,values);
}
root.RecordPathEligibilityProfile=Object.freeze({ids,fromForm,load,save});
})(typeof window!=="undefined"?window:globalThis);
