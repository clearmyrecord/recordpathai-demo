import Stripe from "stripe";
const ACCOUNT="acct_1TNJc5EGlcQZ3lmX";
const BACK="https://recordpathai.com/professional-account.html";
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
 async function authorized(req,res){
  const ctx=await context(req,res);if(!ctx)return null;
  if(ctx.mode!=="production"){res.status(503).json({ok:false,error:"Live professional billing requires production."});return null;}
  const rows=await ctx.rest("professional_live_billing","select=org_id,authorized_user,plan,stripe_customer_id,approved&authorized_user=eq."+ctx.user.id+"&approved=eq.true&limit=2");
  if(rows.length!==1){res.status(403).json({ok:false,error:"An operator-approved professional billing account is required."});return null;}
  const row=rows[0],key=env.STRIPE_SECRET_KEY||"";
  if(!key.startsWith("sk_live_")||!env.SUPABASE_SERVICE_ROLE_KEY){res.status(503).json({ok:false,error:"Live billing service is not configured."});return null;}
  const stripe=stripeFactory(key);
  const account=await stripe.accounts.retrieve();if(account.id!==ACCOUNT)throw Error("Unexpected Stripe account");
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
  const a=await authorized(req,res);if(!a)return;
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
  if(session.livemode!==true||session.status!=="open"||new URL(session.url).origin!=="https://checkout.stripe.com")throw Error("Unexpected checkout");
  return res.json({ok:true,mode:"live",url:session.url});
 }catch{return res.status(503).json({ok:false,error:"Professional checkout unavailable."});}});
 app.post("/api/professional/live-billing/portal",async(req,res)=>{try{
  if(req.get("x-professional-live-consent")!=="yes")return res.status(400).end();
  const a=await authorized(req,res);if(!a)return;
  const session=await a.stripe.billingPortal.sessions.create({customer:a.row.stripe_customer_id,return_url:BACK});
  if(new URL(session.url).origin!=="https://billing.stripe.com")throw Error("Unexpected portal");
  return res.json({ok:true,mode:"live",url:session.url});
 }catch{return res.status(503).json({ok:false,error:"Professional billing portal unavailable."});}});
}
