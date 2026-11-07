#!/usr/bin/env node
/* Authorized private court-source importer. No raw court records are logged.
   Defaults to dry-run, requires an explicit legal authorization manifest and
   service-role credentials to stage records. NEVER publishes searchable names. */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import {fileURLToPath} from "node:url";

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const MAX_CASES=50000,MAX_CHARGES=100,MAX_BYTES=500*1024*1024;
function asText(v,max=200){
 return typeof v==="string"?v.trim().replace(/[\u0000-\u001f\u007f]/g," ").slice(0,max):"";
}
function date(value){
 const t=asText(value,12);
 if(!t)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(t)||new Date(t+"T00:00:00Z").toISOString().slice(0,10)!==t)
  throw Error("Invalid ISO calendar date");
 return t;
}
function validUrl(raw){
 try{const u=new URL(raw);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.includes(".");}
 catch{return false;}
}
export function validManifest(m){
 if(!m||typeof m!=="object"||Array.isArray(m))throw Error("Court source manifest required");
 const batch={
  source_key:asText(m.sourceKey,120),
  issuing_agency:asText(m.issuingAgency,180),
  jurisdiction_state:asText(m.state,2).toUpperCase(),
  county_fips:asText(m.countyFips,5),
  official_source_url:asText(m.officialSourceUrl,1000),
  file_received_at:asText(m.fileReceivedAt,35)||null,
  data_as_of:date(m.dataAsOf),
  access_authority_reference:asText(m.authorityReference,250),
  authorized_by:asText(m.authorizedBy,120),
  status:"quarantined"
 };
 if(!/^[a-zA-Z0-9._:-]{8,120}$/.test(batch.source_key)||
    !["OH","NV","TX","FL","AZ","GA"].includes(batch.jurisdiction_state)||
    !/^[0-9]{5}$/.test(batch.county_fips)||!validUrl(batch.official_source_url)||
    !batch.issuing_agency||!batch.authorized_by||!batch.access_authority_reference||!batch.data_as_of)
  throw Error("Incomplete authorization manifest or jurisdiction");
 return batch;
}
export function normalizeCourtCase(input,batch){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw Error("Each JSONL entry must be one case/defendant with a separate charge list");
 if(input.state&&input.state!==batch.jurisdiction_state)
  throw Error("State mismatch");
 if(input.countyFips&&input.countyFips!==batch.county_fips)
  throw Error("County FIPS mismatch");
 const caseNumber=asText(input.caseNumber,100);
 const sourceCaseKey=asText(input.sourceCaseKey,180);
 const courtName=asText(input.courtName,180);
 const defendantName=asText(input.defendantName,180);
 if(!caseNumber||!sourceCaseKey||!courtName||!defendantName||
   !Array.isArray(input.charges)||input.charges.length<1||input.charges.length>MAX_CHARGES)
  throw Error("Case identity, defendant and charge rows are required");
 const keys=new Set();
 const charges=input.charges.map((c,i)=>{
  if(!c||typeof c!=="object"||Array.isArray(c))throw Error("Invalid charge");
  const chargeKey=asText(c.sourceChargeKey,120);
  if(!chargeKey||keys.has(chargeKey))throw Error("Duplicate or missing source charge key");
  keys.add(chargeKey);
  const original=asText(c.originalCharge,200),final=asText(c.finalCharge,200);
  const originalStatute=asText(c.originalStatute,100),finalStatute=asText(c.finalStatute,100);
  if(!original&&!final&&!originalStatute&&!finalStatute)
   throw Error("Charge "+(i+1)+" has no identity");
  // Reports may be incomplete: unknown outcomes remain null; never infer a
  // conviction from the arrest charge or set the legal termination trigger.
  return {
   source_charge_key:chargeKey,original_charge:original||null,
   original_statute:originalStatute||null,final_charge:final||null,
   final_statute:finalStatute||null,offense_level:asText(c.offenseLevel,50)||null,
   final_disposition:asText(c.finalDisposition,100)||null,
   disposition_date:date(c.dispositionDate),
   reported_termination_date:date(c.terminationDate),
   verified_supervision_termination_date:null,
   termination_evidence_reference:null,supervision_completion_verified_at:null,
   source_line_reference:asText(c.sourceLineReference,100)||null
  };
 });
 return {caseRecord:{
    source_case_key:sourceCaseKey,state:batch.jurisdiction_state,county_fips:batch.county_fips,
    court_name:courtName,case_number:caseNumber,defendant_name:defendantName,
    source_last_updated_at:asText(input.sourceLastUpdatedAt,35)||null,
    source_url:validUrl(input.sourceUrl)?asText(input.sourceUrl,1000):null,
    record_completeness:"unknown",docket_review_status:"needs_review",
    clerk_verified_at:null,clerk_evidence_reference:null},
   charges};
}
function argsOf(argv){
 const o={execute:false};
 for(const v of argv){
  if(v==="--execute")o.execute=true;
  else if(v==="--ack-authorized")o.ackAuthorized=true;
  else if(v.startsWith("--input="))o.input=v.slice(8);
  else if(v.startsWith("--manifest="))o.manifest=v.slice(11);
  else throw Error("Unknown import argument");
 }
 if(!o.input||!o.manifest)throw Error("Usage: --input=/secure/source.jsonl --manifest=/secure/authorization.json [--execute --ack-authorized]");
 return o;
}
function insideRepo(p){return p===repoRoot||p.startsWith(repoRoot+path.sep);}
async function readCases(input,batch){
 const list=[],seen=new Set();
 const stream=fs.createReadStream(input,{encoding:"utf8",highWaterMark:32*1024});
 const iter=readline.createInterface({input:stream,crlfDelay:Infinity});
 try{
  for await(const line of iter){
   if(!line.trim())continue;
   if(line.length>1024*1024)throw Error("Oversized input line");
   const v=normalizeCourtCase(JSON.parse(line),batch);
   if(seen.has(v.caseRecord.source_case_key))throw Error("Duplicate case key within export");
   seen.add(v.caseRecord.source_case_key);list.push(v);
   if(list.length>MAX_CASES)throw Error("Over maximum cases per run");
  }
 }finally{iter.close();stream.destroy();}
 if(!list.length)throw Error("Empty authorized court export");
 return list;
}
async function post(table,rows,unique,serviceUrl,key,selectFields="*"){
 const url=new URL(serviceUrl.replace(/\/$/,"")+"/rest/v1/"+table);
 if(unique)url.searchParams.set("on_conflict",unique);
 url.searchParams.set("select",selectFields);
 const response=await fetch(url,{
  method:"POST",
  headers:{
   apikey:key,authorization:"Bearer "+key,"Content-Type":"application/json",
   Prefer:"resolution=merge-duplicates,return=representation"
  },
  body:JSON.stringify(rows),
  signal:AbortSignal.timeout(30000)
 });
 if(!response.ok)throw Error("Private import service rejected "+table+" with HTTP "+response.status+
  ". Quarantined partial writes may require an authorized retry.");
 return response.json();
}
export async function run(argv=process.argv.slice(2),env=process.env){
 const opts=argsOf(argv);
 const [input,manifest]=await Promise.all([fsp.realpath(opts.input),fsp.realpath(opts.manifest)]);
 if(insideRepo(input)||insideRepo(manifest))
  throw Error("Private court exports and authorization manifests must be kept outside the public Git repository");
 const size=(await fsp.stat(input)).size;
 if(!size||size>MAX_BYTES)throw Error("Court export missing or exceeds 500 MB per run");
 const batch=validManifest(JSON.parse(await fsp.readFile(manifest,"utf8")));
 // Geographic validation against the official Census catalog in Wave 1.
 if(batch.jurisdiction_state!=="OH"){
  const list=JSON.parse(await fsp.readFile(path.join(repoRoot,"data/wave1-court-catalog.json"),"utf8"));
  if(!list.some(c=>c.state===batch.jurisdiction_state&&c.countyFips===batch.county_fips))
   throw Error("Manifest county FIPS not present in verified Wave 1 catalog");
 }
 const cases=await readCases(input,batch);
 const chargeCount=cases.reduce((sum,c)=>sum+c.charges.length,0);
 if(!opts.execute)return {mode:"DRY_RUN",cases:cases.length,chargeRows:chargeCount,
  message:"No database connection was opened; record fields were validated only."};
 if(!opts.ackAuthorized||env.RECORDPATH_PRIVATE_INGEST_ENABLED!=="true")
  throw Error("Execution requires explicit source authorization acknowledgment and RECORDPATH_PRIVATE_INGEST_ENABLED=true");
 const url=env.RECORDPATH_SUPABASE_URL,key=env.RECORDPATH_SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!validUrl(url)||!key)throw Error("Private Supabase URL/service-role secret unavailable. Nothing uploaded.");
 // Source batch is never approved simply because the upload succeeded.
 const result=await post("court_source_import_batches",[batch],"source_key",url,key,"id");
 if(result.length!==1||!result[0].id)throw Error("Batch creation was not acknowledged");
 const batchId=result[0].id;
 let uploaded=0;
 for(let offset=0;offset<cases.length;offset+=25){
  const slice=cases.slice(offset,offset+25);
  const payload=slice.map(r=>({...r.caseRecord,batch_id:batchId}));
  const inserted=await post("court_source_case_versions",payload,"batch_id,source_case_key",url,key,
    "id,source_case_key");
  const ids=new Map(inserted.map(r=>[r.source_case_key,r.id]));
  if(ids.size!==slice.length)throw Error("Incomplete private case upsert; stop to prevent mislinked charges");
  const charges=slice.flatMap(r=>{
   const id=ids.get(r.caseRecord.source_case_key);
   if(!id)throw Error("Missing case identifier");
   return r.charges.map(c=>({...c,source_case_version_id:id}));
  });
  for(let i=0;i<charges.length;i+=100)
   await post("court_source_charge_versions",charges.slice(i,i+100),
     "source_case_version_id,source_charge_key",url,key,"id");
  uploaded+=slice.length;
 }
 return {mode:"QUARANTINED",cases:uploaded,chargeRows:chargeCount,
  message:"Private source records staged only. Not verified, not searchable by website visitors, not used for eligibility or filing."};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await run();console.log(JSON.stringify(result));}
 catch(error){console.error("Private court import not completed:",String(error?.message||error).slice(0,230));process.exitCode=1;}
}
