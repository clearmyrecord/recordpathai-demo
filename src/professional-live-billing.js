import Stripe from "stripe";
import {randomUUID} from "node:crypto";
const ACCOUNT="acct_1TNJc5EGlcQZ3lmX";
const BACK="https://recordpathai.com/professional-account.html";
const PORTAL="bpc_1UgEGjEGlcQZ3lmXEuDTCSHU";
export const LIVE_PROFESSIONAL_PRICES=Object.freeze({solo:{id:"price_1UgEDMEGlcQZ3lmXWhFcmLh2",cents:9900},firm:{id:"price_1UgEDNEGlcQZ3lmXCqXidQQy",cents:24900},filing:{id:"price_1UgEDPEGlcQZ3lmX4KtXbLzk",cents:1000}});
export function verifiedLivePrice(price,plan){
 const expected=LIVE_PROFESSIONAL_PRICES[plan];
 return Boolean(["solo","firm"].includes(plan)&&expected&&price?.id===expected.id&&price.livemode===true&&price.active===true&&price.currency==="usd"&&price.unit_amount===expected.cents&&price.recurring?.interval==="month"&&price.recurring?.interval_count===1);
}
export function verifiedLiveSubscription(s,row,now=Math.floor(Date.now()/1000)){
 const expected=LIVE_PROFESSIONAL_PRICES[row.plan],invoice=s?.latest_invoice,charge=invoice?.charge;
 return Boolean(expected&&s?.livemode===true&&s.status==="active"&&s.customer===row.stripe_customer_id&&s.metadata?.product_family==="recordpathai_professional"&&s.metadata.org_id===row.org_id&&s.metadata.plan===row.plan&&s.items?.data?.length===1&&s.items.data[0].price?.id===expected.id&&s.items.data[0].quantity===1&&Number.isFinite(s.current_period_end)&&s.current_period_end>now&&invoice?.livemode===true&&invoice.status==="paid"&&invoice.subscription===s.id&&invoice.currency==="usd"&&invoice.amount_paid>=expected.cents&&charge?.livemode===true&&charge.paid===true&&charge.status==="succeeded"&&charge.currency==="usd"&&charge.amount_captured>=expected.cents&&charge.amount_refunded===0&&charge.refunded===false&&charge.disputed===false);
}
export function registerProfessionalLiveBilling(app,{context,env=process.env,stripeFactory=k=>new Stripe(k,{apiVersion:"2023-10-16",timeout:12000,maxNetworkRetries:0})}){
 async function authorized(req,res,{create=false,authenticated=null}={}){
  const ctx=authenticated||await context(req,res);if(!ctx)return null;
  if(ctx.mode!=="production"){res.status(503).json({ok:false,error:"Live professional billing requires production."});return null;}
  if(!ctx.user.email_confirmed_at){res.status(403).json({ok:false,error:"Confirm your email first."});return null;}
  if(create&&req.get("x-professional-account-id")!==ctx.user.id){res.status(403).json({ok:false,error:"Confirm the signed-in RecordPathAI account before starting checkout."});return null;}
  let rows=await ctx.rest("professional_live_billing","select=org_id,authorized_user,plan,stripe_customer_id,approved&authorized_user=eq."+ctx.user.id+"&limit=2",{service:true});
  if(!rows.length&&!create){res.json({ok:true,mode:"live",active:false,subscription_exists:false,unregistered:true});return null;}
  const key=env.STRIPE_SECRET_KEY||"";
  if(!key.startsWith("sk_live_")||!env.SUPABASE_SERVICE_ROLE_KEY){res.status(503).json({ok:false,error:"Live billing service is not configured."});return null;}
  const stripe=stripeFactory(key);
  const account=await stripe.accounts.retrieve();if(account.id!==ACCOUNT)throw Error("Unexpected Stripe account");
  if(!rows.length&&create){
   const plan=req.get("x-professional-plan");
   if(!["solo","firm"].includes(plan)||req.get("x-professional-terms")!=="accepted-v1"){res.status(400).json({ok:false,error:"Choose a plan and accept the software terms."});return null;}
   const candidatePrice=await stripe.prices.retrieve(LIVE_PROFESSIONAL_PRICES[plan].id);
   if(!verifiedLivePrice(candidatePrice,plan))throw Error("Invalid live price");
   const customer=await stripe.customers.create({email:ctx.user.email,metadata:{product_family:"recordpathai_professional",authorized_user:ctx.user.id}},{idempotencyKey:"rpai-professional-customer-"+ctx.user.id});
   if(customer.livemode!==true||customer.metadata?.authorized_user!==ctx.user.id)throw Error("Invalid customer");
   await ctx.rest("rpc/professional_create_self_service","",{service:true,body:{p_user:ctx.user.id,p_customer:customer.id,p_plan:plan}});
   rows=await ctx.rest("professional_live_billing","select=org_id,authorized_user,plan,stripe_customer_id,approved&authorized_user=eq."+ctx.user.id+"&limit=2",{service:true});
  }
  if(rows.length!==1||!rows[0].approved)throw Error("Professional account unavailable");
  const row=rows[0];
  if(row.authorized_user!==ctx.user.id){res.status(403).json({ok:false,error:"Subscription must belong to the signed-in account."});return null;}
  const [org]=await ctx.rest("professional_pilot_orgs","select=id,active,access_kind,activation_reviewed_at,self_service_terms_at&id=eq."+row.org_id+"&limit=1",{service:true});
  if(!org?.active||org.access_kind!=="paid"||(!org.activation_reviewed_at&&!org.self_service_terms_at))throw Error("Professional organization unavailable");
  const [member]=await ctx.rest("professional_pilot_members","select=org_id,user_id,active,role,attorney_verified&org_id=eq."+row.org_id+"&user_id=eq."+ctx.user.id+"&limit=1",{service:true});
  if(!member?.active||!((member.role==="attorney"&&member.attorney_verified)||(member.role==="staff"&&!member.attorney_verified&&org.self_service_terms_at)))throw Error("Professional membership unavailable");
  const expected=LIVE_PROFESSIONAL_PRICES[row.plan];
  if(!expected||!["solo","firm"].includes(row.plan))throw Error("Invalid plan");
  const [price,customer]=await Promise.all([stripe.prices.retrieve(expected.id),stripe.customers.retrieve(row.stripe_customer_id)]);
  if(!verifiedLivePrice(price,row.plan)||customer.deleted||customer.livemode!==true||customer.id!==row.stripe_customer_id||customer.metadata?.product_family!=="recordpathai_professional"||customer.metadata?.authorized_user!==ctx.user.id)throw Error("Unverified dedicated professional customer");
  return {ctx,row,stripe,price};
 }
 async function allSubscriptions(a){
  const list=await a.stripe.subscriptions.list({customer:a.row.stripe_customer_id,status:"all",limit:100,expand:["data.latest_invoice"]});
  if(list.has_more)throw Error("Subscription history requires review");
  // A captured, non-refunded, non-disputed charge must support the latest paid invoice.
  for(const s of list.data){
   if(s.status==="active"&&typeof s.latest_invoice?.charge==="string")s.latest_invoice.charge=await a.stripe.charges.retrieve(s.latest_invoice.charge);
  }
  return list.data;
 }
 async function setLease(a,s){
  const result=await a.ctx.rest("rpc/professional_set_paid_lease","",{service:true,body:{p_org:a.row.org_id,p_user:a.ctx.user.id,p_customer:a.row.stripe_customer_id,p_subscription:s?.id||null,p_period_end:s?new Date(s.current_period_end*1000).toISOString():null,p_verified:Boolean(s)}});
  return result===true;
 }
 app.post("/api/professional/live-billing/refresh",async(req,res)=>{try{
  const a=await authorized(req,res);if(!a)return;
  const list=await allSubscriptions(a),valid=list.filter(s=>verifiedLiveSubscription(s,a.row));
  const outstanding=list.filter(s=>!["canceled","incomplete_expired"].includes(s.status));
  const paid=valid.length===1&&outstanding.length===1?valid[0]:null;
  const testAccess=outstanding.length===0&&await a.ctx.rest("rpc/professional_set_test_lease","",{service:true,body:{p_org:a.row.org_id,p_user:a.ctx.user.id}})===true;
  const entitled=testAccess?true:await setLease(a,paid);
  return res.json({ok:true,mode:"live",plan:a.row.plan,amount_cents:a.price.unit_amount,active:entitled,subscription_exists:outstanding.length>0,test_access:testAccess,lease_minutes:20});
 }catch{return res.status(503).json({ok:false,error:"Live subscription verification unavailable. Existing access expires automatically."});}});
 app.post("/api/professional/live-billing/checkout",async(req,res)=>{
  let ctx,token,locked=false,uncertain=false;
  try{
   if(req.get("x-professional-live-consent")!=="yes")return res.status(400).end();
   ctx=await context(req,res);if(!ctx)return;
   if(ctx.mode!=="production")return res.status(503).json({ok:false,error:"Live professional billing requires production."});
   if(!ctx.user.email_confirmed_at||req.get("x-professional-account-id")!==ctx.user.id)return res.status(403).json({ok:false,error:"Verify the signed-in account before starting checkout."});
   const plan=req.get("x-professional-plan");
   if(!["solo","firm"].includes(plan)||req.get("x-professional-terms")!=="accepted-v1")return res.status(400).json({ok:false,error:"Choose a plan and accept the software terms."});
   token=randomUUID();
   locked=await ctx.rest("rpc/professional_claim_checkout","",{service:true,body:{p_user:ctx.user.id,p_token:token}})===true;
   if(!locked)return res.status(409).json({ok:false,error:"A checkout is being prepared. Refresh subscription status before retrying."});
   const a=await authorized(req,res,{create:true,authenticated:ctx});if(!a)return;
   const {stripe,row}=a,list=await allSubscriptions(a);
   const outstanding=s=>!["canceled","incomplete_expired"].includes(s.status);
   if(list.some(outstanding))return res.status(409).json({ok:false,error:"Manage your existing subscription rather than creating another."});
   if(await ctx.rest("rpc/professional_set_test_lease","",{service:true,body:{p_org:row.org_id,p_user:ctx.user.id}})===true)return res.status(409).json({ok:false,error:"Internal testing access is active. No subscription payment is required. Refresh your account to open RecordWatch."});
   const belongs=s=>s.livemode===true&&s.mode==="subscription"&&s.customer===row.stripe_customer_id&&s.metadata?.product_family==="recordpathai_professional"&&s.metadata.org_id===row.org_id&&["solo","firm"].includes(s.metadata.plan);
   const knownFiling=async s=>{
    const m=s.metadata||{},uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
    if(s.livemode!==true||s.mode!=="payment"||s.customer!==row.stripe_customer_id||m.productType!=="recordpathai-professional-conviction-mail"||m.orgId!==row.org_id||m.userId!==ctx.user.id||!uuid(m.caseId)||!/^cs_live_[A-Za-z0-9]+$/.test(s.id))return false;
    const [o]=await ctx.rest("professional_mail_orders","select=case_id,org_id,user_id,document_id,signed_sha,court_fee_cents,stripe_session_id&case_id=eq."+m.caseId+"&org_id=eq."+row.org_id+"&user_id=eq."+ctx.user.id+"&stripe_session_id=eq."+s.id+"&limit=1",{service:true});
    return Boolean(o&&o.case_id===m.caseId&&o.org_id===row.org_id&&o.user_id===ctx.user.id&&o.stripe_session_id===s.id&&m.documentId===o.document_id&&m.signedPdfSha===o.signed_sha&&m.serviceFeeCents==="1000"&&m.courtFeeCents===String(o.court_fee_cents)&&[0,10000].includes(o.court_fee_cents)&&s.amount_subtotal===1000+o.court_fee_cents);
   };
   const subscriptionSessions=async(status,firstOnly=false)=>{
    let cursor;const found=[];
    for(let page=0;page<100;page++){
     const batch=await stripe.checkout.sessions.list({customer:row.stripe_customer_id,limit:100,...(status?{status}:{}),...(cursor?{starting_after:cursor}:{})});
     for(const s of batch.data){if(belongs(s)){found.push(s);if(firstOnly)return found;}else if(!await knownFiling(s))throw Error("Unexpected checkout history");}
     if(!batch.has_more)return found;
     const next=batch.data.at(-1)?.id;if(!next||next===cursor)throw Error("Checkout history cursor unavailable");cursor=next;
    }
    throw Error("Checkout history requires review");
   };
   const sessions=await subscriptionSessions("open");
   if(sessions.length>1)throw Error("Open sessions require review");
   let session=sessions[0];
   const price=plan===row.plan?a.price:await stripe.prices.retrieve(LIVE_PROFESSIONAL_PRICES[plan].id);
   if(!verifiedLivePrice(price,plan))throw Error("Selected price unavailable");
   if(session&&session.metadata.plan!==plan){
    const expired=await stripe.checkout.sessions.expire(session.id);
    if(expired.id!==session.id||expired.status!=="expired")throw Error("Old checkout did not expire");
    session=null;
   }
   // Expiration may race with a completed payment. Recheck Stripe before
   // modifying the unpaid billing row or offering another payment.
   if((await allSubscriptions(a)).some(outstanding))return res.status(409).json({ok:false,error:"A subscription already exists. Refresh its status."});
   if(row.plan!==plan){
    const changed=await ctx.rest("rpc/professional_select_checkout_plan","",{service:true,body:{p_user:ctx.user.id,p_token:token,p_org:row.org_id,p_customer:row.stripe_customer_id,p_plan:plan}});
    if(changed!==true)throw Error("Plan selection unavailable");
    row.plan=plan;
   }
   if(!session){
    const [last]=await subscriptionSessions(undefined,true);
    if(last?.status==="open")throw Error("Unexpected open checkout");
    const metadata={product_family:"recordpathai_professional",org_id:row.org_id,plan:row.plan};
    // One deterministic request per last known checkout and chosen plan.
    // Keep the lock on uncertain creation; a retry must reconcile provider state.
    uncertain=true;
    session=await stripe.checkout.sessions.create({mode:"subscription",customer:row.stripe_customer_id,line_items:[{price:price.id,quantity:1}],automatic_tax:{enabled:true},customer_update:{address:"auto"},success_url:BACK,cancel_url:BACK,metadata,subscription_data:{metadata},client_reference_id:row.org_id},{idempotencyKey:"rpai-pro-live-"+row.org_id+"-"+row.plan+"-"+(last?.id||"first")});
    uncertain=false;
   }
   const items=await stripe.checkout.sessions.listLineItems(session.id,{limit:2});
   if(items.has_more||items.data.length!==1||items.data[0].price?.id!==price.id||items.data[0].quantity!==1||session.customer!==row.stripe_customer_id||session.livemode!==true||session.status!=="open"||new URL(session.url).origin!=="https://checkout.stripe.com")throw Error("Unexpected checkout");
   return res.json({ok:true,mode:"live",url:session.url});
  }catch{return res.status(503).json({ok:false,error:"Professional checkout unavailable. Refresh subscription status before retrying."});}
  finally{if(locked&&!uncertain){try{await ctx.rest("rpc/professional_release_checkout","",{service:true,body:{p_user:ctx.user.id,p_token:token}});}catch{ /* The private lock expires automatically. */ }}}
 });
 app.post("/api/professional/live-billing/portal",async(req,res)=>{try{
  if(req.get("x-professional-live-consent")!=="yes")return res.status(400).end();
  const a=await authorized(req,res);if(!a)return;
  const cfg=await a.stripe.billingPortal.configurations.retrieve(PORTAL);
  if(cfg.livemode!==true||!cfg.active||cfg.metadata?.product_family!=="recordpathai_professional"||cfg.features?.subscription_update?.enabled!==false||!cfg.features?.subscription_cancel?.enabled)throw Error("Unexpected portal configuration");
  const session=await a.stripe.billingPortal.sessions.create({customer:a.row.stripe_customer_id,configuration:PORTAL,return_url:BACK});
  if(new URL(session.url).origin!=="https://billing.stripe.com")throw Error("Unexpected portal");
  return res.json({ok:true,mode:"live",url:session.url});
 }catch{return res.status(503).json({ok:false,error:"Professional billing portal unavailable."});}});
}
