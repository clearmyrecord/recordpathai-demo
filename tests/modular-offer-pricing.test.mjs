import test from "node:test";
import assert from "node:assert/strict";
import {previewModularCheckout} from "../src/modular-offer-pricing.js";

test("Independent $39 monitoring, $50 digital packet, and $89 combined offers",()=>{
  const watch=previewModularCheckout({recordwatch:true});
  const packet=previewModularCheckout({packet:true});
  const both=previewModularCheckout({recordwatch:true,packet:true});
  assert.equal(watch.totalCents,3900);
  assert.equal(packet.totalCents,5000);
  assert.equal(both.totalCents,8900);
  for(const offer of [watch,packet,both]){
    assert.equal(offer.canCollect,false);
    assert.equal(offer.requiresManualProviderApproval,false);
    assert.equal(offer.courtFeeChargedByRecordPathAI,false);
  }
});

test("Do not charge an existing paid lifetime entitlement twice",()=>{
  const offer=previewModularCheckout({recordwatch:true,packet:true,hasExistingRecordwatchEntitlement:true});
  assert.equal(offer.totalCents,5000);
  assert.deepEqual(offer.rows.map(row=>row.key),["packet_preparation"]);
});

test("Court fee is not charged by RecordPathAI for digital self-filing",()=>{
  const offer=previewModularCheckout({
    recordwatch:true,packet:true,verifiedCourtFeeCents:10000
  });
  assert.equal(offer.totalCents,8900);
  assert.equal(offer.directCourtPaymentRequired,true);
  assert.equal(offer.courtFeeChargedByRecordPathAI,false);
});

test("Physical filing must wait for a server-verified price and court fee",()=>{
  const pending=previewModularCheckout({recordwatch:true,packet:true,lobMailing:true});
  assert.equal(pending.totalCents,null);
  assert.equal(pending.pending.length,2);
  assert.equal(pending.canCollect,false);
  const partlyKnown=previewModularCheckout({recordwatch:true,packet:true,lobMailing:true,verifiedCourtFeeCents:10000});
  assert.equal(partlyKnown.totalCents,null);
  assert.equal(partlyKnown.pending.length,1);
  const all=previewModularCheckout({
    recordwatch:true,packet:true,lobMailing:true,
    verifiedCourtFeeCents:10000,verifiedLobFulfillmentFeeCents:1200
  });
  assert.equal(all.totalCents,20100);
  assert.equal(all.courtFeeChargedByRecordPathAI,true);
  assert.equal(all.rows.find(x=>x.key==="court_fee_pass_through").kind,"court_fee");
  assert.equal(all.canCollect,false);
});

test("Zero-fee filing and unknown fees remain distinct",()=>{
  const waiver=previewModularCheckout({
    packet:true,lobMailing:true,verifiedCourtFeeCents:0,
    verifiedLobFulfillmentFeeCents:900
  });
  assert.equal(waiver.totalCents,5900);
  assert.equal(waiver.rows.some(row=>row.key==="court_fee_pass_through"),false);
  assert.equal(previewModularCheckout({packet:true,lobMailing:true,verifiedCourtFeeCents:-1,verifiedLobFulfillmentFeeCents:900}).totalCents,null);
});

test("Invalid add-on configurations and negative/partial fees fail closed",()=>{
  assert.throws(()=>previewModularCheckout({lobMailing:true}),/require a prepared packet/);
  const invalid=previewModularCheckout({
    recordwatch:true,packet:true,lobMailing:true,
    verifiedCourtFeeCents:10000,verifiedLobFulfillmentFeeCents:14.50
  });
  assert.equal(invalid.totalCents,null);
  assert.equal(invalid.canCollect,false);
});
