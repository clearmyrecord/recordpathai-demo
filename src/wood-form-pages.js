// Official Wood County forms sometimes encode ASCII glyphs in PDF
// Private Use Area U+F000..U+F0FF. Normalize only extracted heading text.
// This does not alter signed PDFs, applicant data or the court's template.
export function normalizeWoodFormHeading(value) {
  let letters = "";
  for (const char of String(value ?? "")) {
    const code = char.codePointAt(0);
    const normalized = code >= 0xF000 && code <= 0xF0FF
      ? String.fromCharCode(code - 0xF000) : char;
    if (/^[a-z]$/i.test(normalized)) letters += normalized.toUpperCase();
  }
  return letters;
}

// Fail closed unless the PDF contains the two actual form headings, in order,
// and does not contain the eligibility-guide heading.
export function isWoodConvictionFormPair(rawPageTexts) {
  if (!Array.isArray(rawPageTexts) || rawPageTexts.length !== 2) return false;
  const headings = rawPageTexts.map(normalizeWoodFormHeading);
  if (headings.some(text => text.includes("CANISEALOREXPUNGEMYCRIMINALRECORD"))) return false;
  return headings[0].includes("ADDRESSVERIFICATION") &&
    headings[1].includes("APPLICATIONTOSEALRECORD") &&
    headings[1].includes("CONVICTION");
}
