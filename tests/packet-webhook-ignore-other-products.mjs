import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
test("packet Stripe webhook acknowledges RecordWatch and other checkout events",()=>{
 const a=server.indexOf('app.post("/api/stripe/webhook"');
 const b=server.indexOf('app.post("/api/packet/private-upload"',a);
 assert.ok(a>0 && b>a);
 const route=server.slice(a,b);
 const shared=server.slice(server.indexOf('async function reconcilePaidPacketCheckout'),a);
 assert.ok(shared.includes('session?.metadata?.productType!=="record-sealing-packet"'));
 assert.ok(shared.indexOf('session?.metadata?.productType!=="record-sealing-packet"')<shared.indexOf('verifiedPacketSession(current,owner,caseId)'));
 assert.ok(shared.includes('return res.json({received:true,ignored:true});'));
 assert.ok(shared.includes('status:"paid_hold"'));
 assert.ok(shared.includes('stripe.checkout.sessions.retrieve(session.id)'));
 assert.ok(route.includes('return await reconcilePaidPacketCheckout(session,res,event)'));
 assert.ok(route.includes('stripe.webhooks.constructEvent'));
});