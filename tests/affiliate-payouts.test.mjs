import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  validatedAffiliateRecipientId, restrictedPayoutKeyConfigured,
  eligibleAffiliateCommissions, affiliatePayoutAmount,
  affiliatePayoutAllowed, hasActiveUsAchRecipient,
  validatePayoutIntent, shouldRecordPayoutPaid
} from "../src/affiliate-payouts.js";
import {AFFILIATE_MIN_PAYOUT_CENTS} from "../src/affiliate-program.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const now=new Date("2026-12-12T10:00:00.000Z");
const partner={status:"approved",compliance_approved_at:"2026-11-01T00:00:00.000Z",
  tax_reviewed_at:"2026-11-14T00:00:00.000Z",payouts_paused:false,
  stripe_recipient_account_id:"acct_1234ABCD"};
const commissions=Array.from({length:7},(_,i)=>({
  id:"c"+i,status:"approved",commission_cents:780,
  available_after:"2026-12-08T00:00:00.000Z",payout_batch_id:null
}));

test("Payout floor applies only to mature, approved and unreserved earnings",()=>{
  assert.equal(AFFILIATE_MIN_PAYOUT_CENTS,5000);
  assert.equal(affiliatePayoutAmount(commissions,now),5460);
  assert.equal(affiliatePayoutAllowed(partner,commissions,now).ready,true);
  assert.equal(affiliatePayoutAllowed(partner,commissions.slice(0,6),now).ready,false);
  assert.equal(affiliatePayoutAmount([
    ...commissions,{status:"pending",commission_cents:1000,available_after:"2026-12-01"},
    {status:"void",commission_cents:1000,available_after:"2026-12-01"},
    {status:"approved",commission_cents:780,available_after:"2027-01-01"},
    {status:"approved",commission_cents:780,available_after:"2026-12-01",payout_batch_id:"xyz"}
  ],now),5460);
  assert.equal(eligibleAffiliateCommissions(commissions,new Date("2026-12-07")).length,0);
});

test("Payout approval fails closed on unverified recipient, missing tax review and suspension",()=>{
  assert.equal(affiliatePayoutAllowed({...partner,tax_reviewed_at:null},commissions,now).ready,false);
  assert.equal(affiliatePayoutAllowed({...partner,payouts_paused:true},commissions,now).ready,false);
  assert.equal(affiliatePayoutAllowed({...partner,status:"pending"},commissions,now).ready,false);
  assert.equal(affiliatePayoutAllowed({...partner,stripe_recipient_account_id:""},commissions,now).ready,false);
  assert.equal(validatedAffiliateRecipientId("acct_1234ABCD"),"acct_1234ABCD");
  assert.equal(validatedAffiliateRecipientId("acct_test_1234ABCD"),"acct_test_1234ABCD");
  assert.equal(validatedAffiliateRecipientId("not_stripe_account"),"");
  assert.equal(restrictedPayoutKeyConfigured("sk_live_abc123",true),false);
  assert.equal(restrictedPayoutKeyConfigured("rk_live_abc123",true),true);
  assert.equal(restrictedPayoutKeyConfigured("rk_test_abc123",true),false);
});

test("Stripe recipient, payout bank account and exact immutable batch amount must match",()=>{
  const account={identity:{country:"US"},
    configuration:{recipient:{capabilities:{bank_accounts:{ach:{status:"active"}}}}}};
  assert.equal(hasActiveUsAchRecipient(account),true);
  assert.equal(hasActiveUsAchRecipient({...account,identity:{country:"CA"}}),false);
  const intent={id:"poi_1234ABC",confirmation_method:"manual",
    from:{financial_account:"fa_ABC",currency:"usd"},
    to:{recipient:"acct_1234ABCD"},amount:{value:5460,currency:"usd"}};
  const expectation={recipient:"acct_1234ABCD",financialAccount:"fa_ABC",amountCents:5460};
  assert.equal(validatePayoutIntent(intent,expectation),intent);
  assert.throws(()=>validatePayoutIntent({...intent,to:{recipient:"acct_wrong"}},expectation));
  assert.throws(()=>validatePayoutIntent({...intent,amount:{value:6000,currency:"usd"}},expectation));
  assert.throws(()=>validatePayoutIntent({...intent,confirmation_method:"automatic"},expectation));
  assert.equal(shouldRecordPayoutPaid("processing"),false);
  assert.equal(shouldRecordPayoutPaid("requires_action"),false);
  assert.equal(shouldRecordPayoutPaid("posted"),true);
});

test("Private-only payout API retains separated keys and operator approval",()=>{
  const service=read("src/affiliate-payout-service.js");
  const sql=read("supabase/migrations/20261109030000_affiliate_payouts.sql");
  const page=read("partners-admin.html");
  assert.match(service,/requireOperationsKey\(req,res\)/);
  assert.match(service,/AFFILIATE_OWNER_USER_ID/);
  assert.match(service,/STRIPE_AFFILIATE_PAYOUT_KEY/);
  assert.match(service,/confirmation_method:"manual"/);
  assert.match(service,/recordpath-affiliate-payout-confirm-/);
  assert.match(service,/\/api\/affiliates\/ops\/review-commissions/);
  assert.match(service,/\/api\/affiliates\/ops\/reconcile/);
  assert.match(service,/charge\.amount_refunded/);
  assert.match(sql,/reserve_affiliate_payout_batch/);
  assert.match(sql,/for update/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on function public\.reserve_affiliate_payout_batch/);
  assert.match(page,/noindex,nofollow/);
  assert.doesNotMatch(service,/stripe\.transfers\.create/);
});
