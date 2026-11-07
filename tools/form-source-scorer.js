const OFFICIAL_SIGNALS = ['.gov', '.us', 'clerk', 'court', 'courts', 'commonpleas', 'common-pleas', 'municipal', 'county', 'co.'];
const NEGATIVE_SIGNALS = ['blog', 'avvo', 'justia', 'findlaw', 'lawyer', 'attorney', 'lawfirm', 'directory', 'yelp'];

const FORM_PATTERNS = {
  'record-restriction': ['record restriction', 'restrict arrest record', 'request to restrict'],
  'fdle-certificate': ['fdle certificate', 'certificate of eligibility to expunge', 'certificate of eligibility to seal'],
  'order-of-nondisclosure': ['order of nondisclosure', 'nondisclosure petition'],
  'sealing-conviction': ['conviction', '2953.32', 'seal record of conviction'],
  'sealing-dismissal': ['dismissal', 'dismissed', 'no bill', 'not guilty'],
  'sealing-nonconviction': ['nonconviction', 'non-conviction', '2953.52', 'acquittal'],
  expungement: ['expungement', 'expunge', '2953.39', '2953.37']
};

export function normalizeCourtSlug(value = '') {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function isOfficialSource(url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_SIGNALS.some((token) => host.includes(token));
  } catch {
    return false;
  }
}

export function detectFormType(title = '', url = '', snippet = '') {
  const haystack = `${title} ${url} ${snippet}`.toLowerCase();
  for (const [type, patterns] of Object.entries(FORM_PATTERNS)) {
    if (patterns.some((pattern) => haystack.includes(pattern))) return type;
  }
  return 'unknown';
}

export function scoreFormCandidate(candidate, court) {
  const signals = [];
  let score = 0;
  const url = String(candidate.link || candidate.sourceUrl || '').trim();
  const title = String(candidate.title || candidate.formTitle || '');
  const snippet = String(candidate.snippet || '');
  const haystack = `${url} ${title} ${snippet}`.toLowerCase();

  if (isOfficialSource(url)) {
    score += 40;
    signals.push('official-domain-signal');
  }

  if (url.toLowerCase().includes('.pdf')) {
    score += 20;
    signals.push('direct-pdf');
  }

  if (haystack.includes(court.county.toLowerCase())) {
    score += 10;
    signals.push('county-match');
  }

  if (haystack.includes(normalizeCourtSlug(court.courtType).replace(/-/g, ''))) {
    score += 8;
    signals.push('court-type-match');
  }

  for (const token of ['record sealing', 'expungement', 'application to seal', 'application for sealing', '2953.32', '2953.33', 'dismissal', 'no bill', 'not guilty', 'conviction']) {
    if (haystack.includes(token)) {
      score += 3;
      signals.push(`keyword:${token}`);
    }
  }

  if (NEGATIVE_SIGNALS.some((token) => haystack.includes(token))) {
    score -= 50;
    signals.push('penalty:marketing-or-directory');
  }

  if (!isOfficialSource(url) && !url.toLowerCase().includes('.pdf')) {
    score -= 15;
    signals.push('penalty:weak-source');
  }

  return { score, signals, formType: detectFormType(title, url, snippet) };
}
