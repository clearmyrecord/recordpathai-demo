import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("Homepage prioritizes the free three-step eligibility journey",()=>{
  assert.match(html,/href="eligibility\.html" class="nav-cta"/);
  assert.match(html,/Begin Step 1 — Free/);
  for(const term of ["Personal information","Court &amp; case details","Eligibility &amp; next steps"])
    assert.ok(html.includes(term),term);
});
test("Homepage distinguishes available tools from reviewed court mailing",()=>{
  assert.match(html,/id="available-now"/);
  assert.match(html,/href="recordwatch-dashboard\.html"/);
  assert.match(html,/RecordWatch Premium is live/);
  assert.match(html,/Live Stripe checkout, payment verification and refund revocation were tested successfully/i);
  assert.match(html,/operator releases both signed forms/);
  assert.match(html,/after Stripe verifies payment/);
  assert.ok(!html.includes("Choose a $50 packet and tracked mailing where available"));
});

test("Homepage publishes Wood County cost stack without requiring a monitoring purchase",()=>{
  assert.match(html,/id="wood-county-pricing"/);
  assert.match(html,/Wood County, Ohio example/);
  for(const fee of ["$39","$50","$100","$150"])assert.ok(html.includes(fee),fee);
  assert.match(html,/RecordWatch Premium is optional/);
  assert.match(html,/grouped-application checkout|current checkout remains per saved case/i);
  assert.match(html,/href="pricing.html"/);
});
