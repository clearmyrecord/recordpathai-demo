import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const page = readFileSync(new URL("../packet.html", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("Step 3 readiness button is usable even if async account loading fails", () => {
  assert.match(page, /id="generateSealingBtn">Review Packet Readiness<\/button>/);
  const handlerPosition = page.indexOf('step3ActionButton.addEventListener("click"');
  const firstAccountLoad = page.indexOf('if (!await loadCaseFromUrl()) return;');
  assert.ok(handlerPosition > 0 && firstAccountLoad > 0 && handlerPosition < firstAccountLoad);
  assert.equal(page.split('step3ActionButton.addEventListener("click"').length - 1, 1);
  assert.doesNotMatch(page, /generateBtn\.addEventListener\("click", startCheckout\)/);
  assert.match(page, /packetStep3Initialized = true;/);
  assert.match(page, /callout\.style\.display = "block"/);
});

test("Pending approval makes the button explain the server blockers, not silently fail", () => {
  const checkout = page.split("async function startCheckout(event)")[1]?.split("// Do not import RecordWatch", 1)[0];
  assert.ok(checkout);
  assert.match(checkout, /inspectPacketReadiness\(/);
  assert.match(checkout, /review\.missing/);
  assert.match(checkout, /setCheckoutError\(message\)/);
  assert.match(checkout, /No payment was taken/);
  assert.match(checkout, /checkServerPacketReadiness\(/);
});

test("Live Stripe and approved preview remain enforced on the server", () => {
  assert.match(server, /RECORDPATH_DIGITAL_PACKET_CHECKOUT_ENABLED==="true"/);
  const route = server.split('app.post("/api/create-checkout-session"')[1]?.split('app.get("/api/find-packet"', 1)[0];
  assert.ok(route);
  assert.match(route, /packetReleaseStatus\(checkoutUser\.id,savedCaseId,deliveryMode\)/);
  assert.match(route, /previewHasConfirmation\(checkoutUser\.id,savedCaseId\)/);
  assert.ok(route.indexOf("if(!previewConfirmed)") < route.indexOf("stripe.checkout.sessions.create("));
});

test("Inline packet page JavaScript parses without syntax errors", () => {
  const match = page.match(/<script>\s*(document\.addEventListener\("DOMContentLoaded"[\s\S]*?)<\/script>/);
  assert.ok(match, "expected Step 3 page inline bootstrap script");
  assert.doesNotThrow(() => new Script(match[1], { filename: "packet.html:inline" }));
});
