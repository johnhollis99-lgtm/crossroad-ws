// Find the correct Q-numbers for the 4 marquee venues, then probe their P31.
// The QIDs given in the task brief turned out to point at unrelated entities
// (Q170532=Universal City CA the municipality, Q587258=a stream, Q1813276=a
// human, Q1130773=missing). Correct QIDs need to be discovered by name search.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = path.join(__dirname, 'cache', 'wikidata-claims');
const TTL_MS     = 30 * 24 * 60 * 60 * 1000;
const RATE_MS    = 1000;
const UA         = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const ENDPOINT   = 'https://www.wikidata.org/w/api.php';

const TARGETS = [
  'Universal Studios Hollywood',
  "Knott's Berry Farm",
  'Legoland California',
  'SeaWorld San Diego',
];

let lastApiAt = 0;
async function rateLimit() {
  const wait = lastApiAt + RATE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastApiAt = Date.now();
}

async function search(name) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('action',   'wbsearchentities');
  url.searchParams.set('search',   name);
  url.searchParams.set('language', 'en');
  url.searchParams.set('format',   'json');
  url.searchParams.set('limit',    '5');
  await rateLimit();
  const res = await fetch(url.toString(), { headers: { 'User-Agent': UA } });
  const data = await res.json();
  return data.search ?? [];
}

async function getEntity(qid) {
  const cacheFile = path.join(CACHE_DIR, `${qid}.json`);
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const cached = JSON.parse(raw);
    if (Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS) return cached.entity;
  } catch {}
  const url = new URL(ENDPOINT);
  url.searchParams.set('action',    'wbgetentities');
  url.searchParams.set('ids',       qid);
  url.searchParams.set('props',     'claims|labels');
  url.searchParams.set('languages', 'en');
  url.searchParams.set('format',    'json');
  await rateLimit();
  const res = await fetch(url.toString(), { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const entity = data.entities?.[qid];
  await fs.writeFile(cacheFile, JSON.stringify({ fetchedAt: new Date().toISOString(), entity }, null, 2), 'utf8');
  return entity;
}

function extractP31(entity) {
  const p31s = entity?.claims?.P31 ?? [];
  return p31s
    .map((c) => c?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

async function resolveLabels(qids) {
  if (qids.length === 0) return new Map();
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const url = new URL(ENDPOINT);
    url.searchParams.set('action',    'wbgetentities');
    url.searchParams.set('ids',       batch.join('|'));
    url.searchParams.set('props',     'labels');
    url.searchParams.set('languages', 'en');
    url.searchParams.set('format',    'json');
    await rateLimit();
    const res = await fetch(url.toString(), { headers: { 'User-Agent': UA } });
    const data = await res.json();
    for (const [qid, ent] of Object.entries(data.entities ?? {})) {
      const label = ent?.labels?.en?.value;
      if (label) out.set(qid, label);
    }
  }
  return out;
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  console.log('=== Step A: search for correct QIDs ===\n');
  const picks = [];
  for (const name of TARGETS) {
    const hits = await search(name);
    console.log(`Search "${name}":`);
    for (const h of hits.slice(0, 5)) {
      console.log(`  ${h.id}  ${h.label}  —  ${h.description ?? ''}`);
    }
    picks.push({ name, hits });
    console.log();
  }

  console.log('\n=== Step B: probe P31 of best match per venue ===\n');
  const KNOWN = new Set([
    'Q46359','Q179049','Q46831','Q4989906','Q839954','Q1195942','Q631898',
    'Q1497375','Q179700','Q185091','Q39715','Q62832','Q16970','Q44613',
    'Q12280','Q12323','Q207694','Q33506','Q8502','Q34038','Q23397',
    'Q191860','Q40080','Q35509','Q2811216','Q570116',
  ]);
  const allMissing = new Map();
  const venuePicks = [];

  for (const { name, hits } of picks) {
    if (hits.length === 0) {
      console.log(`${name}: no search results`);
      continue;
    }
    const best = hits[0];
    const entity = await getEntity(best.id);
    const p31 = extractP31(entity);
    venuePicks.push({ name, qid: best.id, label: best.label, description: best.description, p31 });
    console.log(`${name} → ${best.id}  "${best.label}"  ${best.description ?? ''}`);
    for (const cls of p31) {
      console.log(`  P31: ${cls}`);
      if (!KNOWN.has(cls)) {
        const slot = allMissing.get(cls) ?? { venues: [] };
        slot.venues.push(name);
        allMissing.set(cls, slot);
      }
    }
    console.log();
  }

  const labels = await resolveLabels([...allMissing.keys()]);
  console.log('\n=== Step C: P31 classes NOT in WIKIDATA_CLASSES ===\n');
  if (allMissing.size === 0) {
    console.log('All P31 values already covered.');
  } else {
    for (const [qid, info] of allMissing) {
      console.log(`  ${qid}  ${labels.get(qid) ?? '(no label)'}  ← ${info.venues.join(', ')}`);
    }
  }

  // Persist results so the next steps can read them.
  await fs.writeFile(
    path.join(CACHE_DIR, '_marquee-probe-results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), picks: venuePicks, missingClasses: [...allMissing.keys()] }, null, 2),
    'utf8',
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
