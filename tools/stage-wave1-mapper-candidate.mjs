#!/usr/bin/env node
/* From a reviewed Wave 1 source lead + lawfully obtained local blank PDF,
   produce a source-fingerprinted form candidate with V7 auto-map suggestions.
   This is NEVER an approved/active template and NEVER writes to the form index. */
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {prepareLocalCandidate} from "./prepare-form-candidates.mjs";
import {validateCatalog} from "./wave1-agent-core.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const flags=Object.fromEntries(process.argv.slice(2).filter(x=>/^--[^=]+=/.test(x)).map(x=>{
 const i=x.indexOf("=");return [x.slice(2,i),x.slice(i+1)];
}));
const write=process.argv.includes("--write");
const sourceId=flags["source-id"]||"",fips=flags["county-fips"]||"";
function isHttp(s){try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.includes(".");}catch{return false;}}
export async function buildReviewCandidate({sourceId,countyFips,courtType,courtName,
 pdfLocalPath,pdfSourceUrl,ledgerPath,rootPath=root}){
 const catalog=JSON.parse(await fs.readFile(path.join(rootPath,"data/wave1-court-catalog.json"),"utf8"));
 validateCatalog(catalog);
 const county=catalog.find(x=>x.countyFips===countyFips);
 if(!county)throw Error("County FIPS not found in official Wave 1 catalog");
 const ledger=JSON.parse(await fs.readFile(ledgerPath||path.join(rootPath,"data/wave1-agent-progress.json"),"utf8"));
 const lead=(ledger.sources||[]).find(s=>s.id===sourceId);
 if(!lead||!(lead.counties||[]).includes(countyFips))
  throw Error("Source lead and county FIPS association not present in reviewed research snapshot");
 if(lead.approved===true||lead.active===true)
  throw Error("Do not overwrite an already approved source using automated drafts");
 if(!courtType||!courtName||!isHttp(pdfSourceUrl))
  throw Error("An exact court/agency name, court type, and official PDF URL must be supplied for review");
 const manifest=await prepareLocalCandidate({
   state:county.state,county:county.county,courtType,courtName,
   formType:lead.formType||"unknown",
   title:lead.title||"County form candidate",sourceUrl:pdfSourceUrl,
   sourcePageUrl:lead.sourceUrl||pdfSourceUrl,
   localPath:pdfLocalPath,discoveredAt:lead.discoveredAt
  },{repoRoot:rootPath});
 manifest.review.status="pending_review";
 manifest.review.sourceVerified=false;
 manifest.review.mappingApproved=false;
 manifest.review.legalRoutingApproved=false;
 manifest.mapping.status="draft";
 manifest.active=false;
 manifest.source.wave1LeadId=sourceId;
 manifest.source.proposedCoverageCountyFips=[...new Set(lead.counties||[])].sort();
 manifest.source.proposedCoverageRequiresCourtVerification=true;
 manifest.source.notes="Unverified research lead, local PDF fingerprinted, AI field suggestions only. Check official form and court routing before any activation.";
 return manifest;
}
async function main(){
 if(!sourceId||!fips||!flags["court-type"]||!flags["court-name"]||
    !flags.pdf||!flags["pdf-source-url"])
  throw Error("Usage: --source-id=LEAD --county-fips=FIPS --court-type=TYPE --court-name=NAME --pdf=assets/forms/...pdf --pdf-source-url=https://court/...pdf [--ledger=/path/to/reviewed.json] [--write]");
 const candidate=await buildReviewCandidate({
  sourceId,countyFips:fips,courtType:flags["court-type"],courtName:flags["court-name"],
  pdfLocalPath:flags.pdf,pdfSourceUrl:flags["pdf-source-url"],ledgerPath:flags.ledger
 });
 const summary={id:candidate.id,state:candidate.jurisdiction.state,
  county:candidate.jurisdiction.county,sourceLeadId:sourceId,
  suggestedFields:candidate.mapping.suggestions.length,pdfSha256:candidate.pdf.sha256,
  proposedCountyCoverage:candidate.source.proposedCoverageCountyFips.length,
  sourceVerified:false,mappingApproved:false,active:false};
 if(write){
  const output=path.join(root,"admin","form-candidates",candidate.id.toLowerCase()+".json");
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify(candidate,null,2)+"\n",{flag:"wx"});
  summary.reviewManifestPath=path.relative(root,output);
 }
 console.log(JSON.stringify(summary,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(err=>{console.error("Review-only mapper candidate not created:",String(err?.message||err).slice(0,220));process.exitCode=1;});
}
