import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectFormType, scoreFormCandidate } from './form-source-scorer.js';
import { discoveryQueries, isWave1, pdfStorageRelativePath } from "./form-query-builder.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const CATALOG_PATH = path.join(repoRoot, 'data', 'court-catalog.json');
const COUNTIES_PATH = path.join(repoRoot, 'data', 'ohio-counties.json');
const WAVE1_CATALOG_PATH = path.join(repoRoot, 'data', 'wave1-court-catalog.json');
const REVIEW_QUEUE_PATH = path.join(repoRoot, 'admin', 'review-queue.json');

const args = process.argv.slice(2);
const getArg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const DRY_RUN = !args.includes('--apply');
const filters = { state: getArg('state')?.toUpperCase(), county: getArg('county'), tier: getArg('tier'), wave1:args.includes('--wave1') };
const limitedWave1=filters.wave1 || isWave1(filters.state);
const countyLimit=Number(getArg('limit') || (limitedWave1 ? 5 : 1000));
const queryLimit=Number(getArg('queries') || (limitedWave1 ? 1 : 5));
if(!Number.isInteger(countyLimit)||countyLimit<1||(limitedWave1&&countyLimit>15)||
   !Number.isInteger(queryLimit)||queryLimit<1||(limitedWave1&&queryLimit>2))
  throw new Error('Wave 1 discovery hard-capped at 15 counties × 2 queries per run');

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SEARCH_QUERIES = discoveryQueries;

async function readJson(filePath, fallback) { try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return fallback; } }
const nowIso = () => new Date().toISOString();

async function searchSerp(query) {
  if (!SERPAPI_KEY) return [];
  const u = new URL('https://serpapi.com/search.json');
  u.searchParams.set('engine', 'google'); u.searchParams.set('q', query); u.searchParams.set('api_key', SERPAPI_KEY);
  const r = await fetch(u); if (!r.ok) return [];
  const p = await r.json();
  return (p.organic_results || []).map((x) => ({ title: x.title, link: x.link, snippet: x.snippet || '' }));
}

async function tryDownloadPdf(url, localPath) {
  const r = await fetch(url, { headers: { 'user-agent': 'RecordPathAI Form Crawler/2.0' } });
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  const type = (r.headers.get('content-type') || '').toLowerCase();
  if (!url.toLowerCase().includes('.pdf') && !type.includes('pdf')) throw new Error('Not a PDF content-type');
  const bytes = Buffer.from(await r.arrayBuffer());
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, bytes);
}

function buildMetadata(court, candidate, scored, pdfAccess, localPath = '') {
  return {
    state: court.state,
    county: court.county,
    countySlug: court.countySlug,
    courtName: court.courtName,
    courtType: court.courtType,
    formType: scored.formType || detectFormType(candidate.title, candidate.link, candidate.snippet),
    sourceUrl: candidate.link || '',
    sourcePageUrl: candidate.sourcePageUrl || candidate.link || '',
    localPath,
    pdfAccess,
    status: 'pending_review',
    requiresMapping: true,
    mapped: false,
    active: false,
    discoveredAt: nowIso(),
    lastVerified: nowIso(),
    score: scored.score,
    signals: scored.signals
  };
}

(async function main() {
  const [ohioCatalog, wave1Catalog, counties, existingQueue] = await Promise.all([
    readJson(CATALOG_PATH, []), readJson(WAVE1_CATALOG_PATH, []),
    readJson(COUNTIES_PATH, []), readJson(REVIEW_QUEUE_PATH, [])
  ]);
  const catalog = filters.wave1
    ? wave1Catalog
    : (filters.state && isWave1(filters.state) ? wave1Catalog : ohioCatalog);

  const countyBySlug = new Map(counties.map((c) => [c.slug, c]));
  const courts = catalog.filter((court) => {
    if (filters.state && court.state !== filters.state) return false;
    if (filters.county && court.countySlug !== filters.county.toLowerCase()) return false;
    if (filters.wave1 && !isWave1(court.state)) return false;
    if (filters.tier && !isWave1(court.state)) return countyBySlug.get(court.countySlug)?.tier === filters.tier;
    if (filters.tier && isWave1(court.state)) return false;
    return true;
  }).slice(0,countyLimit);

  const dedupe = new Set(existingQueue.map((q) => `${q.sourceUrl}|${q.localPath}`));
  const queue = [...existingQueue];
  const discoveredInRun = [];

  for (const court of courts) {
    console.log(`Scanning: ${court.courtName}`);
    let best = null;
    for (const query of SEARCH_QUERIES(court).slice(0,queryLimit)) {
      try {
        const results = await searchSerp(query);
        for (const candidate of results) {
          const scored = scoreFormCandidate(candidate, court);
          if (scored.score < 10) continue;
          if (!best || scored.score > best.scored.score) best = { candidate: { ...candidate, searchQuery: query }, scored };
        }
      } catch (e) {
        console.warn(`Query failed (${query}): ${e.message}`);
      }
    }

    if (!best) { console.warn(`No viable candidates for ${court.courtName}`); continue; }

    const formType = best.scored.formType || 'unknown';
    const localPathRel = pdfStorageRelativePath(court,formType);
    const localPathAbs = path.join(repoRoot, localPathRel);
    let pdfAccess = 'unknown';
    let localPath = '';

    if (isWave1(court.state)) {
      // Search-engine ranking cannot authorize remote file retrieval or a
      // county-specific form. Wave 1 is provenance/review queue ONLY.
      pdfAccess = 'manual_source_verification_required';
    } else if ((best.candidate.link || '').toLowerCase().includes('.pdf')) {
      if (!DRY_RUN) {
        try {
          await tryDownloadPdf(best.candidate.link, localPathAbs);
          pdfAccess = 'downloaded';
          localPath = localPathRel;
        } catch {
          pdfAccess = 'manual_download_required';
        }
      } else {
        pdfAccess = 'unknown';
      }
    } else {
      pdfAccess = 'manual_download_required';
    }

    const metadata = buildMetadata(court, best.candidate, best.scored, pdfAccess, localPath);
    if(isWave1(court.state)){
      metadata.status='source_verification_required';
      metadata.active=false;
      metadata.mapped=false;
      metadata.requiresMapping=true;
      metadata.routeHint=court.routeHint||'manual_review';
      metadata.officialPageLead=court.formsPage||'';
      metadata.sourceNotes='Search result is a lead only; verify official authority, form type and current version before downloading or mapping.';
    }
    const key = `${metadata.sourceUrl}|${metadata.localPath}`;
    if (!dedupe.has(key)) {
      discoveredInRun.push(metadata);
      if (!DRY_RUN) {
        queue.push(metadata);
        dedupe.add(key);
      }
    }

    if (!DRY_RUN && pdfAccess === 'downloaded') {
      const metaPath = path.join(repoRoot, `assets/forms/${String(court.state).toLowerCase()}/${court.countySlug}/${court.courtType}/metadata.json`);
      await fs.mkdir(path.dirname(metaPath), { recursive: true });
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    }

    console.log(`Candidate: ${metadata.sourceUrl} [score=${metadata.score}] [access=${metadata.pdfAccess}]`);
  }

  if (!DRY_RUN) {
    await fs.writeFile(REVIEW_QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n');
    console.log(`Done (apply). Updated admin/review-queue.json with ${discoveredInRun.length} discovered items.`);
  } else {
    console.log(`Done (dry-run). Discovered ${discoveredInRun.length} candidate(s). No files were written.`);
  }
})();
