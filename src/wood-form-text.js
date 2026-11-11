// Some court PDFs encode ordinary Latin glyphs in the Unicode Private Use
// Area (e.g. U+F053 spells S). Decode only that documented code range,
// and normalize solely for required form-heading identification.
// No document alteration, text OCR, nor eligibility determination occurs.
export function normalizeCourtPdfHeading(input="") {
  return Array.from(String(input??""),char=>{
    const n=char.codePointAt(0);
    return n>=0xF000 && n<=0xF0FF ? String.fromCharCode(n-0xF000) : char;
  }).join("").normalize("NFKC").replace(/[^A-Za-z]/g,"").toUpperCase();
}
export function isWoodTwoFormPacket(texts) {
  if(!Array.isArray(texts)||texts.length!==2)return false;
  const [address,application]=texts.map(normalizeCourtPdfHeading);
  return address.includes("ADDRESSVERIFICATION") &&
    application.includes("APPLICATIONTOSEALRECORD");
}
