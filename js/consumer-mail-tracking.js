(function(){
 "use strict";
 const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 const add=(parent,tag,value)=>{const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;};
 const formatted=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString():"Not available";
 const states={not_paid:"Not submitted for mailing",paid_hold:"Payment recorded — awaiting mailing",ready_for_dispatch:"Awaiting authorized mailing",submitted_to_lob:"Accepted by Lob",delivered:"Delivery recorded",manual_filing:"Manual filing",failed:"Needs support review",cancelled:"Cancelled — needs review"};
 const payment={recorded:"Payment recorded",verified:"Current Stripe payment verified",not_verified:"Payment not currently verified — contact support",unavailable:"Current payment verification unavailable",not_recorded:"No verified payment recorded"};
 function label(data){
  if(!data)return "Status unavailable";
  const t=data.mailing_tracking||{};
  if(t.providerStatus==="checked"){
   if(t.latestEvent?.name)return "Lob: "+t.latestEvent.name;
   if(t.renderStatus==="failed")return "Lob rendering failed — review required";
   if(t.renderStatus==="rendered")return "Lob rendered — awaiting postal scan";
  }
  if(data.fulfillment_method==="digital_only")return "Digital application — no mailing";
  if(data.status==="not_paid"&&data.independently_reviewed)return "Approved — awaiting payment";
  return states[data.status]||"Status unavailable";
 }
 function render(target,data){
  target.replaceChildren();
  if(!data){add(target,"p","Mailing status unavailable. Do not purchase another packet to refresh tracking.");return;}
  const t=data.mailing_tracking||{};
  const details=add(target,"div","");details.className="consumer-mail-tracking-grid";
  const field=(k,v)=>{const el=add(details,"div","");add(el,"strong",k);add(el,"span",v);};
  field("Payment",payment[t.paymentCheck]||"Unavailable");
  if(t.lobReference)field("Lob reference",t.lobReference);
  if(t.expectedDeliveryDate)field("Estimated delivery",t.expectedDeliveryDate);
  if(t.lobReference)field("Postal tracking",t.providerStatus==="checked"?"Checked against Lob":t.providerStatus==="unavailable"?"Provider status unavailable":"Refresh for current provider events");
  if(data.last_updated_at)field("Saved order updated",formatted(data.last_updated_at));
  if(Array.isArray(data.steps)&&data.steps.length){
   const steps=add(target,"div","");steps.className="recordwatch-fulfillment-steps";
   for(const stage of data.steps){
    const item=add(steps,"div","");item.className="recordwatch-fulfillment-stage "+(["complete","attention","pending"].includes(stage.state)?stage.state:"pending");
    add(item,"strong",stage.label+" · "+(stage.state==="complete"?"Recorded":stage.state==="attention"?"Needs attention":"Pending"));
    add(item,"span",stage.description||"Status unavailable");
   }
  }
  if(t.providerEvents?.length){add(target,"h4","Verified Lob tracking events");const list=add(target,"ol","");for(const event of [...t.providerEvents].reverse())add(list,"li",event.name+" · "+formatted(event.time));}
  add(target,"p","Postal delivery is not confirmation of court filing or record relief. A Lob reference is not a USPS tracking number.").className="muted";
 }
 let generation=0;
 async function session(){
  const client=await window.RecordPathSupabase.getClient();
  const r=await client.auth.getSession();
  const s=r.data?.session;
  if(!s?.access_token||!s.user?.id)throw Error("Sign in required");
  return s;
 }
 async function fetchStatus(id,live,s){
  const r=await fetch("/api/packet/filing-status?case_id="+encodeURIComponent(id)+(live?"&live=1":""),{headers:{Authorization:"Bearer "+s.access_token},cache:"no-store"});
  const data=await r.json();if(!r.ok||data.ok!==true||data.case_id!==id)throw Error("Unavailable");return data;
 }
 function mountCards(container){
  if(!container)return;
  const seq=generation;
  const cards=[];
  for(const slot of container.querySelectorAll("[data-consumer-mail-tracking]")){
   if(slot.dataset.trackingMounted==="1")continue;
   const id=slot.dataset.consumerMailTracking;if(!uuid(id))continue;
   slot.dataset.trackingMounted="1";slot.className="consumer-mail-tracking";
   const badge=add(slot,"p","Mailing: Checking saved status…");badge.className="case-status-badge not-screened";badge.setAttribute("role","status");
   const panel=add(slot,"details","");add(panel,"summary","Mailing & delivery tracking");
   const status=add(panel,"p","Loading saved filing status…");status.setAttribute("role","status");
   const content=add(panel,"div","");
   const refresh=add(panel,"button","Refresh mailing status");refresh.type="button";refresh.className="btn secondary";
   let request=0,opened=false;
   const current=()=>seq===generation&&slot.isConnected&&container.contains(slot);
   function apply(data){
    if(!current())return;const message=label(data);badge.textContent="Mailing: "+message;status.textContent=message;render(content,data);
   }
   async function load(live,auth){
    if(!current())return;
    if(!live&&opened)return;
    const n=++request;if(live){opened=true;refresh.disabled=true;status.textContent="Checking Stripe and Lob…";}
    try{
     const s=auth||await session();if(!current()||n!==request)return;
     const data=await fetchStatus(id,live,s);
     const now=await session();
     if(current()&&n===request&&now.user.id===s.user.id)apply(data);
    }catch{if(current()&&n===request)apply(null);}
    finally{if(live&&n===request)refresh.disabled=false;}
   }
   refresh.addEventListener("click",()=>{if(!refresh.disabled)void load(true);});
   panel.addEventListener("toggle",()=>{if(panel.open&&!opened&&!refresh.disabled)void load(true);});
   cards.push({load,current});
  }
  if(!cards.length)return;
  // Bounded concurrency for summary-only reads; no provider calls for closed cards.
  void (async()=>{try{
   const s=await session();let index=0;
   await Promise.all(Array.from({length:Math.min(4,cards.length)},async()=>{while(index<cards.length&&seq===generation){const card=cards[index++];if(card.current())await card.load(false,s);}}));
  }catch{for(const card of cards)if(card.current())void card.load(false);}})();
 }
 document.addEventListener("recordpath:auth-change",()=>{generation++;for(const slot of document.querySelectorAll("[data-consumer-mail-tracking]")){slot.replaceChildren();delete slot.dataset.trackingMounted;}});
 window.RecordPathConsumerMailTracking={mountCards,label,render};
})();