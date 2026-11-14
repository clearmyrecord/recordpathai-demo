// Cloud Run Job: invoke the server-authorized RecordWatch Premium daily worker.
const ENDPOINT = "https://recordpathai.com/api/operator/recordwatch/run-alerts";
export async function invokePremiumAlertRun({key=process.env.RECORDWATCH_ALERTS_SCHEDULER_KEY,
  fetchFn=fetch,signal=AbortSignal.timeout(240_000)}={}) {
  if(typeof key!=="string"||key.trim().length<32)throw new Error("Protected RecordWatch scheduler key is missing");
  const headerKey=key.trim();
  const r=await fetchFn(ENDPOINT,{method:"POST",
    headers:{"x-recordwatch-alerts-key":headerKey,"content-type":"application/json"},
    body:"{}",signal});
  if(!r.ok)throw new Error("RecordWatch scheduler rejected the run (HTTP "+r.status+")");
  const j=await r.json();
  if(j.ok!==true)throw new Error("RecordWatch scheduler returned an invalid acknowledgement");
  const fields=["cases_checked","provider_accepted","already_reserved","skipped","failed_review"];
  if(!fields.every(k=>Number.isSafeInteger(j[k])&&j[k]>=0))
    throw new Error("RecordWatch scheduler response is missing required counters");
  if(j.more_cases_possible===true)
    throw new Error("RecordWatch scheduler reached its 1,000-case page limit; pagination required");
  return Object.fromEntries(fields.map(k=>[k,j[k]]));
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  try{console.log("RecordWatch daily run completed:",JSON.stringify(await invokePremiumAlertRun()));}
  catch(e){console.error("RecordWatch daily run requires operator review:",e?.message||"unknown error");process.exitCode=1;}
}
