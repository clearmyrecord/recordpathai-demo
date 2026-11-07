import {STATES,createSummary,countyStatus,visibleCounties} from "./wave1-ops-core.mjs";
const id=name=>document.getElementById(name);
const set=(name,value)=>{const x=id(name);if(x)x.textContent=String(value);};
async function loadJson(url){
 const r=await fetch(url,{cache:"no-store",credentials:"same-origin"});
 if(!r.ok)throw Error("Could not load published county coverage: "+url);
 return r.json();
}
const PAGE_SIZE=35;
let catalog=[],ledger={counties:{},sources:[]},registry=[],page=0,selected=null;
function cell(row,value){
 const td=document.createElement("td");td.textContent=String(value);row.append(td);return td;
}
function a(text,url){
 const el=document.createElement("a");el.textContent=text;el.href=url;
 el.target="_blank";el.rel="noopener noreferrer";return el;
}
function summary(){
 const report=createSummary(catalog,ledger,registry);
 set("countyTotal",report.counties+" / 512");
 set("countySearched",report.attempted+" / 512");
 set("sourceCount",report.sources);
 set("activeCount",report.activeMappings);
 const rows=id("stateRows");rows.replaceChildren();
 report.rows.forEach(z=>{
  const tr=document.createElement("tr");
  cell(tr,STATES[z.state]);cell(tr,z.total);cell(tr,z.attempted);
  cell(tr,z.remaining);cell(tr,z.sourceLeads);cell(tr,z.activeMappings);
  rows.append(tr);
 });
}
function filterRows(){
 return visibleCounties(catalog,{state:id("stateFilter").value,
   query:id("countyQuery").value,status:id("statusFilter").value,ledger});
}
function renderRows(){
 const rows=filterRows();const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 page=Math.min(page,totalPages-1);
 const showing=rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 const list=id("countyRows");list.replaceChildren();
 showing.forEach(c=>{
  const info=countyStatus(c,ledger,registry);
  const tr=document.createElement("tr");tr.dataset.id=c.countyFips;
  cell(tr,c.county);cell(tr,c.state);cell(tr,c.countyFips);
  const status=info.active.length?"active_verified_mapping":info.status;
  cell(tr,status.replaceAll("_"," "));
  cell(tr,info.candidates.length);
  tr.addEventListener("click",()=>renderSelected(c));
  list.append(tr);
 });
 set("paginationLabel",rows.length?(`${page*PAGE_SIZE+1}–${page*PAGE_SIZE+showing.length} of ${rows.length}`):"No matches");
 id("previousPage").disabled=page===0;
 id("nextPage").disabled=page>=totalPages-1;
}
function detail(label,value,parent){
 const p=document.createElement("p");
 const b=document.createElement("strong");b.textContent=label+": ";
 p.append(b,document.createTextNode(String(value||"Not yet verified")));
 parent.append(p);
}
function renderSelected(c){
 selected=c;const info=countyStatus(c,ledger,registry);
 const text=id("countyDetailText");text.replaceChildren();
 const title=document.createElement("h3");
 title.textContent=c.county+", "+STATES[c.state]+" · FIPS "+c.countyFips;
 text.append(title);
 detail("Discovery stage",info.status.replaceAll("_"," "),text);
 detail("Last searched",info.lastSearchedAt||"No authorized agent search yet",text);
 detail("Verified official court",c.officialCourtVerified?"Verified":"Not yet verified",text);
 detail("Existing seed",c.priority==="seeded"?"Yes — research target only":"No",text);
 const notes=document.createElement("p");notes.textContent=
  "Review official court or agency, filing route, current blank PDF, charges and form version. "
  +"Only a source-reviewed and PDF-fingerprinted file should enter Mapper V7. "
  +"Mapper suggestions are drafts until an authorized reviewer approves them.";
 text.append(notes);
 const active=id("sourceList");active.replaceChildren();
 for(const source of info.candidates){
  const li=document.createElement("li");
  const name=document.createElement("strong");name.textContent=source.title||source.formType||"Form source lead";
  const p=document.createElement("p");p.textContent=
    "Unverified lead • "+(source.formType||"unknown")+" • "+(source.counties?.length||1)+" related counties";
  li.append(name,p);
  if(source.sourceUrl){
   try{
    const url=new URL(source.sourceUrl);
    if(url.protocol==="https:")li.append(a("Inspect source page",url.href));
   }catch{}
  }
  active.append(li);
 }
 for(const template of info.active){
  const li=document.createElement("li");
  const name=document.createElement("strong");name.textContent="Active approved mapping: "+template.formType;
  li.append(name);
  if(/^assets\/forms\/[a-z0-9/_-]+\.pdf$/i.test(template.pdfPath||""))
   li.append(document.createTextNode(" · "),a("View reviewed local PDF","../"+template.pdfPath));
  active.append(li);
 }
 if(!info.candidates.length&&!info.active.length){
  const li=document.createElement("li");
  li.textContent="No official PDF candidates or approved form mappings are recorded for this county.";
  active.append(li);
 }
}
async function main(){
 try{
  [catalog,ledger,registry]=await Promise.all([
    loadJson("../data/wave1-court-catalog.json"),
    loadJson("../data/wave1-agent-progress.json"),
    loadJson("../templates/index.json")
  ]);
  summary();renderRows();
  for(const key of ["stateFilter","statusFilter","countyQuery"])
   id(key).addEventListener(key==="countyQuery"?"input":"change",()=>{page=0;renderRows();});
  id("previousPage").addEventListener("click",()=>{page=Math.max(0,page-1);renderRows();});
  id("nextPage").addEventListener("click",()=>{page++;renderRows();});
 }catch(err){
  const p=document.createElement("p");p.textContent=String(err?.message||"County catalog unavailable");
  p.style.color="#9a241b";id("countyDetails").prepend(p);
 }
}
main();
