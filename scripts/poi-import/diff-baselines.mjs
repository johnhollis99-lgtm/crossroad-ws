// Diff two top-25 baseline JSONs and print a leaderboard-shift summary.
//
// Usage:
//   node diff-baselines.mjs <pre-path> <post-path>

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('Usage: node diff-baselines.mjs <pre> <post>');
  process.exit(1);
}

const pre  = JSON.parse(readFileSync(resolve(a), 'utf8'));
const post = JSON.parse(readFileSync(resolve(b), 'utf8'));

const preMap  = new Map(pre.entries.map((e) => [e.id, e]));
const postMap = new Map(post.entries.map((e) => [e.id, e]));

const droppedOut = pre.entries.filter((e) => !postMap.has(e.id));
const movedIn    = post.entries.filter((e) => !preMap.has(e.id));
const stayed     = pre.entries.filter((e) => postMap.has(e.id));

console.log(`pre  captured: ${pre.captured_at}`);
console.log(`post captured: ${post.captured_at}`);
console.log('');

console.log(`=== Dropped out of top-25 (${droppedOut.length}) ===`);
for (const e of droppedOut) {
  console.log(`  rank ${String(e.rank).padStart(2)}  score=${Number(e.score).toFixed(1).padStart(5)}  ${e.role}  ${e.name}  (${e.id})`);
}

console.log(`\n=== Moved into top-25 (${movedIn.length}) ===`);
for (const e of movedIn) {
  console.log(`  rank ${String(e.rank).padStart(2)}  score=${Number(e.score).toFixed(1).padStart(5)}  ${e.role}  ${e.name}  (${e.id})`);
}

console.log(`\n=== Stayed (${stayed.length}) — by score change ===`);
const stayedDelta = stayed.map((preE) => {
  const postE = postMap.get(preE.id);
  return {
    name:    preE.name,
    role:    preE.role,
    preRank: preE.rank, postRank: postE.rank,
    preScore: preE.score, postScore: postE.score,
    delta:    postE.score - preE.score,
  };
}).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
for (const s of stayedDelta) {
  const arrow = s.delta > 0 ? '+' : (s.delta < 0 ? '' : '±');
  console.log(
    `  rank ${String(s.preRank).padStart(2)}→${String(s.postRank).padStart(2)}  ` +
    `${Number(s.preScore).toFixed(1).padStart(5)}→${Number(s.postScore).toFixed(1).padStart(5)}  ` +
    `${arrow}${Number(s.delta).toFixed(1).padStart(5)}  ${s.role}  ${s.name}`,
  );
}

// Spotlight check: did Getty Center / Getty Villa / Six Flags Magic Mountain move?
const spotlightIds = [
  '92df5dbd-5cdc-452a-8a75-fcdeaa309052', // Getty Center
  '8e856376-4218-481d-beab-24b735b32876', // Getty Villa
  'b8f2e45e-ed6c-4b6e-abd6-bf4e2677dc8b', // Six Flags Magic Mountain
];
console.log('\n=== Spotlight: known cap-residue venues ===');
for (const id of spotlightIds) {
  const preE  = preMap.get(id);
  const postE = postMap.get(id);
  const preStr  = preE  ? `rank ${preE.rank}, score=${preE.score}`  : 'absent from pre';
  const postStr = postE ? `rank ${postE.rank}, score=${postE.score}` : 'absent from post (fell out of top-25)';
  console.log(`  ${id}  pre=[${preStr}]  post=[${postStr}]`);
}
