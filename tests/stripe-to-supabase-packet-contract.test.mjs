import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {verifiedPacketSession} from "../src/payment-security.js";

const user="11111111-1111-4111-8111-111111111111";
const courtCase="22222222-2222-4222-8222-222222222222";
const paid={id:"cs_live_synthetic",status:"complete",payment_status:"paid",currency:"usd",amount_total:15000,
  metadata:{productType:"record-sealing-packet",userId:user,saved_case_id:courtCase,
    serviceFeeCents:"5000",courtFeeCents:"10000",fulfillmentMode:"lob_check"}};
test("only a correctly owned fully paid $50+$100 packet passes payment gate",()=>{
  assert.equal(verifiedPacketSession(paid,user,courtCase),true);
  for(const broken of [
    {...paid,payment_status:"unpaid"},
    {...paid,status:"open"},
    {...paid,amount_total:5000},
    {...paid,amount_total:14999},
    {...paid,metadata:{...paid.metadata,productType:"packet-sandbox-simulation"}},
    {...paid,metadata:{...paid.metadata,courtFeeCents:"5000"}},
    {...paid,metadata:{...paid.metadata,serviceFeeCents:"4900"}},
    {...paid,metadata:{...paid.metadata,userId:"33333333-3333-4333-8333-333333333333"}},
    {...paid,metadata:{...paid.metadata,saved_case_id:"44444444-4444-4444-8444-444444444444"}}
  ]) assert.equal(verifiedPacketSession(broken,user,courtCase),false,
    JSON.stringify({status:broken.status,amount:broken.amount_total,meta:broken.metadata}));
});
test("Stripe sandbox demo checkout cannot mark a case paid or issue a Lob check",()=>{
  const s=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const start=s.indexOf('app.post("/api/operator/stripe-test-checkout"');
  const end=s.indexOf('app.get("/api/operator/packet/fulfillment-status"',start);
  assert.ok(start>0&&end>start);
  const sandbox=s.slice(start,end);
  assert.match(sandbox,/STRIPE_TEST_SECRET_KEY/);
  assert.match(sandbox,/packet-sandbox-simulation/);
  assert.match(sandbox,/unit_amount:5000/);
  assert.match(sandbox,/unit_amount:10000/);
  assert.doesNotMatch(sandbox,/packet_fulfillment_jobs|paid_hold|lob\.com/);
});
test("signed packet webhook is separate from RecordWatch and creates hold, never sends check",()=>{
  const s=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const start=s.indexOf('app.post("/api/stripe/webhook"');
  const end=s.indexOf('app.post("/api/packet/private-upload"',start);
  const handler=s.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(handler,/webhooks\.constructEvent/);
  assert.match(handler,/verifiedPacketSession\(session,owner,caseId\)/);
  assert.match(handler,/packet_fulfillment_jobs/);
  assert.match(handler,/resolution=ignore-duplicates/);
  assert.match(handler,/status:"paid_hold"/);
  assert.doesNotMatch(handler,/api\.lob\.com|dispatch-lob/);
});
test("atomic dispatch transaction prevents same-case retries after attempt",()=>{
  const sql=fs.readFileSync(new URL("../supabase/migrations/20261111000000_atomic_packet_lob_dispatch.sql",import.meta.url),"utf8");
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/attempted_at is null/);
  assert.match(sql,/lob_check_id is null/);
  assert.match(sql,/status = 'paid_hold'/);
  assert.match(sql,/revoke all on function public\.reserve_packet_lob_dispatch/);
  assert.match(sql,/grant execute.*?service_role/s);
});
