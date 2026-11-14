// Standalone staging process. MUST NEVER run in production Cloud Run service.
import Stripe from "stripe";
import pg from "pg";
import {createPacketSandboxWebhookApp} from "../src/packet-sandbox-webhook.js";

const requireEnv=name=>{
  const value=process.env[name];
  if(!value)throw new Error(name+" is required in sandbox staging only");
  return value;
};
if(process.env.RPAI_PACKET_SANDBOX_ONLY!=="true")
  throw new Error("Explicit sandbox-only execution flag missing");
for(const name of ["RECORDPATH_LIVE_PACKET_CHECKOUT","LOB_LIVE_CHECKS_ENABLED",
  "LOB_CHECK_ATTACHMENTS_APPROVED","RECORDPATH_ENABLE_LIVE_DISPATCH"]){
  if(process.env[name]==="true")throw new Error("Cannot run staging with a live activation flag");
}
const key=requireEnv("STRIPE_TEST_SECRET_KEY");
const signingSecret=requireEnv("STRIPE_TEST_PACKET_WEBHOOK_SECRET");
if(!key.startsWith("sk_test_")||!signingSecret.startsWith("whsec_"))
  throw new Error("Only Stripe test keys and test webhook secrets are allowed");
const conn=requireEnv("RPAI_SANDBOX_DATABASE_URL");
const parsed=new URL(conn);
if(!["postgres:","postgresql:"].includes(parsed.protocol)||
   parsed.pathname!=="/recordpathai_packet_sandbox")
  throw new Error("Refusing connection to any database except recordpathai_packet_sandbox");
const db=new pg.Pool({connectionString:conn,max:3});
try{
  const result=await db.query("SELECT current_database() AS name, "+
    "to_regclass('public.packet_sandbox_paid_holds')::text AS table_name");
  if(result.rows[0]?.name!=="recordpathai_packet_sandbox"||
     !result.rows[0]?.table_name)
    throw new Error("Isolated sandbox database/table identity failed");
  const app=createPacketSandboxWebhookApp({
    stripeClient:new Stripe(key),db,signingSecret
  });
  const port=Number(process.env.PORT||8080);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid PORT");
  const server=app.listen(port,()=>{
    process.stdout.write("Sandbox-only Stripe packet webhook listening on port "+port+"\n");
  });
  const shutdown=()=>{
    server.close(()=>db.end().then(()=>process.exit(0)));
  };
  process.on("SIGINT",shutdown);
  process.on("SIGTERM",shutdown);
}catch(error){
  await db.end();
  throw error;
}
