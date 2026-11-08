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
test("Homepage distinguishes available tools from unlaunched paid fulfillment",()=>{
  assert.match(html,/id="available-now"/);
  assert.match(html,/href="recordwatch-dashboard\.html"/);
  assert.match(html,/Monthly Premium billing has been tested/);
  assert.match(html,/real subscription charges are not enabled yet/i);
  assert.match(html,/No automatic mailing or filing is offered yet/);
  assert.match(html,/signed-packet preparation and fulfillment launch/);
  assert.ok(!html.includes("Choose a $50 packet and tracked mailing where available"));
});
