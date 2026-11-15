// Owner-scoped court-packet contact mapping. No private data leaves this module.
// Never fill an address from court location or guess a mailing address.
(function (root) {
  "use strict";
  const fields = Object.freeze([
    { key:"fullName",path:"petitioner.full_name",column:"filing_full_name",label:"Full legal name",required:true },
    { key:"street",path:"petitioner.address.line1",column:"mailing_line1",label:"Street address",required:true },
    { key:"unit",path:"petitioner.address.line2",column:"mailing_line2",label:"Apartment / P.O. box (optional)",required:false },
    { key:"city",path:"petitioner.address.city",column:"mailing_city",label:"Mailing city",required:true },
    { key:"state",path:"petitioner.address.state",column:"mailing_state",label:"Mailing state",required:true },
    { key:"zip",path:"petitioner.address.zip",column:"mailing_zip",label:"ZIP code",required:true },
    { key:"phone",path:"petitioner.phone",column:"filing_phone",label:"Telephone number",required:true },
    { key:"email",path:"petitioner.email",column:"filing_email",label:"Email address",required:true }
  ]);
  const trim = value => String(value == null ? "" : value).trim();
  const get = (object,path) => path.split(".").reduce((x,key)=>x && x[key],object);
  function set(object,path,value) {
    const parts=path.split(".");
    let node=object;
    parts.slice(0,-1).forEach(k=>{
      if(!node[k] || typeof node[k]!=="object")node[k]={};
      node=node[k];
    });
    node[parts[parts.length-1]]=trim(value);
  }
  function mergeForAccount(raw,profile,user) {
    const row=profile||{},account=user||{};
    const owner=trim(account.id);
    const markedOwner=trim(raw?.meta?.packet_contact_user_id);
    const savedName=trim(get(raw,"petitioner.full_name"));
    const accountName=trim(row.filing_full_name||row.full_name||account.fullName);
    // Old browser records had no account ownership marker: reuse those contact
    // details only if their full legal name matches the signed-in account.
    const verifiedLegacy=Boolean(owner && (
      markedOwner===owner ||
      (!markedOwner && savedName && accountName &&
       savedName.toLocaleLowerCase()===accountName.toLocaleLowerCase())
    ));
    const defaults={
      fullName:row.full_name||account.fullName,
      email:row.email||account.email,
      phone:row.phone||account.phone
    };
    return Object.fromEntries(fields.map(f=>{
      const saved=trim(row[f.column]);
      const cached=verifiedLegacy ? trim(get(raw,f.path)) : "";
      return [f.key,saved||cached||trim(defaults[f.key])];
    }));
  }
  function validate(values) {
    const v=Object.fromEntries(fields.map(f=>[f.key,trim(values?.[f.key])]));
    const invalid=fields.filter(f=>f.required && !v[f.key]).map(f=>f.key);
    if(v.fullName && (v.fullName.length>160||v.fullName.length<3)) invalid.push("fullName");
    if(v.street.length>200||v.unit.length>120||v.city.length>120 ||
       v.state.length>40 || v.zip.length>24 || v.phone.length>40 ||
       v.email.length>254)invalid.push("contact");
    if(v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))invalid.push("email");
    if(v.phone && v.phone.replace(/\D/g,"").length<7)invalid.push("phone");
    if(v.zip && !/^[A-Za-z0-9 -]{3,24}$/.test(v.zip))invalid.push("zip");
    if(v.state && !/^[A-Za-z .'-]{2,40}$/.test(v.state))invalid.push("state");
    return [...new Set(invalid)];
  }
  function applyToDraft(raw,values,userId) {
    if(!raw||typeof raw!=="object"||!trim(userId))throw new Error("An authenticated account is required.");
    const out=JSON.parse(JSON.stringify(raw));
    fields.forEach(f=>set(out,f.path,values[f.key]));
    if(!out.meta || typeof out.meta!=="object")out.meta={};
    out.meta.packet_contact_user_id=trim(userId);
    return out;
  }
  function profileUpdate(values) {
    return Object.fromEntries(fields.map(f=>[f.column,trim(values?.[f.key])]));
  }
  root.RecordPathPacketContact=Object.freeze({
    fields,mergeForAccount,validate,applyToDraft,profileUpdate
  });
})(typeof window!=="undefined"?window:globalThis);
