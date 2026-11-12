import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
  AFFILIATE_COMMISSION_BPS, AFFILIATE_MIN_PAYOUT_CENTS,
  normalizeAffiliateCode,newAffiliateCode,eligibleAffiliatePurchase,
  affiliateCommissionCents,commissionAvailableAfter
} from "../src/affiliate-program.js";

const read = file => readFileSync(new URL("../"+file,import.meta.url),"utf8");
const server=read("server.js"),client=read("js/auth.js"),page=read("partners.html");
const migration=read("supabase/migrations/20261108030000_affiliate_referrals.sql");

test("Commissions are 20% only of platform fees, not court deposits",()=>{
  assert.equal(AFFILIATE_COMMISSION_BPS,2000);
  assert.equal(affiliateCommissionCents("recordwatch_lifetime",3900),780);
  assert.equal(affiliateCommissionCents("packet_preparation",5000),1000);
  assert.equal(affiliateCommissionCents("court_fee",10000),0);
  assert.equal(affiliateCommissionCents("recordwatch_lifetime",15000),0);
  assert.equal(affiliateCommissionCents("packet_preparation",10000),0);
  assert.equal(affiliateCommissionCents("recordwatch_lifetime",3900,1000),390);
  assert.throws(()=>affiliateCommissionCents("recordwatch_lifetime",3900,5000));
  assert.equal(AFFILIATE_MIN_PAYOUT_CENTS,5000);
});

test("Attribution is first-touch, valid for 30 days, never retroactively",()=>{
  const at="2026-11-08T00:00:00.000Z";
  assert.equal(eligibleAffiliatePurchase(at,at),true);
  assert.equal(eligibleAffiliatePurchase(at,"2026-12-07T00:00:00.000Z"),true);
  assert.equal(eligibleAffiliatePurchase(at,"2026-12-09T00:00:00.000Z"),false);
  assert.equal(eligibleAffiliatePurchase(at,"2026-11-07T00:00:00.000Z"),false);
  assert.equal(commissionAvailableAfter(at),"2026-12-08T00:00:00.000Z");
  assert.equal(normalizeAffiliateCode(" rpai12ab34cd56ef "),"RPAI12AB34CD56EF");
  assert.equal(normalizeAffiliateCode("wrong!"),"");
  assert.equal(newAffiliateCode("c08d053f-63c7-4a65-997c-df0c40253c15"),"RPAIC08D053F63C7");
});

test("Affiliate tables are private, partner-approved and payout-disabled by default",()=>{
  assert.match(migration,/alter table public.affiliate_partners enable row level security/);
  assert.match(migration,/alter table public.affiliate_referrals enable row level security/);
  assert.match(migration,/alter table public.affiliate_commissions enable row level security/);
  assert.match(migration,/revoke all on public.affiliate_partners,public.affiliate_referrals,public.affiliate_commissions/);
  assert.match(migration,/stripe_checkout_session_id text not null unique/);
  assert.match(migration,/compliance_approved_at timestamptz/);
  assert.match(server,/AFFILIATE_PROGRAM_ENABLED === "true"/);
  assert.match(server,/automatic_payouts_enabled:false/);
  assert.match(server,/partner\.user_id===userId/);
  assert.match(server,/ref\.attributed_at,paidAt,AFFILIATE_ATTRIBUTION_DAYS/);
  assert.match(server,/status:"pending",earned_at:paidAt/);
  assert.match(server,/voidAffiliateCommission\(piId,dispute\?"dispute":"refund"\)/);
  assert.match(server,/recordAffiliateCommission\(verified,"recordwatch_lifetime",verified\.metadata\.user_id,RECORDWATCH_LIFETIME_CENTS\)/);
  assert.match(server,/recordAffiliateCommission\(current,"packet_preparation",owner,PACKET_PRICE_CENTS\)/);
});

test("No affiliate access to customer criminal records or auto-disbursal",()=>{
  assert.match(server,/\/api\/affiliates\/me/);
  assert.doesNotMatch(server,/affiliate_commissions[\s\S]{0,220}stripe\.transfers\.create/);
  assert.match(page,/Court fees and third-party costs/);
  assert.match(page,/conviction filing deposit belongs to the court/);
  assert.match(page,/No payments to judges, clerks, court employees/);
  assert.match(page,/Paid promotion must clearly disclose/);
  assert.match(page,/Payouts are reviewed manually/);
  assert.match(client,/recordpathaiFirstAffiliateRef/);
  assert.match(client,/claimReferralAfterSignIn/);
});
