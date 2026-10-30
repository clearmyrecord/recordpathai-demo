import test from "node:test";
import assert from "node:assert/strict";
import { verifiedPacketSession,verifiedRecordwatchSession,safeCheckoutRedirect,assertFixedPacketAmount } from "../src/payment-security.js";

const userId = "test-user-9";
const packet = {
  id:"cs_test_a1",status:"complete",payment_status:"paid",currency:"usd",amount_total:5000,
  metadata:{productType:"record-sealing-packet",userId}
};
const watch = {
  id:"cs_test_a2",status:"complete",payment_status:"paid",currency:"usd",
  metadata:{product:"premium_recordwatch",user_id:userId,plan:"monthly"}
};
test("Packet unlock depends on server-authenticated paid Stripe session ownership",()=>{
 assert.equal(verifiedPacketSession(packet,userId),true);
 for (const override of [
  {payment_status:"unpaid"},{status:"open"},{amount_total:4999},
  {currency:"eur"},{metadata:{productType:"record-sealing-packet",userId:"another"}},
  {metadata:{userId}},{metadata:{}}
 ])assert.equal(verifiedPacketSession({...packet,...override},userId),false,JSON.stringify(override));
});
test("RecordWatch payment must be paid, linked to authenticated owner and correct product",()=>{
 assert.equal(verifiedRecordwatchSession(watch,userId),true);
 assert.equal(verifiedRecordwatchSession({...watch,payment_status:"unpaid"},userId),false);
 assert.equal(verifiedRecordwatchSession({...watch,metadata:{...watch.metadata,user_id:"other"}},userId),false);
 assert.equal(verifiedRecordwatchSession({...watch,metadata:{...watch.metadata,product:"packet_generation"}},userId),false);
 assert.equal(verifiedRecordwatchSession({...watch,metadata:{...watch.metadata,plan:"anything"}},userId),false);
});
test("Fixed packet price cannot be set by browser",()=>{
 assert.doesNotThrow(()=>assertFixedPacketAmount(5000,"usd"));
 assert.throws(()=>assertFixedPacketAmount(1,"usd"));
 assert.throws(()=>assertFixedPacketAmount(5000,"eur"));
});
test("Checkout redirects must stay on the existing website",()=>{
 const origin="https://recordpathai.com";
 const success=safeCheckoutRedirect("/payment-success.html",origin,"/payment-success.html");
 assert.equal(success,origin+"/payment-success.html");
 for(const url of [
  "https://attacker.example/steal",
  "//attacker.example/steal",
  "https://recordpathai.com.evil.example/steal",
  "javascript:alert(1)",
  "https://user:password@recordpathai.com/payment-success.html"
 ]) assert.throws(()=>safeCheckoutRedirect(url,origin,"/payment-success.html"),url);
});
test("Source routes never promote browser local storage or confirmation booleans",async()=>{
 const fs=await import("node:fs/promises");
 const server=await fs.readFile(new URL("../server.js",import.meta.url),"utf8");
 const packetPage=await fs.readFile(new URL("../packet.html",import.meta.url),"utf8");
 const success=await fs.readFile(new URL("../payment-success.html",import.meta.url),"utf8");
 assert(!server.includes("payload.payment_confirmed"));
 assert(server.includes("verifiedPacketSession(session, user.id)"));
 assert(server.includes("const checkoutUser = await requireApiUser(req, res)"));
 assert(server.includes("userId: checkoutUser.id"));
 assert(packetPage.includes('await syncPaymentCompletionFromUrl();'));
 assert(!packetPage.includes('localStorage.setItem(PAYMENT_STORAGE_KEY, "true")'));
 assert(!success.includes('localStorage.setItem("recordPathPaymentComplete", "true")'));
 assert(success.includes('"/api/packet/verify-payment"'));
});
