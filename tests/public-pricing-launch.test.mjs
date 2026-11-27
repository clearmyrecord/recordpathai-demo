import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const home = read("index.html");
const pricing = read("pricing.html");
const recordwatch = read("recordwatch.html");
const packet = read("packet.html");
const how = read("how-it-works.html");
const sitemap = read("sitemap.xml");

test("Public pages identify the live conviction mailing and separate monitoring price", () => {
  for (const page of [home, pricing, recordwatch, packet, how]) {
    for (const fee of ["$39", "$50", "$100", "$150"]) assert.ok(page.includes(fee), fee);
    assert.match(page, /tax included|including tax/i);
    assert.doesNotMatch(page, /Only the \$39 RecordWatch purchase is live today|full workflow launches/);
  }
  assert.match(recordwatch, /data-recordwatch-checkout="lifetime_case"/);
  assert.match(pricing, /operator releases both signed forms/);
  assert.match(packet, /dismissal packets are available for digital delivery/);
});

test("Website distinguishes day-one case tracking from statutory filing eligibility", () => {
  assert.match(pricing, /An application cannot necessarily be filed on the arrest date/);
  assert.match(home, /an arrest alone does not make a case immediately eligible|an arrest alone does not establish eligibility/i);
  assert.match(pricing, /When court rules permit several charges or cases on a single sealing application/);
  assert.match(pricing, /live \$39 RecordWatch checkout is still linked to one saved case/);
});

test("The new pricing page is discoverable across core customer journey", () => {
  for (const path of ["index.html","recordwatch.html","eligibility.html","record-details.html","results.html","packet.html","dashboard.html","account.html","recordwatch-dashboard.html"]) {
    assert.match(read(path), /href="pricing\.html"/, path);
  }
  assert.match(sitemap, /https:\/\/recordpathai\.com\/pricing\.html/);
  assert.match(sitemap, /https:\/\/recordpathai\.com\/recordwatch\.html/);
});

test("Homepage keeps the consumer funnel and links to the separate attorney suite from primary navigation", () => {
  const nav = home.match(/<nav class="nav" id="primary-navigation"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  assert.match(nav, /<a href="professional\.html">Attorneys<\/a>/);
  assert.match(nav, /href="eligibility\.html" class="nav-cta"/);
  assert.doesNotMatch(home, /id="professional-suite"|Grow your practice\. Not your paperwork\./);
  assert.match(home, /id="available-now"/);
  assert.match(home, /id="why-seal"/);
  assert.match(read("professional.html"), /RecordPathAI Professional/);
});
