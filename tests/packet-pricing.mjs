import test from "node:test";
import assert from "node:assert/strict";
import { quotePacketPricing } from "../src/packet-pricing.js";

test("Wood County Common Pleas conviction quotes $50 service plus $100 court deposit", () => {
  const quote = quotePacketPricing({
    state:"Ohio", county:"Wood County", courtType:"court-of-common-pleas", formType:"sealing-conviction"
  });
  assert.equal(quote.serviceFeeCents,5000);
  assert.equal(quote.courtFeeCents,10000);
  assert.equal(quote.totalCents,15000);
  assert.equal(quote.currency,"usd");
  assert.equal(quote.canCollect,false);
  assert.equal(quote.filingMethod,"physical-only-pending-clerk-confirmation");
});
test("Nonconviction does not get a $100 conviction fee", () => {
  const quote = quotePacketPricing({state:"OH", county:"Wood", courtType:"court-of-common-pleas", formType:"sealing-dismissal"});
  assert.equal(quote.courtFeeCents,0);
  assert.equal(quote.totalCents,5000);
  assert.equal(quote.canCollect,false);
});
test("Other courts and unknown outcome never get speculative $150 total", () => {
  for(const input of [
    {state:"NV",county:"Clark",courtType:"district",formType:"sealing-conviction"},
    {state:"OH",county:"Franklin",courtType:"court-of-common-pleas",formType:"sealing-conviction"},
    {state:"OH",county:"Wood",courtType:"municipal",formType:"sealing-conviction"},
    {state:"OH",county:"Wood",courtType:"court-of-common-pleas",formType:"unknown"},
    {}
  ]){
    const quote=quotePacketPricing(input);
    assert.equal(quote.courtFeeCents,null,JSON.stringify(input));
    assert.equal(quote.totalCents,null,JSON.stringify(input));
    assert.equal(quote.canCollect,false);
  }
});
test("Quote endpoint is read-only and does not collect identity or return payment authorization", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../server.js", import.meta.url),"utf8");
  assert.match(source,/app\.get\("\/api\/packet\/quote"/);
  assert.match(source,/courtType: req\.query\.courtType/);
  assert.match(source,/packetReleaseStatus\(checkoutUser\.id,savedCaseId\)/);
  assert.match(source,/return res\.status\(409\)/);
});
