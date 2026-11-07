#!/usr/bin/env node
// Merge five county research agent outputs into a single human-review snapshot.
// Never writes to the approved form registry or private criminal case index.
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readLedger,mergeAgentOutput,coverageReport,validateCatalog} from "./wave1-agent-core.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")).map(x=>{
  const ix=x.indexOf("=");return [x.slice(2,ix),x.slice(ix+1)];
}));
const directory=path.resolve(root,args.inputs||".wave1-agent-input");
const ledgerPath=path.resolve(root,args.ledger||"data/wave1-agent-progress.json");
const dashboardPath=path.resolve(root,args.dashboard||"docs/wave1-discovery-dashboard.md");
const catalog=JSON.parse(await fs.readFile(path.join(root,"data/wave1-court-catalog.json"),"utf8"));
validateCatalog(catalog);
async function readOptional(p,fallback){
  try{return JSON.parse(await fs.readFile(p,"utf8"));}catch(error){
    if(error.code==="ENOENT")return fallback;
    throw error;
  }
}
const ledger=readLedger(await readOptional(ledgerPath,null));
let outputs=[];
try{
  const files=(await fs.readdir(directory)).filter(x=>/^(NV|TX|FL|AZ|GA)\.json$/.test(x)).sort();
  for(const f of files)outputs.push(JSON.parse(await fs.readFile(path.join(directory,f),"utf8")));
}catch(error){if(error.code!=="ENOENT")throw error;}
const runs=outputs.reduce((n,x)=>n+(x.attempts?.length||0),0);
const merged=runs?mergeAgentOutput(ledger,outputs):ledger;
const report=coverageReport(catalog,merged);
const summary=[
  "# Wave 1 County Discovery — Human Review Dashboard",
  "",
  "**Scope:** official Census county equivalents. This report contains no people's records.",
  "",
  "| State | Cataloged | Searched | Not yet searched |",
  "|---|---:|---:|---:|",
  ...Object.entries(report.states).map(([state,s])=>`| ${state} | ${s.total} | ${s.attempted} | ${s.total-s.attempted} |`),
  `| **Total** | **512** | **${Object.values(report.states).reduce((s,x)=>s+x.attempted,0)}** | **${512-Object.values(report.states).reduce((s,x)=>s+x.attempted,0)}** |`,
  "",
  `**Distinct discovered form/source leads:** ${report.distinctSourceLeads}`,
  `**Leads pending official source verification:** ${report.sourceVerificationRequired}`,
  `**Approved, active forms automatically created:** 0`,
  "",
  "A source lead is not a verified court form. Statewide identical PDFs are deduplicated by canonical URL and form type, while county-specific rules and recipient details remain separate.",
  "",
  "Statuses advance to source verified, mapped, legally reviewed and filing-ready **only through a separate authenticated human-review process**. The discovery agents cannot approve those statuses or trigger live payments, mailings or court filings.",
  ""
].join("\n");
console.log(JSON.stringify({agentOutputs:outputs.length,newAttemptCount:runs,...report},null,2));
if(!runs && args.initialize!=="true"){
  console.log("No authorized search attempts. No progress snapshot was modified.");
}else{
  await fs.mkdir(path.dirname(ledgerPath),{recursive:true});
  await fs.mkdir(path.dirname(dashboardPath),{recursive:true});
  await fs.writeFile(ledgerPath,JSON.stringify(merged,null,2)+"\n");
  await fs.writeFile(dashboardPath,summary);
}
