/**
 * scripts/simulate-trip/index.ts
 *
 * Phase I.1 + I.2 MVP — lookahead worker + CLI test harness.
 *
 * Drives a virtual route through the lookahead worker and emits a
 * markdown timeline document the curator scans to validate queue rules.
 * No WebSocket, no mobile UI, no real GPS — those land in I.3.
 *
 * v1 locked config (only one combination supported this cycle):
 *   - narrator_b × Family × Sadachbia 1.0 × standard depth
 *   - Pace: Full Drive (Light Touch deferred to I.2 extension)
 *   - Narrative focus: The Land Speaks (Soul-only)
 *
 * Run from this directory:
 *   cd scripts/simulate-trip && npm install
 *   npx tsx index.ts --route la-mammoth \
 *                    --pace full-drive \
 *                    --narrator narrator_b \
 *                    --audience family \
 *                    --output ../../docs/simulations/<timestamp>-la-mammoth.md
 */

import { config as dotenvConfig } from 'dotenv';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

import { PRESETS, PRESET_IDS, getMaxCorridorMi, type RoutePreset } from './routes.js';
import { routeLengthMi } from './geo.js';
import {
  waypointsToLineStringWkt,
  getCorridorPois,
  getRegionEntries,
  getCategoryFloors,
  getPoiAudioMeta,
} from './queries.js';
import { runLookahead } from './lookahead.js';
import { getNarratorWeights } from './narrator-weights.js';
import { renderMarkdown } from './render.js';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '..', '.env') });

const STORAGE_PREFIX = 'pois';
const AUDIO_SUFFIX = 'narrator_b_family_standard.opus';

interface Args {
  route: string;
  pace: 'full-drive' | 'light-touch';
  narrator: string;
  audience: string;
  output: string;
  /**
   * Optional uniform override of the route's corridor_profile. When set,
   * SQL fetches at this width and the per-mile filter treats every mile
   * as having this corridor (no urban narrowing). When undefined, the
   * route's corridor_profile drives both.
   */
  corridorOverrideMi: number | undefined;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, def: string | null = null): string | null => {
    const i = argv.indexOf(flag);
    if (i >= 0 && i + 1 < argv.length) return argv[i + 1] ?? null;
    const eq = argv.find(a => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1);
    return def;
  };

  const route = get('--route');
  if (!route) {
    console.error('FATAL: --route <preset-id> is required');
    console.error(`  available presets: ${PRESET_IDS.join(', ')}`);
    process.exit(1);
  }
  if (!PRESETS[route]) {
    console.error(`FATAL: unknown route preset "${route}"`);
    console.error(`  available presets: ${PRESET_IDS.join(', ')}`);
    process.exit(1);
  }
  const output = get('--output');
  if (!output) {
    console.error('FATAL: --output <path.md> is required');
    process.exit(1);
  }
  const pace = (get('--pace', 'full-drive') ?? 'full-drive') as 'full-drive' | 'light-touch';
  if (pace !== 'full-drive' && pace !== 'light-touch') {
    console.error(`FATAL: --pace must be "full-drive" or "light-touch" (got "${pace}")`);
    process.exit(1);
  }
  if (pace === 'light-touch') {
    console.error('FATAL: --pace=light-touch deferred to I.2 extension; use --pace=full-drive');
    process.exit(1);
  }
  const narrator = get('--narrator', 'narrator_b') ?? 'narrator_b';
  if (narrator !== 'narrator_b') {
    console.error(`FATAL: --narrator must be "narrator_b" for v1 (got "${narrator}"); narrator_a deferred to audience-expansion`);
    process.exit(1);
  }
  const audience = get('--audience', 'family') ?? 'family';
  if (audience !== 'family') {
    console.error(`FATAL: --audience must be "family" for v1 (got "${audience}"); kids/unfiltered/local deferred`);
    process.exit(1);
  }
  const corridorRaw = get('--corridor-mi');
  let corridorOverrideMi: number | undefined;
  if (corridorRaw !== null) {
    const parsed = parseFloat(corridorRaw);
    if (Number.isNaN(parsed) || parsed <= 0) {
      console.error(`FATAL: --corridor-mi must be a positive number (got "${corridorRaw}")`);
      process.exit(1);
    }
    corridorOverrideMi = parsed;
  }

  return { route, pace, narrator, audience, output, corridorOverrideMi };
}

function publicUrlBase(): string {
  const url = process.env['SUPABASE_URL'];
  if (!url) {
    console.error('FATAL: SUPABASE_URL not set in .env');
    process.exit(1);
  }
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/narration-audio`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!process.env['DATABASE_URL']) {
    console.error('FATAL: DATABASE_URL not set in .env');
    process.exit(1);
  }
  const preset: RoutePreset = PRESETS[args.route]!;
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 2 });

  // Resolve the spatial corridor for the SQL filter. When the user passes
  // --corridor-mi, it's a uniform override; otherwise the route's
  // corridor_profile widest envelope (incl. CLOSEST_APPROACH_MAX_MI) wins.
  const sqlCorridorMi = args.corridorOverrideMi ?? getMaxCorridorMi(preset);
  const corridorLabel = args.corridorOverrideMi !== undefined
    ? `±${sqlCorridorMi} mi (uniform override)`
    : `±${sqlCorridorMi} mi (max of profile + closest_approach cap)`;

  // When override is set, the lookahead's per-mile filter should treat
  // the corridor as uniform. Synthesize a flat profile so passesPerMileFilter
  // returns the override width at every mile (no urban narrowing).
  const presetForLookahead: RoutePreset = args.corridorOverrideMi !== undefined
    ? {
        ...preset,
        corridor_profile: {
          default_corridor_mi: args.corridorOverrideMi,
          urban_segments: [],
          notes: '[CLI uniform override via --corridor-mi]',
        },
      }
    : preset;

  try {
    console.log('=== Trip simulator — Phase I MVP ===');
    console.log(`  Route:     ${preset.display_name} (${preset.id})`);
    console.log(`  Pace:      ${args.pace}`);
    console.log(`  Narrator:  ${args.narrator} × ${args.audience}`);
    console.log(`  Corridor:  ${corridorLabel}`);
    console.log(`  Waypoints: ${preset.waypoints.length} → straight-line route length will be computed`);
    console.log('');

    const totalRouteMi = routeLengthMi(preset.waypoints);
    console.log(`  Route length (haversine sum): ${totalRouteMi.toFixed(1)} mi`);
    console.log('');

    const routeWkt = waypointsToLineStringWkt(preset.waypoints);

    console.log('▶ Querying corridor POIs (editorial_curated = TRUE only, parent_poi_id IS NULL)...');
    const t0 = Date.now();
    const corridorPois = await getCorridorPois(pool, routeWkt, sqlCorridorMi);
    console.log(`  ${corridorPois.length} POIs in ±${sqlCorridorMi}mi spatial filter (${Date.now() - t0}ms — per-mile narrowing applied in lookahead)`);

    console.log('▶ Querying region intersections...');
    const t1 = Date.now();
    const regionEntries = await getRegionEntries(pool, routeWkt);
    console.log(`  ${regionEntries.length} regions intersect route (${Date.now() - t1}ms)`);

    console.log('▶ Loading category significance floors...');
    const categoryFloors = await getCategoryFloors(pool);
    console.log(`  ${categoryFloors.size} per-category floors (other categories use 70 default)`);

    console.log('▶ Loading cached POI audio metadata from Storage...');
    const t2 = Date.now();
    const poiAudio = await getPoiAudioMeta(
      pool,
      corridorPois.map(p => p.id),
      STORAGE_PREFIX,
      AUDIO_SUFFIX,
      publicUrlBase(),
    );
    console.log(`  ${poiAudio.size}/${corridorPois.length} POIs have cached audio (${Date.now() - t2}ms)`);
    console.log('');

    const narratorWeights = getNarratorWeights(args.narrator);

    console.log('▶ Running lookahead pipeline...');
    const output = runLookahead({
      routeLengthMi: totalRouteMi,
      speedProfile: preset.speed_profile,
      preset: presetForLookahead,
      corridorPois,
      regionEntries,
      categoryFloors,
      narratorWeights,
      poiAudio,
    });
    console.log(`  ${output.stats.pois_fired} POI fires · ${output.stats.regions_fired} region fires`);
    console.log(`  ${output.stats.pois_cluster_suppressed} cluster-suppressed · ${output.stats.pois_gap_suppressed} gap-suppressed · ${output.stats.pois_below_floor} below floor`);
    console.log(`  Total narration: ${output.stats.total_narration_minutes.toFixed(1)} min / Total trip: ${output.stats.total_trip_minutes.toFixed(1)} min`);
    console.log('');

    const timestamp = new Date().toISOString();
    const md = renderMarkdown(preset, output, {
      pace: args.pace === 'full-drive' ? 'Full Drive' : 'Light Touch',
      narrator: args.narrator,
      audience: args.audience,
      depth: 'standard',
      corridorMi: sqlCorridorMi,
      timestamp,
    });

    const outAbs = resolve(process.cwd(), args.output);
    const outDir = dirname(outAbs);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
      console.log(`  Created dir: ${outDir}`);
    }
    writeFileSync(outAbs, md, 'utf-8');
    console.log(`  ✓ Wrote ${outAbs}`);
    console.log('');

    // Echo at-a-glance to console so the operator sees results without
    // opening the file.
    console.log('=== AT A GLANCE ===');
    console.log(`  ${output.stats.regions_fired} regions narrated, ${output.stats.regions_rate_limited} rate-limited (of ${output.stats.regions_intersected})`);
    console.log(`  ${output.stats.pois_fired} POIs narrated, ${output.stats.pois_cluster_suppressed} cluster-suppressed, ${output.stats.pois_gap_suppressed} gap-suppressed, ${output.stats.pois_below_floor} below-floor (of ${output.stats.total_pois_in_corridor})`);
    const ratio = output.stats.total_trip_minutes > 0
      ? ((output.stats.total_narration_minutes / output.stats.total_trip_minutes) * 100).toFixed(1)
      : '0.0';
    console.log(`  Airtime ratio: ${ratio}%   (${output.stats.total_narration_minutes.toFixed(1)} min narration / ${output.stats.total_trip_minutes.toFixed(1)} min trip)`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
