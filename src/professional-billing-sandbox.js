import Stripe from "stripe";
const PRICES=Object.freeze({solo:{id:"price_1UgDZYE2dI5377iPC7Ldxgrf",cents:9900},firm:{id:"price_1UgDZbE2dI5377iPxa9va951",cents:24900}});
const ACCOUNT="acct_1TNJcME2dI5377iP";
export function validProfessionalTestPrice(price,plan){
 const expected=PRICES[plan];
 return Boolean(expected&&price?.id===expected.id&&price.livemode===false&&price.active===true&&price.currency==="usd"&&price.unit_amount===expected.cents&&price.recurring?.interval==="month"&&price.recurring.interval_count===1);
}
function returnUrl(env){const u=new URL(env.PROFESSIONAL_STAGING_ORIGIN||"");if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("Staging origin required");return u.origin+"/professional-attorney.html";}
export function validProfessionalTestSubscription(s,org,customer,plan){return Boolean(s?.livemode===false&&s.customer===customer&&s.metadata?.product_family==="recordpathai_professional"&&s.metadata.org_id===org&&s.metadata.plan===plan&&s.items?.data?.length===1&&s.items.data[0].price?.id===PRICES[plan]?.id&&s.items.data[0].quantity===1);}
export function registerProfessionalBillingRoutes(app,{context,env=process.env,stripeFactory=k=>new Stripe(k)}){
 async function authorized(req,res){
  const ctx=await context(req,res);if(!ctx)return null;
  const org=String(req.query.org_id||"");
  if(!/^[a-f0-9-]{36}$/i.test(org)){res.status(400).end();return null;}
  const [row]=await ctx.rest("professional_billing_sandbox","select=org_id,authorized_user,stripe_customer_id,plan,active&org_id=eq."+org+"&authorized_user=eq."+ctx.user.id+"&active=eq.true&limit=1");
  if(!row){res.status(403).json({ok:false,error:"No authorized sandbox billing account. Complimentary pilot access is separate."});return null;}
  const key=env.STRIPE_TEST_SECRET_KEY||"";
  if(!key.startsWith("sk_test_")){res.status(503).json({ok:false,error:"Professional sandbox key not configured."});return null;}
  const stripe=stripeFactory(key);
  const account=await stripe.accounts.retrieve();
  if(account.id!==ACCOUNT)throw Error("Wrong sandbox account");
  const [price,customer]=await Promise.all([stripe.prices.retrieve(PRICES[row.plan].id),stripe.customers.retrieve(row.stripe_customer_id)]);
  if(!validProfessionalTestPrice(price,row.plan)||customer.deleted||customer.livemode!==false||customer.id!==row.stripe_customer_id)throw Error("Invalid sandbox billing configuration");
  return {stripe,row,price};
 }
 async function subscriptions(stripe,row){
  const list=await stripe.subscriptions.list({customer:row.stripe_customer_id,status:"all",limit:100});
  if(list.has_more)throw Error("Operator subscription review required");
  return list.data;
 }
 app.get("/api/professional/billing/status",async(req,res)=>{try{
  const a=await authorized(req,res);if(!a)return;
  const list=await subscriptions(a.stripe,a.row);
  const found=list.filter(s=>validProfessionalTestSubscription(s,a.row.org_id,a.row.stripe_customer_id,a.row.plan));
  const latest=found.sort((x,y)=>y.created-x.created)[0];
  return res.json({ok:true,mode:"sandbox",plan:a.row.plan,amount_cents:a.price.unit_amount,subscription_status:latest?.status||"not_started",test_active:latest?.status==="active"||latest?.status==="trialing",production_entitlement:false});
 }catch{return res.status(503).json({ok:false,error:"Sandbox billing verification unavailable."});}});
 app.post("/api/professional/billing/checkout",async(req,res)=>{try{
  if(req.get("x-professional-sandbox-consent")!=="yes")return res.status(400).end();
  const a=await authorized(req,res);if(!a)return;
  const {stripe,row,price}=a,back=returnUrl(env);
  const list=await subscriptions(stripe,row);
  if(list.some(s=>!["canceled","incomplete_expired"].includes(s.status)))return res.status(409).json({ok:false,error:"Existing sandbox subscription requires review."});
  const sessions=await stripe.checkout.sessions.list({customer:row.stripe_customer_id,status:"open",limit:100});
  if(sessions.has_more)throw Error("Open sessions require review");
  let session=sessions.data.find(s=>s.livemode===false&&s.metadata?.product_family==="recordpathai_professional"&&s.metadata.org_id===row.org_id&&s.metadata.plan===row.plan);
  if(!session&&sessions.data.length)throw Error("Existing open checkout requires review");
  if(!session){const metadata={product_family:"recordpathai_professional",org_id:row.org_id,plan:row.plan};
   session=await stripe.checkout.sessions.create({mode:"subscription",customer:row.stripe_customer_id,line_items:[{price:price.id,quantity:1}],success_url:back,cancel_url:back,metadata,subscription_data:{metadata},client_reference_id:row.org_id},{idempotencyKey:"rpai-professional-test-"+row.org_id+"-"+row.plan+"-"+new Date().toISOString().slice(0,10)});
  }
  if(session.livemode!==false||session.status!=="open"||new URL(session.url).origin!=="https://checkout.stripe.com")throw Error("Invalid test session");
  return res.json({ok:true,mode:"sandbox",url:session.url});
 }catch{return res.status(503).json({ok:false,error:"Sandbox checkout unavailable. No live charge authorized."});}});
 app.post("/api/professional/billing/portal",async(req,res)=>{try{
  if(req.get("x-professional-sandbox-consent")!=="yes")return res.status(400).end();
  const a=await authorized(req,res);if(!a)return;
  const session=await a.stripe.billingPortal.sessions.create({customer:a.row.stripe_customer_id,return_url:returnUrl(env)});
  if(new URL(session.url).origin!=="https://billing.stripe.com")throw Error("Invalid portal");
  return res.json({ok:true,mode:"sandbox",url:session.url});
 }catch{return res.status(503).json({ok:false,error:"Sandbox customer portal unavailable."});}});
}
