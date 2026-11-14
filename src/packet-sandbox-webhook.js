// STAGING ONLY: Stripe TEST-mode event -> separate PostgreSQL database.
// This module is deliberately never imported by production server.js.
// There are no Lob, filing, mailing, customer-account, or commission actions.
import express from "express";
import {verifiedPacketSession,PACKET_PRICE_CENTS} from "./payment-security.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_SESSION = /^cs_test_[A-Za-z0-9]+$/;
const accepted = new Set(["checkout.session.completed","checkout.session.async_payment_succeeded"]);

export function validSandboxPacketSession(session,signedId){
  if(!TEST_SESSION.test(signedId||"") || session?.id!==signedId ||
     session?.livemode!==false || session?.mode!=="payment" ||
     session?.metadata?.sandboxOnly!=="true" ||
     session?.metadata?.productType!=="record-sealing-packet")return false;
  const owner=session.metadata.userId,caseId=session.metadata.saved_case_id;
  const serviceFee=Number(session.metadata.serviceFeeCents);
  const courtFee=Number(session.metadata.courtFeeCents);
  if(!UUID.test(owner||"") || !UUID.test(caseId||"") ||
     serviceFee!==PACKET_PRICE_CENTS || courtFee!==10000 ||
     session.metadata.fulfillmentMode!=="lob_check" ||
     !Number.isSafeInteger(serviceFee)||!Number.isSafeInteger(courtFee))return false;
  return verifiedPacketSession(session,owner,caseId) &&
    session.amount_total===15000;
}

export function createPacketSandboxWebhookApp({stripeClient,db,signingSecret}){
  if(!stripeClient?.webhooks?.constructEvent ||
      !stripeClient?.checkout?.sessions?.retrieve ||
      !db?.query || !String(signingSecret||"").startsWith("whsec_")){
    throw new Error("Sandbox Stripe verifier, isolated database and signing secret required");
  }
  const app=express();
  app.get("/health",(req,res)=>res.json({ok:true,mode:"sandbox_only"}));
  app.post("/stripe/packet-sandbox-webhook",
    express.raw({type:"application/json",limit:"128kb"}),async(req,res)=>{
      let event;
      try{
        event=stripeClient.webhooks.constructEvent(req.body,
          req.get("stripe-signature"),signingSecret);
      }catch{return res.status(400).json({ok:false,error:"Invalid Stripe test signature"});}
      if(!accepted.has(event.type))return res.json({received:true,ignored:true});
      const signed=event.data?.object;
      if(!TEST_SESSION.test(signed?.id||"") ||
         signed?.livemode!==false ||
         signed?.metadata?.productType!=="record-sealing-packet" ||
         signed?.metadata?.sandboxOnly!=="true"){
        return res.json({received:true,ignored:true});
      }
      try{
        // Test account API call is mandatory; never trust paid status solely
        // from an event snapshot, even if the webhook signature is genuine.
        const current=await stripeClient.checkout.sessions.retrieve(signed.id);
        if(current?.payment_status!=="paid"||current?.status!=="complete")
          return res.json({received:true,pending_payment:true});
        if(!validSandboxPacketSession(current,signed.id))
          return res.status(400).json({ok:false,error:"Invalid sandbox packet settlement"});
        await db.query(
          "INSERT INTO packet_sandbox_paid_holds "+
          "(stripe_session_id,stripe_event_id,user_id,case_id,status,court_fee_cents,payment_method) "+
          "VALUES ($1,$2,$3,$4,'paid_hold',10000,'lob_check') "+
          "ON CONFLICT (stripe_session_id) DO NOTHING",
          [current.id,event.id,current.metadata.userId,current.metadata.saved_case_id]
        );
        return res.json({received:true,mode:"sandbox_only",status:"paid_hold"});
      }catch{
        return res.status(503).json({ok:false,error:"Sandbox verification or database unavailable; Stripe should retry"});
      }
    }
  );
  return app;
}
