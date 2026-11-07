/* Convert crawler-discovered and downloaded local PDF copies into V1 form manifests.
   No internet requests, no new downloads, no payments, no legal status changes. */
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import "../js/pdf-auto-map.js";
import "../js/form-pipeline-core.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const helper=globalThis.RecordPathPdfAutoMap;
const pipeline=globalThis.RecordPathFormPipeline;

function safeRelPdf(p){
  if(typeof p!=="string"||!/^assets\/forms\/[a-zA-Z0-9/_-]+\.pdf$/.test(p))
    throw new Error("Form PDF must be an explicitly downloaded local assets/forms/*.pdf");
  return p;
}
export async function prepareLocalCandidate(metadata,{repoRoot=root}={}){
  const rel=safeRelPdf(metadata.localPath);
  const abs=path.resolve(repoRoot,rel);
  const base=await fs.realpath(path.join(repoRoot,"assets","forms"));
  const real=await fs.realpath(abs);
  if(!real.startsWith(base+path.sep))throw new Error("PDF must remain under the assets/forms directory");
  const bytes=await fs.readFile(real);
  if(bytes.length<100||bytes.length>12*1024*1024||bytes.subarray(0,5).toString("ascii")!=="%PDF-")
    throw new Error("Invalid or oversized downloaded PDF");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const doc=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
  try{
    if(doc.numPages<1||doc.numPages>30)throw new Error("Unsupported page count");
    const pages=[];
    for(let n=1;n<=doc.numPages;n++){
      const p=await doc.getPage(n);
      const viewport=p.getViewport({scale:helper.BASE_SCALE});
      const text=await p.getTextContent();
      const items=(text.items||[]).filter(x=>x?.str&&x?.transform).slice(0,1200).map(x=>{
        const xy=viewport.convertToViewportPoint(x.transform[4],x.transform[5]);
        const h=Math.max(7,Math.abs(x.height||x.transform[3]||10)*helper.BASE_SCALE);
        return {str:x.str.slice(0,220),x:xy[0],y:xy[1]-h,
          width:Math.max(0,(x.width||0)*helper.BASE_SCALE),height:h};
      });
      const raw=await p.getAnnotations({intent:"display"});
      const annotations=(raw||[]).filter(a=>Array.isArray(a.rect)).slice(0,300).map(a=>{
        const r=viewport.convertToViewportRectangle(a.rect);
        return {subtype:a.subtype,fieldName:a.fieldName,alternativeText:a.alternativeText,fieldType:a.fieldType,rect:r};
      });
      pages.push({number:n,width:viewport.width,height:viewport.height,items,annotations});
    }
    const analysis=helper.analyzePages(pages);
    const item=pipeline.draftCandidate({
      state:String(metadata.state||"OH").toUpperCase()==="OHIO"?"OH":metadata.state,
      county:metadata.county, courtType:metadata.courtType,
      courtName:metadata.courtName||metadata.court,
      formType:metadata.formType||"unknown",
      title:metadata.formTitle||metadata.title||metadata.formType||"Form candidate",
      sourceUrl:metadata.sourceUrl,sourcePageUrl:metadata.sourcePageUrl,
      pdfPath:rel,sha256,bytes:bytes.length,pageCount:doc.numPages,
      discoveredAt:metadata.discoveredAt||new Date().toISOString(),
      suggestions:analysis.suggestions
    });
    item.mapping.diagnostics=analysis.diagnostics;
    item.mapping.profile=analysis.profile;
    return item;
  } finally {await doc.destroy();}
}
function parseArgs(argv){
  const parsed={write:false,county:null,state:null,limit:25,wood:false};
  for(const s of argv){
    if(s==="--write")parsed.write=true;
    else if(s==="--wood")parsed.wood=true;
    else if(s.startsWith("--county="))parsed.county=s.slice(9).toLowerCase();
    else if(s.startsWith("--state="))parsed.state=s.slice(8).toUpperCase();
    else if(s.startsWith("--limit="))parsed.limit=Number(s.slice(8));
    else throw new Error("Unknown option: "+s);
  }
  if(!Number.isInteger(parsed.limit)||parsed.limit<1||parsed.limit>100)throw new Error("Limit must be 1–100");
  return parsed;
}
export async function runBatch(argv=process.argv.slice(2),{repoRoot=root}={}){
  const args=parseArgs(argv);
  const raw=JSON.parse(await fs.readFile(path.join(repoRoot,"admin","review-queue.json"),"utf8"));
  if(!Array.isArray(raw))throw new Error("Invalid crawler review queue");
  const rows=raw.filter(x=>x&&x.localPath&&typeof x.localPath==="string");
  if(args.wood)rows.push({
    state:"OH",county:"Wood",courtType:"court-of-common-pleas",
    courtName:"Wood County Court of Common Pleas",formType:"sealing-dismissal",
    formTitle:"R.C. 2953.33 dismissal / not guilty / no bill petition",
    localPath:"assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf",
    sourceUrl:"https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/143/Application-for-Sealing-295333-Dismissal-PDF",
    sourcePageUrl:"https://clerkofcourt.co.wood.oh.us/174/Forms",
    discoveredAt:"2026-11-07"
  });
  const filtered=rows.filter(x=>(!args.state||String(x.state).toUpperCase()===args.state) &&
    (!args.county||String(x.county).toLowerCase()===args.county))
    .slice(0,args.limit);
  const summary={scanned:0,drafts:0,skipped:0,written:0,failures:[],mode:args.write?"write":"dry-run"};
  const names=new Set();
  for(const item of filtered){
    summary.scanned++;
    try{
      const manifest=await prepareLocalCandidate(item,{repoRoot});
      if(names.has(manifest.id)){summary.skipped++;continue;}
      names.add(manifest.id);
      summary.drafts++;
      if(args.write){
        const out=path.join(repoRoot,"admin","form-candidates",manifest.id.toLowerCase()+".json");
        await fs.mkdir(path.dirname(out),{recursive:true});
        try {await fs.writeFile(out,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});summary.written++;}
        catch(error){if(error.code==="EEXIST")summary.skipped++;else throw error;}
      }
    }catch(error){summary.failures.push({court:String(item.courtName||item.court||"").slice(0,75),
      reason:String(error.message).slice(0,180)});}
  }
  return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await runBatch();
  console.log(JSON.stringify(result,null,2));
  if(result.failures.length)process.exitCode=1;
}
