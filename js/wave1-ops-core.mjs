/* Public metadata only: report 512 counties, source research, review state,
   and active verified mappings. Never show or query personal court records. */
export const STATE_COUNTS=Object.freeze({NV:17,TX:254,FL:67,AZ:15,GA:159});
export const STATES=Object.freeze({NV:"Nevada",TX:"Texas",FL:"Florida",AZ:"Arizona",GA:"Georgia"});
export function validate(catalog){
 if(!Array.isArray(catalog)||catalog.length!==512)throw Error("Expected exactly 512 Census counties");
 const ids=new Set();
 for(const [state,count] of Object.entries(STATE_COUNTS)){
   const rows=catalog.filter(c=>c.state===state);
   if(rows.length!==count)throw Error(state+" county coverage is incomplete");
 }
 for(const c of catalog){
   if(!/^[0-9]{5}$/.test(c.countyFips||"")||ids.has(c.countyFips))
     throw Error("Invalid or duplicate county FIPS");
   ids.add(c.countyFips);
 }
 return true;
}
export function createSummary(catalog,ledger,registry){
 validate(catalog);
 const counties=(ledger&&typeof ledger.counties==="object"&&!Array.isArray(ledger.counties))?ledger.counties:{};
 const leads=Array.isArray(ledger?.sources)?ledger.sources:[];
 const active=Array.isArray(registry)?registry.filter(x=>x.status==="active"&&STATE_COUNTS[x.state]):[];
 const rows=Object.keys(STATE_COUNTS).map(state=>{
  const scoped=catalog.filter(c=>c.state===state);
  const attempts=scoped.filter(c=>Object.prototype.hasOwnProperty.call(counties,c.countyFips)).length;
  const uniqueLeadIds=new Set(leads.filter(x=>x.counties?.some(id=>scoped.some(c=>c.countyFips===id))).map(x=>x.id));
  return {state,total:scoped.length,attempted:attempts,remaining:scoped.length-attempts,
    sourceLeads:uniqueLeadIds.size,activeMappings:active.filter(x=>x.state===state).length};
 });
 return {counties:512,attempted:rows.reduce((a,x)=>a+x.attempted,0),
  sources:leads.length,activeMappings:active.length,rows};
}
export function countyStatus(county,ledger,registry){
 const progress=ledger?.counties?.[county.countyFips];
 const candidates=(Array.isArray(ledger?.sources)?ledger.sources:[]).filter(s=>(s.counties||[]).includes(county.countyFips));
 const active=Array.isArray(registry)?registry.filter(x=>
   x.status==="active"&&x.state===county.state&&
   String(x.county||"").trim().toLowerCase()===String(county.county||"").trim().toLowerCase()):[];
 return {status:progress?.status||"county_unresearched",lastSearchedAt:progress?.lastSearchedAt||"",
   candidates,active};
}
export function visibleCounties(catalog,{state="",query="",status="",ledger={}}={}){
 const needle=String(query).toLowerCase().trim();
 return catalog.filter(c=>(!state||c.state===state)&&
   (!needle||(c.county+" "+c.countyFips+" "+c.state).toLowerCase().includes(needle))&&
   (!status||countyStatus(c,ledger,[]).status===status));
}
