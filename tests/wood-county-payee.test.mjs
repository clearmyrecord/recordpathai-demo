import test from "node:test";
import assert from "node:assert/strict";
import { courtFilingPlan,findCourtProfile } from "../src/court-profiles.js";
const profile={state:"OH",county:"wood",courtType:"common-pleas"};
test("Wood County check payee matches the Clerk's published instructions",()=>{
  const court=findCourtProfile(profile);
  assert.equal(court.courtFeePayee,"Wood County Clerk of Courts");
  assert.equal(court.payeeSource,"https://clerkofcourt.co.wood.oh.us/166/Make-a-Payment");
  assert.equal(court.postalAddress.address_line1,"One Courthouse Square");
  assert.equal(court.postalAddress.address_city,"Bowling Green");
});
test("Clerk payee verification does not authorize mail or automatic filing",()=>{
  const filing=courtFilingPlan({...profile,formType:"conviction"});
  assert.equal(filing.courtFeeCents,10000);
  assert.equal(filing.courtFeePayee,"Wood County Clerk of Courts");
  assert.equal(filing.mailReady,false);
  assert.equal(filing.onlineFeePaymentReady,false);
});

test("Published Rule 3.03 permits only prepaid searchable email/fax sealing filings",()=>{
  const filing=courtFilingPlan({...profile,formType:"conviction"});
  assert.equal(filing.preferredFilingRoute,"email-searchable-pdf-after-court-prepayment");
  assert.equal(filing.emailFiling.allowedAfterCourtPrepayment,true);
  assert.equal(filing.emailFiling.address,"clerkofcourts@woodcountyohio.gov");
  assert.equal(filing.emailFiling.fax,"419-354-9241");
  assert.equal(filing.emailFiling.maxPdfBytes,25*1024*1024);
  assert.equal(filing.emailFiling.physicallySignedSourceRequired,true);
  assert.equal(filing.emailFiling.fileStampOrDocketConfirmationRequired,true);
  assert.equal(filing.onlineFeePaymentReady,false);
  assert.equal(filing.mailReady,false);
});
