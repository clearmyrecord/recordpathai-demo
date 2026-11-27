import {verifiedPacketSession} from "./payment-security.js";
import {verifyLivePacketPaymentForLob} from "./lob-dispatch-payment-guard.js";
const eventLabels=new Map([
 ["mailed","Mailed"],["in_transit","In Transit"],["in_local_area","In Local Area"],["processed_for_delivery","Processed for Delivery"],["delivered","Delivered"],["re_routed","Re-Routed"],["returned_to_sender","Returned to Sender"],["international_exit","International Exit"],["failed","Failed"]
]);
const normalize=v=>String(v||"").toLowerCase().split(".").at(-1).replace(/[^a-z0-9]+/g,"_");
const validTime=v=>typeof v==="string"&&Number.isFinite(Date.parse(v));
export function consumerTrackingSnapshot(timeline){
 return {providerStatus:timeline.lob_submitted?"not_checked":"not_applicable",paymentCheck:timeline.packet_payment_verified?"recorded":"not_recorded",lobReference:timeline.lob_letter_reference||timeline.lob_check_reference||null,expectedDeliveryDate:null,providerEvents:[],latestEvent:null,renderStatus:null};
}
export async function checkConsumerTracking(timeline,job,{stripe,network=fetch,env=process.env}={}){
 const result=consumerTrackingSnapshot(timeline);
 if(!job)return result;
 if(/^cs_live_[A-Za-z0-9]+$/.test(job.stripe_session_id||"")){
  result.paymentCheck="unavailable";
  if(stripe)try{
   const session=await stripe.checkout.sessions.retrieve(job.stripe_session_id,{expand:["payment_intent.latest_charge"]});
   const intent=session.payment_intent,charge=intent?.latest_charge;
   const valid=session.id===job.stripe_session_id&&session.livemode===true&&session.mode==="payment"&&verifiedPacketSession(session,job.user_id,job.case_id)&&Number(session.metadata?.courtFeeCents)===job.court_fee_cents&&session.metadata?.fulfillmentMode===job.payment_method&&intent?.livemode===true&&intent.status==="succeeded"&&intent.currency==="usd"&&intent.amount===session.amount_total&&intent.amount_received===session.amount_total&&charge?.livemode===true&&charge.payment_intent===intent.id&&charge.paid===true&&charge.status==="succeeded"&&charge.currency==="usd"&&charge.amount===session.amount_total&&charge.amount_refunded===0&&charge.refunded===false&&charge.disputed===false;
   result.paymentCheck=valid&&(!["lob_check","no_fee"].includes(job.payment_method)||verifyLivePacketPaymentForLob(session,job).ok)?"verified":"not_verified";
  }catch{}
 }
 if(!result.lobReference)return result;
 result.providerStatus="unavailable";
 const ref=result.lobReference,letter=job.payment_method==="no_fee"&&job.court_fee_cents===0&&/^ltr_[A-Za-z0-9]+$/.test(ref),check=job.payment_method==="lob_check"&&job.court_fee_cents>0&&/^chk_[A-Za-z0-9]+$/.test(ref);
 if(!letter&&!check||!env.LOB_LIVE_API_KEY?.startsWith("live_"))return result;
 try{
  const response=await network("https://api.lob.com/v1/"+(letter?"letters/":"checks/")+ref,{headers:{Authorization:"Basic "+Buffer.from(env.LOB_LIVE_API_KEY+":").toString("base64")},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return result;
  const data=await response.json();if(data.id!==ref||data.deleted===true)return result;
  result.providerStatus="checked";
  result.renderStatus=["processed","rendered","failed"].includes(data.status)?data.status:null;
  result.expectedDeliveryDate=/^\d{4}-\d{2}-\d{2}$/.test(data.expected_delivery_date||"")&&validTime(data.expected_delivery_date)?data.expected_delivery_date:null;
  result.providerEvents=(Array.isArray(data.tracking_events)?data.tracking_events:[]).map(e=>({name:eventLabels.get(normalize(e.type||e.event_type||e.name)),time:e.time})).filter(e=>e.name&&validTime(e.time)).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(-50);
  result.latestEvent=result.providerEvents.at(-1)||null;
 }catch{}
 return result;
}
