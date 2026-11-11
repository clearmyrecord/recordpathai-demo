import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
test("packet Stripe webhook acknowledges RecordWatch and other checkout events",()=>{
 const a=server.indexOf('app.post("/api/stripe/webhook"');
 const b=server.indexOf('app.post("/api/packet/private-upload"',a);
 assert.ok(a>0 && b>a);
 const route=server.slice(a,b);
 assert.ok(route.includes('session?.metadata?.productType!=="record-sealing-packet"'));
 assert.ok(route.indexOf('session?.metadata?.productType!=="record-sealing-packet"')<route.indexOf('verifiedPacketSession(session,owner,caseId)'));
 assert.ok(route.includes('return res.json({received:true,ignored:true});'));
 assert.ok(route.includes('status:"paid_hold"'));
 assert.ok(route.includes('stripe.webhooks.constructEvent'));
});