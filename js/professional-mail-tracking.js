const labels={not_started:"Not submitted for mailing",unsupported:"Mailing route requires review",approved:"Approved — awaiting payment",paid_hold:"Payment recorded — awaiting mailing",dispatch_claimed:"Mailing being reconciled — do not pay again",submitted_to_lob:"Accepted by Lob"};
const paymentLabels={not_recorded:"No verified payment recorded",checkout_created:"Checkout created; payment not confirmed",verified_recorded:"Verified payment recorded"};
const add=(parent,tag,value)=>{const el=document.createElement(tag);el.textContent=value;parent.append(el);return el};
function formattedTime(v){return v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString():"Not available";}
export function mailingTrackingLabel(data){
 if(!data)return "Status unavailable";
 if(data.status==="submitted_to_lob"&&data.providerStatus==="checked"){
  if(data.latestEvent?.name)return "Lob: "+data.latestEvent.name;
  if(data.renderStatus==="failed")return "Lob rendering failed — review required";
  if(data.renderStatus==="rendered")return "Lob rendered — awaiting postal scan";
 }
 return labels[data.status]||"Status unavailable";
}
export function mountMailTracking({parent,badge,row,org,session,current}){
 const section=add(parent,"section","");section.className="professional-review-group professional-mail-tracking";
 add(section,"h4","Mailing & delivery tracking");
 const status=add(section,"p","Checking saved mailing status…");status.setAttribute("role","status");
 const info=add(section,"div","");info.className="professional-mail-tracking-info";
 const history=add(section,"div","");
 const note=add(section,"p","Mail delivery is not confirmation that the court filed or approved an application.");note.className="professional-review-note";
 const refresh=add(section,"button","Refresh mailing status");refresh.type="button";refresh.className="btn secondary";
 function render(data){
  if(!current()||!section.isConnected)return;
  const label=mailingTrackingLabel(data);badge.textContent="Mailing: "+label;badge.className="case-status-badge "+(data?.providerStatus==="checked"&&data.latestEvent?.name==="Delivered"?"generated":"not-screened");
  status.textContent=label;info.replaceChildren();history.replaceChildren();
  if(!data)return;
  const field=(key,value)=>{const line=add(info,"div","");add(line,"strong",key);add(line,"span",value);};
  field("Payment",paymentLabels[data.payment]||"Unavailable");
  if(data.paymentCheck)field("Current Stripe check",data.paymentCheck==="verified"?"Verified":data.paymentCheck==="not_verified"?"Payment not currently verified — contact support":"Unable to verify now");
  if(data.reviewedAt)field("Independent review recorded",formattedTime(data.reviewedAt));
  if(data.attemptedAt)field("Dispatch attempt recorded",formattedTime(data.attemptedAt));
  if(data.lobReference)field("Lob reference",data.lobReference);
  if(data.expectedDeliveryDate)field("Estimated delivery",data.expectedDeliveryDate);
  if(data.lobReference)field("Postal tracking",data.providerStatus==="checked"?"Checked against Lob":data.providerStatus==="unavailable"?"Provider status unavailable — refresh later":"Refresh for current provider events");
  if(data.providerEvents?.length){add(history,"h5","Verified Lob tracking events");const list=add(history,"ol","");for(const event of [...data.providerEvents].reverse()){add(list,"li",event.name+" · "+formattedTime(event.time));}}
 }
 let request=0,detailStarted=false;
 async function load(){
  if(!current()||!section.isConnected||refresh.disabled)return;
  const n=++request;detailStarted=true;refresh.disabled=true;status.textContent="Checking Stripe and Lob status…";
  try{
   const token=await session();if(!token||!current())return;
   const response=await fetch("/api/professional/mail-tracking/"+encodeURIComponent(row.id)+"?"+new URLSearchParams({org}),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json();if(!response.ok||!data.ok||data.case?.caseId!==row.id)throw Error("Unavailable");
   if(n===request)render(data.case);
  }catch{if(n===request&&current()){render(null);status.textContent="Mailing status unavailable. Do not make another payment to refresh tracking.";}}
  finally{refresh.disabled=false;}
 }
 refresh.addEventListener("click",load);
 parent.closest("details")?.addEventListener("toggle",()=>{if(parent.closest("details").open&&!detailStarted)void load();});
 return {id:row.id,summary:data=>{if(!detailStarted)render(data);}};
}
export async function loadMailTrackingSummaries({cards,org,session,current}){
 if(!cards.length||!current())return;
 try{
  const token=await session();if(!token||!current())return;
  for(let i=0;i<cards.length;i+=50){
   if(!current())return;
   const batch=cards.slice(i,i+50);
   const response=await fetch("/api/professional/mail-tracking?"+new URLSearchParams({org,ids:batch.map(c=>c.id).join(",")}),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json();if(!response.ok||!data.ok||!Array.isArray(data.cases))throw Error("Unavailable");
   if(!current())return;
   for(const card of batch)card.summary(data.cases.find(c=>c.caseId===card.id)||null);
  }
 }catch{if(current())for(const card of cards)card.summary(null);}
}
