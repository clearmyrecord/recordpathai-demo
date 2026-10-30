import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_OFFICIAL_PDF_BYTES = 12 * 1024 * 1024;

export function assertPublicNetworkAddress(address) {
  if (!isIP(address)) throw new Error("Invalid court server address");
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    // Block IPv6 loopback, link-local, unique-local and IPv4-mapped forms.
    if (a === "::" || a === "::1" || a.startsWith("fc") || a.startsWith("fd") ||
        a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") ||
        a.startsWith("feb") || a.startsWith("::ffff:"))
      throw new Error("Court server address is not public");
    return;
  }
  const [a,b] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) || (a === 198 && [18,19].includes(b)))
    throw new Error("Court server address is not public");
}

export async function validateOfficialPdfSource(rawUrl, resolver = lookup) {
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) throw new Error("Invalid court PDF URL");
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("Invalid court PDF URL"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(/\.gov$/.test(host) || /\.us$/.test(host)) ||
      host.endsWith(".") || isIP(host))
    throw new Error("Only official HTTPS .gov or .us court sources are permitted");
  // Check all returned addresses, not just the first; deny split-horizon results.
  const records = await resolver(host,{ all:true });
  if (!Array.isArray(records) || !records.length) throw new Error("Court server DNS lookup failed");
  for (const record of records) assertPublicNetworkAddress(record.address);
  return url.toString();
}

export async function readBoundedPdfResponse(response, maxBytes = MAX_OFFICIAL_PDF_BYTES) {
  if (!response.ok) throw new Error("Court source unavailable");
  const type = response.headers.get("content-type") || "";
  if (!/application\/pdf/i.test(type)) throw new Error("Court source is not a PDF");
  const claimedSize = Number(response.headers.get("content-length") || 0);
  if (claimedSize > maxBytes) throw new Error("Court PDF exceeds maximum size");
  if (!response.body) throw new Error("Empty court PDF");
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maxBytes) { await response.body.cancel?.().catch(()=>{}); throw new Error("Court PDF exceeds maximum size"); }
    chunks.push(Buffer.from(chunk));
  }
  const result = Buffer.concat(chunks);
  if (result.subarray(0,5).toString("ascii") !== "%PDF-") throw new Error("Court source is not valid PDF content");
  return result;
}
