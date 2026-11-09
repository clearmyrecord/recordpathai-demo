// Owner-controlled Stripe Global Payouts for approved RecordPathAI affiliates.
// Fully separate from customer Stripe Checkout and court-fee custody.
// Requires a restricted Stripe key and private Supabase service-role storage.
// Stripe-hosted account links collect all bank/KYC information.
import {
  STRIPE_GLOBAL_API_VERSION, validatedAffiliateRecipientId,
  restrictedPayoutKeyConfigured, affiliatePayoutAllowed,
  affiliatePayoutAmount, validatePayoutIntent, hasActiveUsAchRecipient,
  shouldRecordPayoutPaid
} from "./affiliate-payouts.js";

export function registerAffiliatePayoutRoutes(app, {
  requireApiUser, requireOperationsKey, supabaseRest,
  affiliateApi, affiliateProgramMigrationReady, packetDatabaseReady, isUuid
}) {
  const minAmount=5000;
  const payoutEnabled=()=>process.env.AFFILIATE_PAYOUTS_LIVE_ENABLED==="true" &&
    restrictedPayoutKeyConfigured(process.env.STRIPE_AFFILIATE_PAYOUT_KEY,true) &&
    /^fa_[A-Za-z0-9]+$/.test(process.env.STRIPE_AFFILIATE_FINANCIAL_ACCOUNT_ID||"");
  const accountId=()=>process.env.STRIPE_AFFILIATE_FINANCIAL_ACCOUNT_ID||"";
  async function migrationReady(){
    if(!packetDatabaseReady()||!await affiliateProgramMigrationReady())return false;
    try{
      const r=await supabaseRest("affiliate_program_migrations",{
        query:"?id=eq.20261109030000_affiliate_payouts&select=id&limit=1"
      });
      return Array.isArray(r)&&r.length===1;
    }catch{return false;}
  }
  async function stripeV2(method,path,body,idempotency){
    const key=process.env.STRIPE_AFFILIATE_PAYOUT_KEY||"";
    if(!payoutEnabled())throw new Error("Global payouts require live restricted-key configuration.");
    if(!/^\/v2\/[A-Za-z0-9/_?=.&%[\]-]+$/.test(path))
      throw new Error("Invalid payout API path");
    const headers={
      Authorization:"Bearer "+key,
      "Stripe-Version":STRIPE_GLOBAL_API_VERSION,
      "Content-Type":"application/json"
    };
    if(idempotency)headers["Idempotency-Key"]=idempotency;
    const response=await fetch("https://api.stripe.com"+path,{
      method,headers,body:body===undefined?undefined:JSON.stringify(body),
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok){
      // Never echo Stripe's full error or key into public responses.
      console.warn("Affiliate Stripe request failed",method,response.status);
      throw new Error("Stripe payout service unavailable ("+response.status+").");
    }
    return response.json();
  }
  const first=rows=>Array.isArray(rows)?rows[0]||null:null;
  const loadPartner=async id=>first(await supabaseRest("affiliate_partners",{
    query:"?id=eq."+encodeURIComponent(id)+"&limit=1"
  }));
  const loadMyPartner=async user=>first(await supabaseRest("affiliate_partners",{
    query:"?user_id=eq."+encodeURIComponent(user.id)+"&limit=1"
  }));
  const loadBatch=async id=>first(await supabaseRest("affiliate_payout_batches",{
    query:"?id=eq."+encodeURIComponent(id)+"&limit=1"
  }));
  async function loadCommissions(partnerId){
    const rows=await supabaseRest("affiliate_commissions",{
      query:"?partner_id=eq."+encodeURIComponent(partnerId)+
        "&select=id,commission_cents,status,available_after,payout_batch_id,paid_at"
    });
    return Array.isArray(rows)?rows:[];
  }
  async function recipientAccount(id){
    if(!validatedAffiliateRecipientId(id))throw new Error("Recipient ID not verified");
    const include="?include%5B%5D=identity&include%5B%5D=configuration.recipient&include%5B%5D=defaults";
    const acct=await stripeV2("GET","/v2/core/accounts/"+id+include);
    if(acct.id!==id||acct.livemode!==true)
      throw new Error("Recipient account does not match live Stripe.");
    return acct;
  }
  async function approvedRecipient(partner){
    if(!partner||partner.status!=="approved"||!partner.compliance_approved_at)
      throw new Error("Only compliance-approved partners may register payouts.");
    const acct=await recipientAccount(partner.stripe_recipient_account_id);
    if(!hasActiveUsAchRecipient(acct))
      throw new Error("Stripe has not completed ACH recipient verification.");
    return acct;
  }
  async function requireOwner(req,res){
    if(!requireOperationsKey(req,res))return null;
    const user=await requireApiUser(req,res);
    if(!user)return null;
    const owner=process.env.AFFILIATE_OWNER_USER_ID||"";
    if(!isUuid(owner)||user.id!==owner){
      res.status(403).json({ok:false,error:"Affiliate owner permission required."});
      return null;
    }
    return user;
  }
  function privateResponse(res,data){
    res.setHeader("Cache-Control","no-store, private");
    return res.json(data);
  }
  // Partner-facing: no bank details in our application, only a Stripe-hosted URL.
  app.post("/api/affiliates/payout-onboard",affiliateApi(async(req,res)=>{
    const user=await requireApiUser(req,res);
    if(!user)return;
    if(!await migrationReady()||!payoutEnabled())
      return res.status(503).json({ok:false,error:"Affiliate payout enrollment is not yet enabled."});
    const partner=await loadMyPartner(user);
    if(!partner||partner.status!=="approved"||!partner.compliance_approved_at)
      return res.status(403).json({ok:false,error:"Affiliate approval required."});
    if(!user.email||!String(user.email).includes("@"))
      return res.status(400).json({ok:false,error:"A verified account email is required."});
    let recipient=partner.stripe_recipient_account_id;
    if(!recipient){
      const entityType=String(req.body?.entity_type||"");
      if(!["individual","company"].includes(entityType))
        return res.status(400).json({ok:false,error:"Select individual or organization."});
      const created=await stripeV2("POST","/v2/core/accounts",{
        contact_email:user.email,display_name:partner.display_name,
        identity:{country:"US",entity_type:entityType},
        configuration:{recipient:{capabilities:{bank_accounts:{ach:{requested:true}}}}},
        include:["configuration.recipient","identity","requirements"]
      },"recordpath-affiliate-recipient-"+partner.id);
      if(!validatedAffiliateRecipientId(created.id)||created.livemode!==true)
        throw new Error("Live recipient enrollment was not created.");
      recipient=created.id;
      const saved=await supabaseRest("affiliate_partners",{
        method:"PATCH",
        query:"?id=eq."+encodeURIComponent(partner.id)+
          "&status=eq.approved&stripe_recipient_account_id=is.null",
        body:{stripe_recipient_account_id:recipient,payout_entity_type:entityType,
          payout_onboarding_started_at:new Date().toISOString()},
        prefer:"return=representation"
      });
      if(!first(saved)){
        const current=await loadMyPartner(user);
        if(!current?.stripe_recipient_account_id)throw new Error("Recipient enrollment could not be persisted.");
        recipient=current.stripe_recipient_account_id;
      }
    }
    const acct=await recipientAccount(recipient);
    if(acct.contact_email&&acct.contact_email.toLowerCase()!==user.email.toLowerCase())
      return res.status(403).json({ok:false,error:"Recipient email does not match the partner account."});
    const link=await stripeV2("POST","/v2/core/account_links",{
      account:recipient,
      use_case:{
        type:"account_onboarding",
        account_onboarding:{
          configurations:["recipient"],
          return_url:"https://recordpathai.com/partners.html?stripe_payout_return=1",
          refresh_url:"https://recordpathai.com/partners.html?stripe_payout_refresh=1"
        }
      }
    });
    const url=new URL(link.url||"");
    if(url.protocol!=="https:"||!["accounts.stripe.com","connect.stripe.com"].includes(url.hostname))
      throw new Error("Unverified Stripe onboarding URL.");
    return privateResponse(res,{ok:true,url:url.toString(),expires_at:link.expires_at});
  }));
  app.get("/api/affiliates/payout-status",affiliateApi(async(req,res)=>{
    const user=await requireApiUser(req,res);if(!user)return;
    const partner=await loadMyPartner(user);
    if(!partner)return privateResponse(res,{ok:true,approved:false,recipient_ready:false});
    let recipientReady=false;
    if(payoutEnabled()&&validatedAffiliateRecipientId(partner.stripe_recipient_account_id)){
      try{recipientReady=hasActiveUsAchRecipient(await recipientAccount(partner.stripe_recipient_account_id));}
      catch{recipientReady=false;}
    }
    return privateResponse(res,{ok:true,approved:partner.status==="approved",
      recipient_ready:recipientReady,payouts_paused:partner.payouts_paused!==false,
      tax_reviewed:Boolean(partner.tax_reviewed_at),
      onboarding_started:Boolean(partner.stripe_recipient_account_id),
      payout_processing_enabled:await migrationReady()&&payoutEnabled(),
      minimum_payout_cents:minAmount
    });
  }));

  // Owner actions: verified Supabase user ID AND a separate server-side operations key.
  // No browser can initiate payouts with only its partner or customer credentials.
  app.get("/api/affiliates/ops/queue",affiliateApi(async(req,res)=>{
    const owner=await requireOwner(req,res);if(!owner)return;
    if(!await migrationReady())return res.status(503).json({ok:false,error:"Private payout migration not ready."});
    const [partners,commissions,batches]=await Promise.all([
      supabaseRest("affiliate_partners",{query:"?select=id,display_name,partner_type,website,audience_description,status,created_at,compliance_approved_at,tax_reviewed_at,payouts_paused,stripe_recipient_account_id&order=created_at.desc&limit=100"}),
      supabaseRest("affiliate_commissions",{query:"?select=partner_id,commission_cents,status,available_after,payout_batch_id&limit=10000"}),
      supabaseRest("affiliate_payout_batches",{query:"?select=id,partner_id,amount_cents,status,stripe_status,created_at&order=created_at.desc&limit=200"})
    ]);
    const items=(Array.isArray(partners)?partners:[]).map(partner=>{
      const entries=(Array.isArray(commissions)?commissions:[]).filter(c=>c.partner_id===partner.id);
      const payout=affiliatePayoutAllowed(partner,entries);
      return {...partner,eligible_cents:payout.amount_cents,payout_ready:payout.ready,
        has_recipient:Boolean(partner.stripe_recipient_account_id)};
    });
    return privateResponse(res,{ok:true,partners:items,batches:batches||[],
      automatic_payouts_enabled:false});
  }));
  app.post("/api/affiliates/ops/partner",affiliateApi(async(req,res)=>{
    const owner=await requireOwner(req,res);if(!owner)return;
    if(!await migrationReady())return res.status(503).json({ok:false,error:"Payout migration not ready."});
    const id=req.body?.partner_id,action=req.body?.action;
    if(!isUuid(id)||!["approve","suspend","reject","tax_clear","pause"].includes(action))
      return res.status(400).json({ok:false,error:"Partner ID and permitted action required."});
    const partner=await loadPartner(id);
    if(!partner)return res.status(404).json({ok:false,error:"Partner not found."});
    let patch={updated_at:new Date().toISOString()};
    if(action==="approve"){
      if(partner.status!=="pending"||req.body?.conflicts_reviewed!==true||
          req.body?.disclosures_reviewed!==true||req.body?.government_referrals_prohibited!==true)
        return res.status(409).json({ok:false,error:"Compliance review required before approval."});
      patch.status="approved";patch.compliance_approved_at=new Date().toISOString();
    }else if(action==="tax_clear"){
      if(partner.status!=="approved"||req.body?.tax_reviewed!==true||
          req.body?.identity_reviewed!==true)
        return res.status(409).json({ok:false,error:"Tax and identity review required."});
      await approvedRecipient(partner);
      patch.tax_reviewed_at=new Date().toISOString();patch.payouts_paused=false;
    }else if(action==="suspend"){
      patch.status="suspended";patch.payouts_paused=true;
    }else if(action==="reject"){
      if(partner.status!=="pending")
        return res.status(409).json({ok:false,error:"Only pending applications can be rejected."});
      patch.status="rejected";patch.payouts_paused=true;
    }else{
      patch.payouts_paused=true;
    }
    const rows=await supabaseRest("affiliate_partners",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(id),
      body:patch,prefer:"return=representation"
    });
    return privateResponse(res,{ok:true,status:first(rows)?.status||patch.status||partner.status,
      payouts_paused:first(rows)?.payouts_paused});
  }));
  app.post("/api/affiliates/ops/prepare",affiliateApi(async(req,res)=>{
    const owner=await requireOwner(req,res);if(!owner)return;
    if(!await migrationReady()||!payoutEnabled())
      return res.status(503).json({ok:false,error:"Payout processing not configured."});
    const id=req.body?.partner_id;
    if(!isUuid(id))return res.status(400).json({ok:false,error:"Verified partner ID required."});
    const partner=await loadPartner(id);
    const commissions=await loadCommissions(id);
    const eligibility=affiliatePayoutAllowed(partner,commissions);
    if(!eligibility.ready)return res.status(409).json({ok:false,error:"Partner requires onboarding, tax review, 30-day hold and at least $50 in approved commissions.",eligible_cents:eligibility.amount_cents});
    await approvedRecipient(partner);
    const financial=await stripeV2("GET","/v2/money_management/financial_accounts/"+accountId());
    const available=Number(financial.balance?.available?.usd?.value);
    const feeReserve=500; // Fees vary. Keep at least $5 margin or provider will reject.
    if(!Number.isFinite(available)||available<eligibility.amount_cents+feeReserve)
      return res.status(409).json({ok:false,error:"Stripe financial account needs sufficient available funds plus payout fees."});
    // Database RPC selects rows with FOR UPDATE and prevents duplicate reservations.
    const batchResult=await supabaseRest("rpc/reserve_affiliate_payout_batch",{
      method:"POST",body:{p_partner_id:id},prefer:"return=representation"
    });
    const reserved=Array.isArray(batchResult)?batchResult[0]:batchResult;
    if(!reserved||!isUuid(reserved.id))
      throw new Error("Could not reserve affiliate commission batch.");
    if(reserved.stripe_recipient_account_id!==partner.stripe_recipient_account_id)
      throw new Error("Payout recipient changed; pause batch for review.");
    if(reserved.status==="requires_confirmation"&&reserved.stripe_payout_intent_id)
      return privateResponse(res,{ok:true,batch_id:reserved.id,amount_cents:reserved.amount_cents,status:reserved.status,manual_confirmation_required:true});
    if(reserved.status!=="reserved")
      return res.status(409).json({ok:false,error:"This payout is already submitted or requires reconciliation."});
    const intent=await stripeV2("POST","/v2/money_management/payout_intents",{
      from:{financial_account:accountId(),currency:"usd"},
      to:{recipient:reserved.stripe_recipient_account_id,
        payout_method_options:{bank_account:{preferred_networks:["ach"]}}},
      amount:{value:Number(reserved.amount_cents),currency:"usd"},
      confirmation_method:"manual",
      description:"RecordPathAI affiliate commissions"
    },"recordpath-affiliate-payout-"+reserved.id);
    validatePayoutIntent(intent,{recipient:reserved.stripe_recipient_account_id,
      financialAccount:accountId(),amountCents:Number(reserved.amount_cents)});
    if(intent.status!=="requires_action"||intent.next_action?.type!=="confirm")
      throw new Error("Unexpected Stripe payout state; do not submit before review.");
    await supabaseRest("affiliate_payout_batches",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(reserved.id)+"&status=eq.reserved",
      body:{stripe_payout_intent_id:intent.id,status:"requires_confirmation",
        stripe_status:intent.status,updated_at:new Date().toISOString()}
    });
    return privateResponse(res,{ok:true,batch_id:reserved.id,
      amount_cents:reserved.amount_cents,status:"requires_confirmation",
      manual_confirmation_required:true,estimated_fees:intent.estimated_fees||null});
  }));
  app.post("/api/affiliates/ops/confirm",affiliateApi(async(req,res)=>{
    const owner=await requireOwner(req,res);if(!owner)return;
    if(!await migrationReady()||!payoutEnabled())
      return res.status(503).json({ok:false,error:"Payout system not ready."});
    const id=req.body?.batch_id;
    if(!isUuid(id)||req.body?.confirm_payout!==true)
      return res.status(400).json({ok:false,error:"An explicit confirmed payout batch is required."});
    const batch=await loadBatch(id);
    if(!batch||batch.status!=="requires_confirmation"||!batch.stripe_payout_intent_id)
      return res.status(409).json({ok:false,error:"This batch is not awaiting confirmation."});
    if(Number(req.body?.confirmed_amount_cents)!==Number(batch.amount_cents))
      return res.status(400).json({ok:false,error:"The confirmed payout amount does not match the ledger."});
    const partner=await loadPartner(batch.partner_id);
    if(!partner||partner.status!=="approved"||!partner.tax_reviewed_at||
        partner.payouts_paused!==false||
        partner.stripe_recipient_account_id!==batch.stripe_recipient_account_id)
      return res.status(409).json({ok:false,error:"Partner payout approval is no longer valid."});
    await approvedRecipient(partner);
    const rows=await supabaseRest("affiliate_commissions",{
      query:"?payout_batch_id=eq."+encodeURIComponent(batch.id)+
        "&select=id,commission_cents,status,available_after"
    });
    const items=Array.isArray(rows)?rows:[];
    if(!items.length||items.some(c=>c.status!=="approved"||
      new Date(c.available_after).getTime()>Date.now())||
      items.reduce((v,c)=>v+Number(c.commission_cents||0),0)!==Number(batch.amount_cents))
      return res.status(409).json({ok:false,error:"Commission ledger changed after reservation. No payout sent."});
    const intent=validatePayoutIntent(
      await stripeV2("GET","/v2/money_management/payout_intents/"+batch.stripe_payout_intent_id),
      {recipient:batch.stripe_recipient_account_id,financialAccount:accountId(),
        amountCents:Number(batch.amount_cents)}
    );
    if(intent.status!=="requires_action"||intent.next_action?.type!=="confirm")
      return res.status(409).json({ok:false,error:"Payout intent requires owner reconciliation before confirmation."});
    await supabaseRest("affiliate_payout_batches",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(batch.id),
      body:{reviewed_by:owner.id,reviewed_at:new Date().toISOString()}
    });
    // Stripe's idempotency key prevents duplicate bank sends on an HTTP retry.
    const posted=await stripeV2("POST","/v2/money_management/payout_intents/"+
      batch.stripe_payout_intent_id+"/confirm",{},
      "recordpath-affiliate-payout-confirm-"+batch.id);
    const stripeStatus=String(posted.status||"");
    await supabaseRest("affiliate_payout_batches",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(batch.id),
      body:{status:stripeStatus==="posted"?"paid":"submitted",
        confirmed_at:new Date().toISOString(),stripe_status:stripeStatus,
        updated_at:new Date().toISOString()}
    });
    // Only 'posted' marks commissions paid. Otherwise reconciliation does it.
    if(shouldRecordPayoutPaid(stripeStatus))
      await supabaseRest("affiliate_commissions",{
        method:"PATCH",
        query:"?payout_batch_id=eq."+encodeURIComponent(batch.id)+"&status=eq.approved",
        body:{status:"paid",paid_at:new Date().toISOString()}
      });
    return privateResponse(res,{ok:true,batch_id:batch.id,status:stripeStatus,
      note:"Stripe accepted the payout request; bank receipt is not yet guaranteed."});
  }));
  app.post("/api/affiliates/ops/reconcile",affiliateApi(async(req,res)=>{
    const owner=await requireOwner(req,res);if(!owner)return;
    if(!await migrationReady()||!payoutEnabled())
      return res.status(503).json({ok:false,error:"Payout reconciliation not configured."});
    const id=req.body?.batch_id;
    if(!isUuid(id))return res.status(400).json({ok:false,error:"Batch ID required."});
    const batch=await loadBatch(id);
    if(!batch||!batch.stripe_payout_intent_id)
      return res.status(404).json({ok:false,error:"Stripe payout intent not recorded."});
    const intent=validatePayoutIntent(
      await stripeV2("GET","/v2/money_management/payout_intents/"+batch.stripe_payout_intent_id),
      {recipient:batch.stripe_recipient_account_id,financialAccount:accountId(),
        amountCents:Number(batch.amount_cents)}
    );
    const status=intent.status;
    let next=batch.status;
    if(shouldRecordPayoutPaid(status)){
      next="paid";
      await supabaseRest("affiliate_commissions",{
        method:"PATCH",query:"?payout_batch_id=eq."+encodeURIComponent(batch.id)+
          "&status=eq.approved",
        body:{status:"paid",paid_at:new Date().toISOString()}
      });
    }else if(status==="processing"||status==="pending"){
      next="processing";
    }else if(status==="canceled"){
      next="canceled";
      // Stripe confirms no funds went out; release verified, non-void commission rows.
      await supabaseRest("affiliate_commissions",{
        method:"PATCH",query:"?payout_batch_id=eq."+encodeURIComponent(batch.id)+
          "&status=eq.approved",body:{payout_batch_id:null}
      });
    }else if(status==="requires_action"&&intent.next_action?.type==="handle_failure"){
      // Could be returned or failed. Never resend automatically.
      next="failed";
      const obp=intent.latest_payout?.outbound_payment;
      if(/^obp_(?:test_)?[A-Za-z0-9]+$/.test(String(obp||""))){
        const payout=await stripeV2("GET","/v2/money_management/outbound_payments/"+obp);
        if(payout.status==="returned")next="returned";
        if(!["returned","failed","canceled"].includes(payout.status))
          throw new Error("Cannot prove funds were returned. Leave batch reserved.");
      }else{
        throw new Error("Payout attempt cannot be verified. Leave batch reserved.");
      }
      await supabaseRest("affiliate_commissions",{
        method:"PATCH",query:"?payout_batch_id=eq."+encodeURIComponent(batch.id)+
          "&status=in.(approved,paid)",
        body:{status:"approved",paid_at:null,payout_batch_id:null}
      });
    }else if(status==="requires_action"&&intent.next_action?.type==="confirm"){
      next="requires_confirmation";
    }
    await supabaseRest("affiliate_payout_batches",{
      method:"PATCH",query:"?id=eq."+encodeURIComponent(batch.id),
      body:{status:next,stripe_status:status,updated_at:new Date().toISOString()}
    });
    return privateResponse(res,{ok:true,batch_id:batch.id,stripe_status:status,
      ledger_status:next,bank_receipt_unverified:next==="paid"});
  }));
  return {payoutEnabled,migrationReady};
}
