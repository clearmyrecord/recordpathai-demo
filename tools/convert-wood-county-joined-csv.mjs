#!/usr/bin/env node
/**
 * Wood County "Joined Charges" CSV -> private, quarantined court JSONL.
 * No source records, names, DOBs or aliases are committed or logged.
 * The exported annual DAT rows are NOT unique charges or legal outcomes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const COLUMNS=[
 "Report Year","Case ID","Defendant Name","Offense Description",
 "Offense Degree","Charge Code / Statute","Charge Number",
 "Charge Status (Source)","Charge Status Date","Disposition Date",
 "Termination Date","Charge Source Line","Source DAT File",
 "Original Charge Code (Before Audit)","Statute Code Audit",
 "Sealing screen color (current)"
];
function csvRows(s){
 const rows=[];let row=[],cell="",quoted=false;
 s=String(s).replace(/^\uFEFF/,"");
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quoted){
   if(c==='"'&&s[i+1]==='"'){cell+='"';i++;}
   else if(c==='"')quoted=false;
   else cell+=c;
  }else if(c==='"'&&cell==="")quoted=true;
  else if(c===","){row.push(cell);cell="";}
  else if(c==="\r"||c==="\n"){
   if(c==="\r"&&s[i+1]==="\n")i++;
   row.push(cell);rows.push(row);row=[];cell="";
  }else cell+=c;
 }
 if(quoted)throw Error("Unterminated quoted CSV field");
 if(row.length||cell){row.push(cell);rows.push(row);}
 return rows;
}
function clean(v,max=200){
 return String(v??"").trim().replace(/[\u0000-\u001f\u007f]/g," ").slice(0,max);
}
function normal(v){return clean(v).toUpperCase().replace(/\s+/g," ");}
function stableHash(v){return createHash("sha256").update(v).digest("hex").slice(0,24);}
function calendar(v){
 const s=clean(v,32);
 if(!s)return null;
 let iso=s;
 const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
 if(m)iso=`${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw Error("Invalid source date format");
 const d=new Date(iso+"T00:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)
  throw Error("Invalid source calendar date");
 return iso;
}
function statColor(v){
 const m=clean(v,100).match(/^(Blue|Green|Red|Yellow)\b/i);
 return m?m[1].toLowerCase():null;
}
export function convertWoodRows(rows){
 if(!Array.isArray(rows)||rows.length<2)throw Error("Empty Wood County export");
 const headers=rows[0].map(x=>clean(x,200));
 const indices=Object.fromEntries(COLUMNS.map(h=>[h,headers.indexOf(h)]));
 const missing=COLUMNS.filter(h=>indices[h]<0);
 if(missing.length)throw Error("Missing Wood County columns: "+missing.join(", "));
 const cases=new Map(),caseNames=new Map();
 let rawRows=0,duplicates=0,sourceCaseConflicts=0;
 for(let i=1;i<rows.length;i++){
  const row=rows[i];
  if(!row.some(v=>clean(v)!==""))continue;
  rawRows++;
  const get=h=>clean(row[indices[h]]);
  const caseNumber=normal(get("Case ID"));
  const defendantName=clean(get("Defendant Name"),180);
  const chargeName=clean(get("Offense Description"),200);
  const code=clean(get("Charge Code / Statute"),100);
  const count=clean(get("Charge Number"),50);
  if(!caseNumber||!defendantName||(!chargeName&&!code))
   throw Error("Required case, defendant or charge field missing at CSV row "+(i+1));
  const yearText=get("Report Year"),year=Number(yearText);
  if(!/^\d{4}$/.test(yearText)||year<1900||year>2200)
   throw Error("Invalid annual report year at CSV row "+(i+1));
  const nameKey=normal(defendantName);
  if(!caseNames.has(caseNumber))caseNames.set(caseNumber,new Set());
  caseNames.get(caseNumber).add(nameKey);
  const caseKey="OH-WOOD:"+caseNumber+":"+stableHash(nameKey);
  if(!cases.has(caseKey))cases.set(caseKey,{
   sourceCaseKey:caseKey,state:"OH",countyFips:"39173",
   courtName:"Wood County Court of Common Pleas",
   caseNumber,defendantName,charges:new Map()
  });
  const target=cases.get(caseKey);
  // Preserve distinct statute/description combinations; amended counts are
  // candidates for docket review, NOT blindly merged into one final offense.
  const chargeKey=(count||"unknown")+":"+stableHash(normal(code)+"|"+normal(chargeName));
  const file=get("Source DAT File"),line=get("Charge Source Line");
  const c={
   sourceChargeKey:chargeKey,
   originalCharge:chargeName||null,originalStatute:code||null,
   finalCharge:null,finalStatute:null,finalDisposition:null,
   offenseLevel:get("Offense Degree")||null,
   dispositionDate:calendar(get("Disposition Date")),
   terminationDate:calendar(get("Termination Date")),
   reportedChargeStatus:get("Charge Status (Source)")||null,
   reportedChargeStatusDate:calendar(get("Charge Status Date")),
   sourceReportYear:year,
   sourceStatuteRaw:get("Original Charge Code (Before Audit)")||null,
   sourceStatuteAudit:get("Statute Code Audit")||null,
   sourceScreenColor:statColor(get("Sealing screen color (current)")),
   sourceLineReference:[file,line].filter(Boolean).join(":").slice(0,100)||null
  };
  const prev=target.charges.get(chargeKey);
  if(prev){
   duplicates++;
   // Most recent annual report takes precedence. Where two source entries
   // have the same report year, prefer the entry with more observed fields.
   const score=x=>[x.reportedChargeStatus,x.reportedChargeStatusDate,
    x.dispositionDate,x.terminationDate].filter(Boolean).length;
   if(year>prev.sourceReportYear||(year===prev.sourceReportYear&&score(c)>score(prev)))
    target.charges.set(chargeKey,c);
  }else target.charges.set(chargeKey,c);
 }
 for(const names of caseNames.values())if(names.size>1)sourceCaseConflicts++;
 const result=[...cases.values()].sort((a,b)=>a.sourceCaseKey.localeCompare(b.sourceCaseKey))
  .map(x=>({...x,charges:[...x.charges.values()].sort((a,b)=>
   a.sourceChargeKey.localeCompare(b.sourceChargeKey))}));
 for(const c of result)if(c.charges.length>100)
  throw Error("Case exceeds protected importer limit; requires operator review");
 return {cases:result,stats:{
  rawChargeRows:rawRows,caseGroups:result.length,
  provisionalChargeGroups:result.reduce((n,c)=>n+c.charges.length,0),
  repeatedExportRows:duplicates,caseIdsWithMultipleDefendantNames:sourceCaseConflicts,
  legalEligibilityDeterminations:0
 }};
}
function insideRepo(p){return p===repoRoot||p.startsWith(repoRoot+path.sep);}
export async function run(argv=process.argv.slice(2)){
 const opt={};
 for(const a of argv){
  const m=a.match(/^--(input|output|expect-rows)=(.+)$/);
  if(!m)throw Error("Usage: --input=/private/joined.csv --output=/private/wood.jsonl [--expect-rows=54548]");
  opt[m[1]]=m[2];
 }
 if(!opt.input||!opt.output)throw Error("Input and output paths required");
 const input=await fs.realpath(opt.input);
 const outDir=await fs.realpath(path.dirname(path.resolve(opt.output)));
 const output=path.join(outDir,path.basename(opt.output));
 if(insideRepo(input)||insideRepo(output))throw Error("Private export paths must be outside the public repository");
 if(path.extname(input).toLowerCase()!==".csv"||path.extname(output).toLowerCase()!==".jsonl")
  throw Error("Expected CSV input and JSONL output");
 const info=await fs.stat(input);
 if(!info.size||info.size>150*1024*1024)throw Error("Source missing or too large");
 const converted=convertWoodRows(csvRows(await fs.readFile(input,"utf8")));
 if(opt["expect-rows"]&&converted.stats.rawChargeRows!==Number(opt["expect-rows"]))
  throw Error("Source row-count reconciliation failed; no private export written");
 // Atomic exclusive output creation; never overwrite an earlier private file.
 const data=converted.cases.map(c=>JSON.stringify(c)).join("\n")+"\n";
 await fs.writeFile(output,data,{encoding:"utf8",mode:0o600,flag:"wx"});
 return {...converted.stats,mode:"PRIVATE_JSONL_CREATED",databaseRowsWritten:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await run()));}
 catch(e){console.error("Wood County conversion failed:",String(e.message).slice(0,220));process.exitCode=1;}
}
