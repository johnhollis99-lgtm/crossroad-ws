// Probe Overpass to find which OSM tags actually back the two mission
// venues. We saw the literal historic=mission + name regex query returned
// 0 elements — figure out the right tag(s) before falling back.

const USER_AGENT = 'XRoad-mission-polygon-fetch/1.0 (johnhollis99@gmail.com)';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ovp(q) {
  let backoff = 5000;
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(2000);
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status === 504) {
      console.warn(`  HTTP ${res.status}, backing off ${backoff/1000}s`);
      await sleep(backoff); backoff = Math.min(backoff * 2, 60000);
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error('max retries');
}

const TARGETS = [
  { name: 'Mission Santa Inés',          lat: 34.59449, lng: -120.13660 },
];

for (const t of TARGETS) {
  console.log(`\n=== ${t.name} (around ${t.lat}, ${t.lng}) ===`);
  const around = `(around:500,${t.lat},${t.lng})`;
  const q = `
[out:json][timeout:60];
(
  way["historic"]${around};
  way["building"="church"]${around};
  way["amenity"="place_of_worship"]${around};
  relation["historic"]${around};
  relation["building"="church"]${around};
  relation["amenity"="place_of_worship"]${around};
);
out tags center;
  `.trim();

  const data = await ovp(q);
  const elems = data.elements || [];
  console.log(`  ${elems.length} candidates within 500m`);
  for (const e of elems) {
    const tags = e.tags || {};
    const c = e.center ?? { lat: e.lat, lon: e.lon };
    console.log(`    [${e.type}/${e.id}] historic=${tags.historic ?? '-'}  amenity=${tags.amenity ?? '-'}  building=${tags.building ?? '-'}  name="${tags.name ?? ''}"  @${c?.lat}, ${c?.lon}`);
  }
}
