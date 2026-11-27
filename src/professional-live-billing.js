import Stripe from "stripe";
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
export function registerProfessionalLiveBilling(app,{context,env=process.env,stripeFactory=k=>new Stripe(k,{apiVersion:"2023-10-16"})}){
 async function authorized(req,res,{create=false}={}){
  const ctx=await context(req,res);if(!ctx)return null;
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
  const entitled=await setLease(a,paid);
  return res.json({ok:true,mode:"live",plan:a.row.plan,amount_cents:a.price.unit_amount,active:entitled,subscription_exists:outstanding.length>0,lease_minutes:20});
 }catch{return res.status(503).json({ok:false,error:"Live subscription verification unavailable. Existing access expires automatically."});}});
 app.post("/api/professional/live-billing/checkout",async(req,res)=>{try{
  if(req.get("x-professional-live-consent")!=="yes")return res.status(400).end();
  const a=await authorized(req,res,{create:true});if(!a)return;
  const {stripe,row,price}=a,list=await allSubscriptions(a);
  if(list.some(s=>!["canceled","incomplete_expired"].includes(s.status)))return res.status(409).json({ok:false,error:"Manage your existing subscription rather than creating another."});
  const sessions=await stripe.checkout.sessions.list({customer:row.stripe_customer_id,status:"open",limit:100});
  if(sessions.has_more)throw Error("Open sessions require review");
  let session=sessions.data.find(s=>s.livemode===true&&s.mode==="subscription"&&s.metadata?.product_family==="recordpathai_professional"&&s.metadata.org_id===row.org_id&&s.metadata.plan===row.plan);
  if(!session&&sessions.data.length)throw Error("Existing checkout requires review");
  if(!session){
   const metadata={product_family:"recordpathai_professional",org_id:row.org_id,plan:row.plan};
   session=await stripe.checkout.sessions.create({mode:"subscription",customer:row.stripe_customer_id,line_items:[{price:price.id,quantity:1}],automatic_tax:{enabled:true},customer_update:{address:"auto"},success_url:BACK,cancel_url:BACK,metadata,subscription_data:{metadata},client_reference_id:row.org_id},{idempotencyKey:"rpai-pro-live-"+row.org_id+"-"+row.plan+"-"+new Date().toISOString().slice(0,10)});
  }
  const items=await stripe.checkout.sessions.listLineItems(session.id,{limit:2});
  if(items.has_more||items.data.length!==1||items.data[0].price?.id!==price.id||items.data[0].quantity!==1||session.customer!==row.stripe_customer_id||session.livemode!==true||session.status!=="open"||new URL(session.url).origin!=="https://checkout.stripe.com")throw Error("Unexpected checkout");
  return res.json({ok:true,mode:"live",url:session.url});
 }catch{return res.status(503).json({ok:false,error:"Professional checkout unavailable."});}});
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
