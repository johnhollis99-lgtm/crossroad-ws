// Compute top-N significance score movers between two snapshot JSONs.
//
// Run from: scripts/poi-import/
//   node diff-bbox-scores.mjs <pre.json> <post.json> [N]

import { readFileSync } from 'node:fs';

const [, , prePath, postPath, nStr] = process.argv;
if (!prePath || !postPath) {
  console.error('usage: node diff-bbox-scores.mjs <pre.json> <post.json> [N=5]');
  process.exit(1);
}
const N = nStr ? Number(nStr) : 5;

const pre  = JSON.parse(readFileSync(prePath, 'utf8')).rows;
const post = JSON.parse(readFileSync(postPath, 'utf8')).rows;

const preById = new Map(pre.map(r => [r.id, r]));
const movers = [];
for (const p of post) {
  const before = preById.get(p.id);
  if (!before) continue;
  const delta = Number(p.score) - Number(before.score);
  if (delta === 0) continue;
  movers.push({
    id: p.id,
    name: p.name,
    source_type: p.source_type,
    before: Number(before.score),
    after: Number(p.score),
    delta,
  });
}

movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
const ups = movers.filter(m => m.delta > 0).slice(0, N);
const downs = movers.filter(m => m.delta < 0).slice(0, N);

console.log(`Top ${N} positive movers:`);
for (const m of ups) {
  console.log(`  ${m.before.toFixed(2).padStart(6)} → ${m.after.toFixed(2).padStart(6)} (${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(2)})  "${m.name}" [${m.source_type}]`);
}

console.log(`\nTop ${N} negative movers:`);
for (const m of downs) {
  console.log(`  ${m.before.toFixed(2).padStart(6)} → ${m.after.toFixed(2).padStart(6)} (${m.delta.toFixed(2)})  "${m.name}" [${m.source_type}]`);
}

console.log(`\nTotals: ${movers.length} rows changed score, ${ups.length === 0 ? '0 positive' : `top+${ups[0].delta.toFixed(2)}`}, ${downs.length === 0 ? '0 negative' : `top${downs[0].delta.toFixed(2)}`}`);
