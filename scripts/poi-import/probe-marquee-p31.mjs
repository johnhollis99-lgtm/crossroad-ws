// One-off probe: fetch P31 (instance-of) claims for marquee CA venues from
// Wikidata via wbgetentities. Mirrors the wikidata-sitelinks resolver pattern:
// 1 req/sec rate limit, 5-attempt exponential backoff, per-Q disk cache with
// 30-day TTL in cache/wikidata-claims/, response shape preserved as-is.
//
// Run from: scripts/poi-import/
//   node probe-marquee-p31.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = path.join(__dirname, 'cache', 'wikidata-claims');
const TTL_MS     = 30 * 24 * 60 * 60 * 1000;
const RATE_MS    = 1000;
const RETRIES    = [2_000, 4_000, 8_000, 16_000, 32_000];
const UA         = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const ENDPOINT   = 'https://www.wikidata.org/w/api.php';

const TARGETS = [
  { qid: 'Q170532',  name: 'Universal Studios Hollywood' },
  { qid: 'Q587258',  name: "Knott's Berry Farm" },
  { qid: 'Q1813276', name: 'Legoland California' },
  { qid: 'Q1130773', name: 'SeaWorld San Diego' },
];

let lastApiAt = 0;
async function rateLimit() {
  const wait = lastApiAt + RATE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastApiAt = Date.now();
}

async function readCache(qid) {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${qid}.json`), 'utf8');
    const cached = JSON.parse(raw);
    if (Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS) return cached;
  } catch {}
  return null;
}

async function writeCache(qid, payload) {
  await fs.writeFile(
    path.join(CACHE_DIR, `${qid}.json`),
    JSON.stringify({ fetchedAt: new Date().toISOString(), ...payload }, null, 2),
    'utf8',
  );
}

async function fetchEntity(qid) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids',    qid);
  url.searchParams.set('props',  'claims|labels');
  url.searchParams.set('languages', 'en');
  url.searchParams.set('format', 'json');

  for (let attempt = 0; attempt <= RETRIES.length; attempt++) {
    let res;
    try {
      res = await fetch(url.toString(), { headers: { 'User-Agent': UA } });
    } catch (err) {
      if (attempt < RETRIES.length) {
        await new Promise((r) => setTimeout(r, RETRIES[attempt]));
        continue;
      }
      throw err;
    }
    if (res.ok) return await res.json();
    if (attempt < RETRIES.length) {
      const ra = res.headers.get('Retry-After');
      const delay = ra ? Number(ra) * 1000 : RETRIES[attempt];
      console.warn(`[probe] HTTP ${res.status} for ${qid} — retry ${attempt + 1}/${RETRIES.length} in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    } else {
      throw new Error(`HTTP ${res.status} for ${qid} after all retries`);
    }
  }
  throw new Error('unreachable');
}

function extractP31(entity) {
  const p31s = entity?.claims?.P31 ?? [];
  const out = [];
  for (const c of p31s) {
    const dv = c?.mainsnak?.datavalue;
    if (dv?.type === 'wikibase-entityid' && dv.value?.id) {
      out.push(dv.value.id);
    }
  }
  return out;
}

async function resolveLabels(qids) {
  if (qids.length === 0) return new Map();
  const url = new URL(ENDPOINT);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids',    qids.join('|'));
  url.searchParams.set('props',  'labels');
  url.searchParams.set('languages', 'en');
  url.searchParams.set('format', 'json');
  await rateLimit();
  const res = await fetch(url.toString(), { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const out = new Map();
  for (const [qid, ent] of Object.entries(data.entities ?? {})) {
    const label = ent?.labels?.en?.value;
    if (label) out.set(qid, label);
  }
  return out;
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const results = [];
  for (const target of TARGETS) {
    let cached = await readCache(target.qid);
    if (!cached) {
      await rateLimit();
      console.log(`[probe] fetching ${target.qid} (${target.name}) …`);
      const data = await fetchEntity(target.qid);
      const entity = data.entities?.[target.qid];
      cached = { entity };
      await writeCache(target.qid, cached);
    } else {
      console.log(`[probe] cache hit ${target.qid} (${target.name})`);
    }
    const p31 = extractP31(cached.entity);
    results.push({ ...target, p31 });
  }

  const allP31 = [...new Set(results.flatMap((r) => r.p31))];
  console.log(`\n[probe] resolving English labels for ${allP31.length} unique P31 classes …`);
  const labels = await resolveLabels(allP31);

  console.log('\n=== P31 results ===');
  for (const r of results) {
    console.log(`\n${r.qid}  ${r.name}`);
    if (r.p31.length === 0) {
      console.log('  (no P31 claim found)');
      continue;
    }
    for (const cls of r.p31) {
      console.log(`  - ${cls}  ${labels.get(cls) ?? '(label missing)'}`);
    }
  }

  console.log('\n=== Gap analysis (Step 3 input) ===');
  const KNOWN = new Set([
    'Q46359','Q179049','Q46831','Q4989906','Q839954','Q1195942','Q631898',
    'Q1497375','Q179700','Q185091','Q39715','Q62832','Q16970','Q44613',
    'Q12280','Q12323','Q207694','Q33506','Q8502','Q34038','Q23397',
    'Q191860','Q40080','Q35509','Q2811216','Q570116',
  ]);
  const missingClasses = new Map(); // qid -> { label, venues }
  for (const r of results) {
    for (const cls of r.p31) {
      if (!KNOWN.has(cls)) {
        const slot = missingClasses.get(cls) ?? { label: labels.get(cls), venues: [] };
        slot.venues.push(r.name);
        missingClasses.set(cls, slot);
      }
    }
  }
  if (missingClasses.size === 0) {
    console.log('All P31 values already covered by WIKIDATA_CLASSES.');
  } else {
    for (const [qid, info] of missingClasses) {
      console.log(`  ${qid}  ${info.label}  ←  ${info.venues.join(', ')}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
