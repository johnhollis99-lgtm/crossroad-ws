// Targeted refetch: Q2416723 (theme park) for CA bbox, using the EXACT query
// shape the importer builds (with OPTIONAL image / sitelinks / description /
// label clauses), with retry-on-5xx, and write the result into the importer's
// cache directory at the expected path so the next import run picks it up.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'XRoad-POI-Import/0.1 (johnhollis99@gmail.com)';
const CACHE_FILE = path.join(__dirname, 'cache', 'wikidata-sparql', 'Q2416723-52ef0a9b-p0.json');
const RETRY_DELAYS = [10_000, 30_000, 60_000, 120_000];

const QID = 'Q2416723';
const BBOX = { minLat: 32.5, minLon: -124.5, maxLat: 42.0, maxLon: -114.1 };

const query = [
  'PREFIX wd:        <http://www.wikidata.org/entity/>',
  'PREFIX wdt:       <http://www.wikidata.org/prop/direct/>',
  'PREFIX wikibase:  <http://wikiba.se/ontology#>',
  'PREFIX bd:        <http://www.bigdata.com/rdf#>',
  'PREFIX schema:    <https://schema.org/>',
  'PREFIX geo:       <http://www.opengis.net/ont/geosparql#>',
  '',
  'SELECT ?item ?itemLabel ?coord ?class ?enWikiTitle ?schemaDesc ?image WHERE {',
  `  VALUES ?class { wd:${QID} }`,
  '  ?item wdt:P31 ?class.',
  '  SERVICE wikibase:box {',
  '    ?item wdt:P625 ?coord.',
  `    bd:serviceParam wikibase:cornerWest "Point(${BBOX.minLon} ${BBOX.minLat})"^^geo:wktLiteral .`,
  `    bd:serviceParam wikibase:cornerEast "Point(${BBOX.maxLon} ${BBOX.maxLat})"^^geo:wktLiteral .`,
  '  }',
  '  OPTIONAL { ?item wdt:P18 ?image. }',
  '  OPTIONAL {',
  '    ?enWikiArticle schema:about ?item;',
  '                   schema:isPartOf <https://en.wikipedia.org/>;',
  '                   schema:name ?enWikiTitle.',
  '  }',
  '  OPTIONAL { ?item schema:description ?schemaDesc. FILTER(LANG(?schemaDesc) = "en") }',
  '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
  '}',
  'ORDER BY ?item',
  'LIMIT 1000',
  'OFFSET 0',
].join('\n');

async function fetchOnce() {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    body:   new URLSearchParams({ query }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/sparql-results+json',
      'User-Agent':   UA,
    },
  });
  return res;
}

async function main() {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const res = await fetchOnce();
    const status = res.status;
    if (res.ok) {
      const data = await res.json();
      const count = data.results?.bindings?.length ?? 0;
      console.log(`HTTP 200 — bindings=${count}`);
      // Show item labels for sanity
      const seen = new Set();
      for (const b of data.results.bindings) {
        const qid = b.item.value.split('/').pop();
        if (seen.has(qid)) continue;
        seen.add(qid);
        console.log(`  ${qid}  ${b.itemLabel?.value ?? '?'}  ${b.coord.value}`);
      }
      await fs.writeFile(CACHE_FILE, JSON.stringify(data), 'utf8');
      console.log(`\nWrote cache: ${CACHE_FILE}`);
      return;
    }
    const body = await res.text();
    console.warn(`HTTP ${status} on attempt ${attempt + 1}: ${body.slice(0, 200)}`);
    if (attempt < RETRY_DELAYS.length) {
      const ra = res.headers.get('Retry-After');
      const delay = ra ? Number(ra) * 1000 : RETRY_DELAYS[attempt];
      console.warn(`  retry in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    } else {
      throw new Error(`exhausted retries: HTTP ${status}`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
