// Audit + repair editorial-venue Wikidata Q-numbers.
//
// Many editorial venues in the seed catalog reference the wrong Wikidata
// entity (Q758 for Yosemite is "Zinc", Q49273 for Joshua Tree is "Lubbock",
// etc.). This script:
//   1. Loads each editorial venue (source_type='editorial', merged_into IS NULL).
//   2. Calls Wikidata wbsearchentities with the venue name (English).
//   3. Scores candidates by token-set overlap with the venue name and
//      requires the candidate to have an enwiki sitelink.
//   4. Writes a JSON proposal file.
//   5. With --apply, updates pois.venue_metadata.wikidata + pois.source_citation
//      and (optionally) marks the audit timestamp in venue_metadata.q_audited_at.
//
// Run from: scripts/poi-import/
//   node audit-venue-qids.mjs                      # propose only
//   node audit-venue-qids.mjs --apply              # propose + commit
//   node audit-venue-qids.mjs --apply --skip-confirmed  # only touch wrong/missing rows

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

// Same threshold as the recompute name-match gate.
const NAME_MATCH_THRESHOLD = 0.4;
const USER_AGENT = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const RATE_LIMIT_MS = 1000;
const MAX_CANDIDATES_PER_NAME = 8;

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const skipConfirmed = argv.includes('--skip-confirmed');
const minRatioArg = argv.find((a) => a.startsWith('--min-ratio='));
const MIN_APPLY_RATIO = minRatioArg ? Number(minRatioArg.split('=')[1]) : 1.0;

let lastApiAt = 0;
async function rateLimit() {
  const wait = lastApiAt + RATE_LIMIT_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastApiAt = Date.now();
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'at', 'in', 'on',
  'park', 'site', 'historic', 'monument', 'memorial', 'national',
  'state', 'old', 'new',
]);

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s, dropStopwords = true) {
  const list = normalize(s).split(' ').filter(Boolean);
  return dropStopwords ? list.filter((t) => !STOPWORDS.has(t)) : list;
}

function tokenSetRatio(a, b) {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// Jaccard with stopwords preserved — used as a tiebreaker so "Death Valley
// National Park" beats "Death Valley" when the venue is the national park.
function tokenSetRatioFull(a, b) {
  const sa = new Set(tokens(a, false));
  const sb = new Set(tokens(b, false));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

async function searchEntitiesOnce(query) {
  await rateLimit();
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('search', query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('type', 'item');
  url.searchParams.set('limit', String(MAX_CANDIDATES_PER_NAME));
  url.searchParams.set('format', 'json');
  const res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    console.warn(`wbsearchentities HTTP ${res.status} for "${query}" — skipping`);
    return [];
  }
  const data = await res.json();
  return (data.search || []).map((r) => ({
    qid: r.id,
    label: r.label,
    description: r.description,
    matchType: r.match?.type,
    matchText: r.match?.text,
  }));
}

// Run two searches: the venue name plain, and the venue name + " California".
// Merges results, keeps each Q only once. The second query is what disambiguates
// California vs Texas/etc. for ambiguous mission and town names.
async function searchEntities(name) {
  const a = await searchEntitiesOnce(name);
  const needsLocality = !/california/i.test(name);
  const b = needsLocality ? await searchEntitiesOnce(`${name} California`) : [];
  const seen = new Set();
  const merged = [];
  for (const c of [...a, ...b]) {
    if (seen.has(c.qid)) continue;
    seen.add(c.qid);
    merged.push(c);
  }
  return merged;
}

// Penalise candidates whose label/description mentions a non-CA US state, and
// reward those that mention California. Returned as a points delta added to
// the token-set similarity score during pickBest.
const NON_CA_STATES = [
  'texas', 'new mexico', 'arizona', 'nevada', 'oregon', 'washington',
  'utah', 'colorado', 'idaho', 'montana', 'wyoming', 'alaska', 'hawaii',
  'florida', 'georgia', 'alabama', 'louisiana', 'mississippi', 'tennessee',
  'kentucky', 'virginia', 'maryland', 'pennsylvania', 'new york', 'massachusetts',
  'connecticut', 'rhode island', 'new jersey', 'ohio', 'illinois', 'indiana',
  'michigan', 'wisconsin', 'minnesota', 'iowa', 'missouri', 'kansas',
  'nebraska', 'south dakota', 'north dakota', 'oklahoma', 'arkansas',
  'maine', 'vermont', 'new hampshire', 'delaware', 'west virginia',
];

function localityBonus(candidate) {
  const haystack = `${candidate.label ?? ''} ${candidate.description ?? ''} ${candidate.enTitle ?? ''}`.toLowerCase();
  // California-positive wins outright — handles cases like Death Valley NP
  // whose description mentions "California and Nevada" (legitimate CA venue
  // that also straddles a neighbouring state).
  if (haystack.includes('california')) return 0.2;
  if (NON_CA_STATES.some((s) => haystack.includes(s))) return -0.5;
  return 0;
}

async function getEnwikiTitles(qids) {
  if (qids.length === 0) return new Map();
  await rateLimit();
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qids.join('|'));
  url.searchParams.set('props', 'sitelinks');
  url.searchParams.set('sitefilter', 'enwiki');
  url.searchParams.set('format', 'json');
  const res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return new Map(qids.map((q) => [q, null]));
  const data = await res.json();
  const out = new Map();
  for (const qid of qids) {
    const t = data.entities?.[qid]?.sitelinks?.enwiki?.title;
    out.set(qid, typeof t === 'string' ? t : null);
  }
  return out;
}

function pickBest(name, candidates, titleByQid) {
  let best = null;
  let bestScore = -Infinity;
  let bestRatio = 0;
  let bestFull  = 0;
  for (const c of candidates) {
    const enTitle = titleByQid.get(c.qid);
    if (!enTitle) continue;          // require enwiki sitelink
    // Score against both the wikidata label and the enwiki title; take max.
    const ratioLabel = c.label ? tokenSetRatio(name, c.label) : 0;
    const ratioTitle = tokenSetRatio(name, enTitle);
    const ratio = Math.max(ratioLabel, ratioTitle);
    // Full-jaccard tiebreaker keeps stopwords ("Park", "National") so the
    // most specific candidate wins when two share the same content tokens.
    const ratioFull = Math.max(
      c.label ? tokenSetRatioFull(name, c.label) : 0,
      tokenSetRatioFull(name, enTitle),
    );
    const enriched = { ...c, enTitle };
    const score = ratio + localityBonus(enriched);
    if (score > bestScore || (score === bestScore && ratioFull > bestFull)) {
      bestScore = score;
      bestRatio = ratio;
      bestFull  = ratioFull;
      best = { ...enriched, ratio };
    }
  }
  // Gate on raw similarity, not the score-with-bonus, so we don't accept a
  // weak match just because it lives in California.
  return bestRatio >= NAME_MATCH_THRESHOLD ? best : null;
}

async function main() {
  const { rows: venues } = await pool.query(`
    SELECT id::text                               AS id,
           name,
           venue_metadata->>'wikidata'            AS current_q,
           source_citation
      FROM pois
     WHERE source_type = 'editorial'
       AND merged_into IS NULL
       AND venue_metadata ? 'wikidata'
       AND venue_metadata->>'wikidata' ~ '^Q\\d+$'
     ORDER BY name
  `);
  console.log(`Loaded ${venues.length} editorial venues with Q-numbers.\n`);

  // Pre-resolve current Q-numbers in one batch so we can decide which rows
  // already match by token-set ratio (don't propose changes to those).
  const currentTitles = await getEnwikiTitles(venues.map((v) => v.current_q));

  const proposals = [];
  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    const currentTitle = currentTitles.get(v.current_q);
    const currentRatio = currentTitle ? tokenSetRatio(v.name, currentTitle) : 0;
    const currentOk = currentTitle != null && currentRatio >= NAME_MATCH_THRESHOLD;

    if (currentOk && skipConfirmed) {
      proposals.push({
        ...v,
        proposed_q:     v.current_q,
        proposed_title: currentTitle,
        ratio:          currentRatio,
        action:         'keep',
      });
      continue;
    }

    process.stdout.write(`  [${String(i + 1).padStart(2)}/${venues.length}] ${v.name}… `);
    const candidates = await searchEntities(v.name);
    const titleByQid = await getEnwikiTitles(candidates.map((c) => c.qid));
    const best = pickBest(v.name, candidates, titleByQid);

    if (!best) {
      console.log('NO MATCH');
      proposals.push({
        ...v,
        current_title:  currentTitle ?? null,
        current_ratio:  currentRatio,
        proposed_q:     null,
        proposed_title: null,
        ratio:          null,
        action:         'manual',
      });
      continue;
    }

    if (best.qid === v.current_q) {
      console.log(`keep (${best.qid} → "${best.enTitle}", ratio=${best.ratio.toFixed(2)})`);
      proposals.push({
        ...v,
        current_title:  currentTitle ?? null,
        current_ratio:  currentRatio,
        proposed_q:     best.qid,
        proposed_title: best.enTitle,
        ratio:          best.ratio,
        action:         'keep',
      });
    } else {
      console.log(`update ${v.current_q} → ${best.qid} ("${best.enTitle}", ratio=${best.ratio.toFixed(2)})`);
      proposals.push({
        ...v,
        current_title:  currentTitle ?? null,
        current_ratio:  currentRatio,
        proposed_q:     best.qid,
        proposed_title: best.enTitle,
        ratio:          best.ratio,
        action:         'update',
      });
    }
  }

  // Write proposal file
  const outPath = resolve(__dirname, 'cache', 'venue-q-audit.json');
  await fs.mkdir(dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(proposals, null, 2), 'utf8');
  console.log(`\nProposal written → ${outPath}`);

  const summary = proposals.reduce((acc, p) => { acc[p.action] = (acc[p.action] ?? 0) + 1; return acc; }, {});
  console.log('Summary:');
  for (const k of Object.keys(summary)) console.log(`  ${k}: ${summary[k]}`);

  // Side-by-side print
  console.log('\n── Proposed changes ────────────────────────────────────────');
  for (const p of proposals) {
    if (p.action === 'keep') continue;
    if (p.action === 'manual') {
      console.log(
        `  MANUAL  ${p.name.padEnd(46).slice(0, 46)}  current=${p.current_q.padEnd(10)} → no candidate >= ${NAME_MATCH_THRESHOLD}`,
      );
      continue;
    }
    console.log(
      `  UPDATE  ${p.name.padEnd(46).slice(0, 46)}  ` +
      `${p.current_q.padEnd(10)}("${(p.current_title ?? '—').slice(0, 30)}")` +
      ` → ${p.proposed_q.padEnd(10)}("${p.proposed_title}")` +
      `  r=${p.ratio.toFixed(2)}`,
    );
  }

  if (!apply) {
    console.log('\n--apply not set — exiting after proposal.');
    await pool.end();
    return;
  }

  // Apply updates — gated on ratio so user can opt for perfect-match-only.
  const allUpdates = proposals.filter((p) => p.action === 'update');
  const toApply    = allUpdates.filter((p) => p.ratio >= MIN_APPLY_RATIO);
  const skipped    = allUpdates.filter((p) => p.ratio <  MIN_APPLY_RATIO);
  console.log(`\nApplying ${toApply.length} updates (min-ratio=${MIN_APPLY_RATIO})…`);
  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} below the threshold:`);
    for (const p of skipped) {
      console.log(`  SKIP    ${p.name.padEnd(46).slice(0, 46)}  ${p.current_q} → ${p.proposed_q} (r=${p.ratio.toFixed(2)})`);
    }
  }
  let applied = 0, failed = 0;
  for (const p of toApply) {
    try {
      const res = await pool.query(
        `UPDATE pois
            SET venue_metadata  = jsonb_set(venue_metadata, '{wikidata}', to_jsonb($1::text)),
                source_citation = 'https://www.wikidata.org/wiki/' || $1
          WHERE id = $2
            AND source_type = 'editorial'`,
        [p.proposed_q, p.id],
      );
      if (res.rowCount === 1) {
        applied++;
      } else {
        failed++;
        console.warn(`  WARN: ${p.id} ${p.name} — rowCount=${res.rowCount}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ERR: ${p.id} ${p.name} — ${err.message}`);
    }
  }
  console.log(`Applied ${applied} updates, ${failed} failures.`);

  await pool.end();
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exitCode = 1;
});
