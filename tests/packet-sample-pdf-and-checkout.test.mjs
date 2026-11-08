import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../packet.html", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const registry = JSON.parse(fs.readFileSync(new URL("../templates/index.json", import.meta.url), "utf8"));

test("packet embedded JavaScript compiles, including checkout and preview click handlers", async () => {
  const { Script } = await import("node:vm");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, "Inline packet script must exist");
  for (const [index, match] of scripts.entries()) {
    const body = match[1].trim();
    if (body) assert.doesNotThrow(() => new Script(body, { filename: "packet-inline-" + index + ".js" }));
  }
});

test("sample PDF check downloads watermarked synthetic fields and user-drawn signature only", () => {
  assert.match(html, /id="downloadSamplePdfBtn"/);
  assert.match(html, /Test Signed PDF/);
  assert.match(html, /id="packetEstimatedTotal"/);
  assert.match(html, /renderPacketFeeQuote\(raw\)/);
  assert.match(html, /addEventListener\("click", downloadSamplePdf\)/);
  const section = html.split("async function downloadSamplePdf()")[1]?.split("async function testPdfAccess()")[0];
  assert.ok(section, "Sample preview should be its own action");
  assert.match(section, /loadTemplateRegistry\(/);
  assert.match(section, /loadTemplateMapping\(/);
  assert.match(section, /loadTemplatePdf\(/);
  assert.match(section, /PDFDocument\.load\(/);
  assert.match(section, /pdfDoc\.save\(/);
  assert.match(section, /NOT FOR FILING/);
  assert.match(section, /sample@example\.invalid/);
  assert.doesNotMatch(section, /readPacketData\(/);
  assert.match(section, /embedPng\(signatureImageBytes\)/);
  assert.match(section, /signatureMappings\+\+/);
  assert.match(section, /page\.drawImage\(signature/);
  assert.match(section, /hasUsableDrawnSignature\(\)/);
  assert.match(section, /The court PDF template is missing a mapped signature field/);
  assert.doesNotMatch(section, /startCheckout\(/);
  assert.doesNotMatch(section, /isPacketPaymentComplete\(/);
});

test("actual packet payment still requires checkout verification", () => {
  assert.match(html, /checkServerPacketReadiness\(verifiedCaseId\)/);
  assert.match(html, /Stripe checkout has not opened because Ohio cases are review-only/);
  assert.match(html, /const token = login\?\.data\?\.session\?\.access_token/);
  assert.match(html, /if \(!response\.ok\)/);
  assert.match(html, /Stripe checkout is not configured or temporarily unavailable/);
  assert.match(server, /assertFixedPacketAmount\(amount, currency\)/);
  assert.match(server, /const checkoutUser = await requireApiUser\(req, res\)/);
  assert.match(server, /client_reference_id: internalOrderId/);
  assert.match(server, /quotePacketPricing\(/);
  assert.match(server, /packetReleaseStatus\(checkoutUser\.id,savedCaseId\)/);
  assert.match(server, /Court filing deposit/);
});

test("sample generator uses a reviewed active template and existing mapped PDF", () => {
  const active = registry.filter((item) => item.status === "active");
  assert.ok(active.length, "A reviewed template must exist for test PDF publishing");
  for (const item of active) {
    assert.ok(item.pdfPath && item.mappingPath);
    assert.ok(fs.statSync(new URL("../" + item.pdfPath, import.meta.url)).size > 1000);
    const mapping = JSON.parse(fs.readFileSync(new URL("../" + item.mappingPath, import.meta.url), "utf8"));
    assert.ok(Array.isArray(mapping.mappings) || Array.isArray(mapping.fields));
  }
});
