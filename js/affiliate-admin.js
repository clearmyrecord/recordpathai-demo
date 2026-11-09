(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const money = cents => "$"+(Number(cents||0)/100).toFixed(2);
  const status = text => { $("opsStatus").textContent=text; };
  const elem = (tag,text,className) => {
    const node=document.createElement(tag);
    if(text!==undefined) node.textContent=String(text);
    if(className)node.className=className;
    return node;
  };
  const key=()=>String($("opsKey").value||"").trim();
  async function api(path,opts={}){
    if(key().length<32)throw new Error("Enter the existing operations key.");
    return RecordWatchMessageProvider.apiFetch(path,{
      ...opts,
      headers:{...(opts.headers||{}),"x-recordpath-operations-key":key()}
    });
  }
  function button(label,run){
    const el=elem("button",label,"btn secondary");
    el.type="button";
    el.addEventListener("click",async()=>{
      el.disabled=true;
      status("Reviewing request…");
      try{await run();await refresh();}catch(e){status(e.message||"Operation rejected.");}
      finally{el.disabled=false;}
    });
    return el;
  }
  async function partnerAction(partner,action){
    const info=partner.display_name+" ("+partner.partner_type+")";
    const approvals={
      approve:"Confirm that you reviewed this partner's identity, audience, advertising disclosure, potential government conflicts, and attorney-ethics restrictions. Approve "+info+"?",
      tax_clear:"Confirm Stripe ACH recipient verification, identity and tax-onboarding requirements have been reviewed for "+info+"? This enables owner-reviewed payouts, not automatic payouts.",
      suspend:"Suspend this affiliate and pause future transfers for "+info+"?",
      reject:"Reject this application from "+info+"?",
      pause:"Pause future transfers for "+info+"?"
    };
    if(!window.confirm(approvals[action]||"Proceed?"))return;
    const payload={partner_id:partner.id,action};
    if(action==="approve")Object.assign(payload,{
      conflicts_reviewed:true,disclosures_reviewed:true,government_referrals_prohibited:true
    });
    if(action==="tax_clear")Object.assign(payload,{
      tax_reviewed:true,identity_reviewed:true
    });
    await api("/api/affiliates/ops/partner",{method:"POST",body:payload});
    status("Partner "+action+" recorded.");
  }
  function renderPartners(items){
    const root=$("opsPartners");root.replaceChildren();
    if(!items.length){root.append(elem("p","No partner applications found."));return;}
    for(const p of items){
      const card=elem("article",undefined,"ops-item");
      card.append(elem("h3",p.display_name+" — "+p.status));
      card.append(elem("p","Category: "+p.partner_type+" · Eligible commissions: "+money(p.eligible_cents)));
      if(p.website)card.append(elem("p","Website: "+p.website));
      if(p.audience_description)card.append(elem("p","Audience: "+p.audience_description,"ops-small"));
      card.append(elem("p","Stripe recipient: "+(p.has_recipient?"Registered":"Not registered")+
        " · Tax review: "+(p.tax_reviewed_at?"Approved":"Pending")+
        " · Payouts: "+(p.payouts_paused?"Paused":"Owner review enabled"),"ops-small"));
      const controls=elem("div",undefined,"ops-actions");
      if(p.status==="pending"){
        controls.append(button("Approve after compliance review",()=>partnerAction(p,"approve")));
        controls.append(button("Reject",()=>partnerAction(p,"reject")));
      }
      if(p.status==="approved"){
        if(p.has_recipient&&!p.tax_reviewed_at)
          controls.append(button("Clear identity and tax review",()=>partnerAction(p,"tax_clear")));
        if(p.payout_ready)
          controls.append(button("Prepare payout (no transfer yet)",async()=>{
            if(!window.confirm("Prepare an owner-confirmation-required Stripe payout for "+
              p.display_name+" totaling "+money(p.eligible_cents)+"? No funds move yet."))return;
            const r=await api("/api/affiliates/ops/prepare",{method:"POST",body:{partner_id:p.id}});
            status("Payout batch "+r.batch_id+" prepared for manual confirmation.");
          }));
        controls.append(button("Pause payouts",()=>partnerAction(p,"pause")));
        controls.append(button("Suspend partner",()=>partnerAction(p,"suspend")));
      }
      card.append(controls);root.append(card);
    }
  }
  function renderBatches(items){
    const root=$("opsBatches");root.replaceChildren();
    if(!items.length){root.append(elem("p","No payout batches yet."));return;}
    for(const batch of items){
      const card=elem("article",undefined,"ops-item");
      card.append(elem("h3",money(batch.amount_cents)+" — "+batch.status));
      card.append(elem("p","Batch "+batch.id+" · Stripe state: "+(batch.stripe_status||"Not submitted"),"ops-small"));
      const controls=elem("div",undefined,"ops-actions");
      controls.append(button("Reconcile with Stripe",async()=>{
        const r=await api("/api/affiliates/ops/reconcile",{method:"POST",
          body:{batch_id:batch.id}});
        status("Verified Stripe status: "+r.stripe_status+"; internal ledger: "+r.ledger_status);
      }));
      if(batch.status==="requires_confirmation"){
        controls.append(button("Confirm and send payout",async()=>{
          const exact=String(batch.amount_cents);
          const typed=window.prompt("This action transfers real money. To confirm "+
            money(batch.amount_cents)+" to this affiliate, type the amount in cents: "+exact);
          if(typed!==exact)throw new Error("Payout confirmation canceled or amount incorrect.");
          if(!window.confirm("FINAL CONFIRMATION: Send "+money(batch.amount_cents)+
            " from the RecordPathAI Stripe financial account now?"))return;
          const result=await api("/api/affiliates/ops/confirm",{method:"POST",body:{
            batch_id:batch.id,confirm_payout:true,confirmed_amount_cents:Number(exact)
          }});
          status("Stripe payout initiated: "+result.status+". Bank arrival is not guaranteed.");
        }));
      }
      card.append(controls);root.append(card);
    }
  }
  async function refresh(){
    status("Checking owner authentication and affiliate ledger…");
    const data=await api("/api/affiliates/ops/queue");
    $("opsPartnersPanel").hidden=false;
    $("opsBatchesPanel").hidden=false;
    renderPartners(Array.isArray(data.partners)?data.partners:[]);
    renderBatches(Array.isArray(data.batches)?data.batches:[]);
    status("Affiliate operations loaded. Automatic transfers remain disabled.");
  }
  document.addEventListener("DOMContentLoaded",()=>{
    $("opsLoad").addEventListener("click",()=>refresh().catch(e=>{
      $("opsPartnersPanel").hidden=true;
      $("opsBatchesPanel").hidden=true;
      status(e.message||"Owner authorization failed.");
    }));
  });
}());
