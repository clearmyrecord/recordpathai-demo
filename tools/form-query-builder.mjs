// Source discovery, not legal authorization. No remote request is made here.
export const WAVE1_CODES=Object.freeze(["NV","TX","FL","AZ","GA"]);
const keywords={
  NV:["record sealing petition","petition seal criminal history"],
  TX:["expunction petition","order of nondisclosure","expunction district clerk forms"],
  FL:["FDLE certificate eligibility sealing expungement","petition to seal criminal records","petition expunge court"],
  AZ:["Rule 36.1 petition seal criminal case records","A.R.S. 13-911 sealing forms"],
  GA:["criminal history record restriction","arrest record restriction prosecutor request","record restriction Georgia Bureau Investigation"],
  OH:["application for sealing 2953.32 conviction","application sealing 2953.33 dismissal"]
};
export function discoveryQueries(court){
  if(!court||typeof court!=="object")throw Error("Court is required");
  const state=String(court.state||"").toUpperCase();
  const stateName=String(court.stateName||({OH:"Ohio",NV:"Nevada",TX:"Texas",FL:"Florida",AZ:"Arizona",GA:"Georgia"}[state])||state);
  const courtName=String(court.courtName||"").trim();
  const county=String(court.county||"").trim();
  if(!/^[A-Z]{2}$/.test(state)||!county)throw Error("State and county required");
  // Most Census county rows do not yet have a verified court name.
  // Never make one up just to submit a search query.
  const countyLabel=court.countyEquivalentType==="independent_city"
    ? county : `${county} County`;
  const base=[courtName&&court.courtType!=="unverified"?courtName:"",countyLabel,stateName]
    .filter(Boolean).join(" ");
  const out=[
    `${base} criminal record sealing expungement official forms PDF`,
    `${base} clerk criminal records relief instructions petition`
  ];
  for(const phrase of keywords[state]||["criminal record relief petition"]){
    out.push(`${base} ${phrase} PDF`);
  }
  return [...new Set(out)];
}
export function isWave1(state){
  return WAVE1_CODES.includes(String(state||"").toUpperCase());
}
export function pdfStorageRelativePath(court,formType){
  const state=String(court.state||"").toLowerCase();
  const county=String(court.countySlug||"").toLowerCase();
  const type=String(court.courtType||"").toLowerCase();
  const form=String(formType||"unknown").toLowerCase();
  if(!/^[a-z]{2}$/.test(state)||!/[a-z0-9]/.test(county)||
     !/^[a-z0-9-]+$/.test(county)||!/^[a-z0-9-]+$/.test(type)||
     !/^[a-z0-9-]+$/.test(form))
     throw Error("Unsafe form storage path");
  return `assets/forms/${state}/${county}/${type}/${form}.pdf`;
}
