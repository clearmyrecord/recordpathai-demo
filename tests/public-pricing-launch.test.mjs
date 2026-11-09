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

test("Website publishes verified lifetime RecordWatch checkout without inventing full filing availability", () => {
  assert.match(home, /RecordWatch Premium is live/);
  assert.match(home, /Only the \$39 RecordWatch purchase is live today/);
  assert.match(recordwatch, /data-recordwatch-checkout="lifetime_case"/);
  assert.match(pricing, /The \$39 one-time RecordWatch purchase|independent \$39 RecordWatch Premium checkout/);
  assert.match(pricing, /not yet available as a bundled purchase|not a live bundle checkout/i);
  assert.match(pricing, /Lob printing and mailing/);
});

test("Wood County example is explicitly $39 + $50 + $100 = $189, and not a paid filing bundle", () => {
  for (const term of ["$39", "$50", "$100", "$189"]) {
    assert.ok(pricing.includes(term), term);
    assert.ok(home.includes(term), term);
  }
  assert.match(pricing, /Wood County Court of Common Pleas, Ohio/);
  assert.match(pricing, /clerkofcourt\.co\.wood\.oh\.us\/189\/Criminal-Division-of-the-Clerk-of-Courts/);
  assert.ok(pricing.includes("$89"));
  assert.match(packet, /This \$189 bundle cannot be purchased here yet/);
  assert.match(how, /signed-packet fulfillment workflow is not live yet/);
});

test("Website distinguishes day-one case tracking from statutory filing eligibility", () => {
  assert.match(pricing, /An application cannot necessarily be filed on the arrest date/);
  assert.match(home, /an arrest alone does not make a case immediately eligible|an arrest alone does not establish eligibility/);
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
