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


// Stronger gate for private production filings. A synthetic demo can reproduce
// the two headings; it must never be mistaken for the clerk's official form.
// The official February 2024 Wood County filing contains these structural
// clauses on its actual address-verification and application pages.
// Normalization accounts for the official PDF's legacy symbol-font encoding.
// This is a document-format check, NOT a substitute for case/legal review.
export function isOfficialWoodConvictionFormPair(rawPageTexts) {
  if (!isWoodConvictionFormPair(rawPageTexts)) return false;
  const [address,application]=rawPageTexts.map(normalizeWoodFormHeading);
  const combined=address+application;
  if (["SANDBOXTEST","SAMPLEONLY","NOTFORCOURTFILING","SYNTHETICPDF","TESTONLY"].some(
    marker=>combined.includes(marker))) return false;
  return [
    "PERSONALIDENTIFIERS",
    "NAMEOFPARTY",
    "POBOXAPARTMENTNUMBER"
  ].every(marker=>address.includes(marker)) && [
    "STATEOFOHIO",
    "CASE",
    "JUDGE",
    "NAMEOFOFFENSECHARGE",
    "OFFENSECODE",
    "DEGREEOFOFFENSE",
    "APPLICANTS",
    "RESPECTFULLYSUBMITTED"
  ].every(marker=>application.includes(marker));
}
