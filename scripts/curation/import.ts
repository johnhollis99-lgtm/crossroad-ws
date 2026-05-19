/**
 * scripts/curation/import.ts
 *
 * Hybrid curation model — Step 2.
 *
 * Reads the curator-marked-up markdown checklist produced by export.ts
 * and applies decisions to the database. Per
 * docs/decisions/2026-05-15-top-tier-poi-first-run.md §Curation Model.
 *
 * Decision marks recognized on `- **Decision:**` lines:
 *   [x]    → approve   → editorial_curated=TRUE,  boost stays 0 (unless overridden by note)
 *   [r]    → reject    → editorial_curated=FALSE, boost forced 0
 *   [+]    → boost     → editorial_curated=TRUE,  editorial_score_boost=20
 *   [+N]   → boost N   → editorial_curated=TRUE,  editorial_score_boost=N (N = small positive int)
 *   [ ]    → skip      → no change (remains editorial_curated=NULL)
 *
 * Curator Additions section (3 entry shapes):
 *   1. `- [+] Name`                            → fuzzy match existing POI, set boost=20
 *   2. `- [+] Name (hint)`                     → match w/ admin-region hint
 *   3. `- [+] Name — region — coords LAT,LON — category SLUG [— score N]`
 *                                              → insert new POI (source_type='editorial')
 *
 *   Magnitude override: `[+30]` works on all three shapes.
 *
 * Cross-cutting:
 *   - Every decision sets editorial_curated_at = NOW()
 *   - editorial_curated_by = 'curator' (column default; not overridden)
 *   - Note text from `- **Note:**` line (excluding the placeholder text)
 *     stored in editorial_curation_note
 *
 * Output:
 *   - Console summary
 *   - Annotated copy of the input markdown at `<input>.imported.md`
 *     (or `.import-preview.md` for --dry-run) with `<!-- IMPORT: ... -->`
 *     comments after each Curator Additions entry. The original file is
 *     never mutated.
 *
 * CLI:
 *   npx tsx import.ts <path/to/slate.md> --dry-run
 *   npx tsx import.ts <path/to/slate.md> --apply
 *
 *   --boost-default <N>   override the [+] default magnitude (default: 20)
 *   --score-default <N>   override the editorial-seed default score (default: 75)
 */

import { config as dotenvConfig } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

dotenvConfig({ path: resolve(__dirname, '..', '..', '.env') });

// ── Constants ────────────────────────────────────────────────────────────

const DEFAULT_BOOST = 20;
const DEFAULT_NEW_SEED_SCORE = 75;
const NOTE_PLACEHOLDER_PATTERNS = [
  /^_?\(curator fills in if needed\)_?$/i,
  /^_?\(pre-marked.*\)_?$/i,
];

// ── Args ─────────────────────────────────────────────────────────────────

interface Args {
  inputPath: string;
  dryRun: boolean;
  apply: boolean;
  boostDefault: number;
  scoreDefault: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const positionals = argv.filter(a => !a.startsWith('--'));
  if (positionals.length !== 1) {
    console.error('FATAL: pass exactly one markdown path');
    console.error('Usage: npx tsx import.ts <path/to/slate.md> [--dry-run|--apply] [--boost-default N] [--score-default N]');
    process.exit(1);
  }
  const inputPath = positionals[0]!;
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  if (dryRun === apply) {
    console.error('FATAL: pass exactly one of --dry-run or --apply');
    process.exit(1);
  }
  const get = (flag: string, def: number): number => {
    const i = argv.indexOf(flag);
    if (i === -1) return def;
    const v = parseInt(argv[i + 1] ?? '', 10);
    if (Number.isNaN(v)) {
      console.error(`FATAL: ${flag} requires an integer`);
      process.exit(1);
    }
    return v;
  };
  return {
    inputPath,
    dryRun,
    apply,
    boostDefault: get('--boost-default', DEFAULT_BOOST),
    scoreDefault: get('--score-default', DEFAULT_NEW_SEED_SCORE),
  };
}

// ── Markdown parsing ─────────────────────────────────────────────────────

type DecisionKind = 'approve' | 'reject' | 'boost' | 'skip';

interface ParsedDecision {
  kind: DecisionKind;
  boostMagnitude: number | null; // populated only for 'boost'
  rawMark: string;
}

function parseDecisionMark(mark: string, boostDefault: number): ParsedDecision | null {
  const m = mark.trim();
  if (m === '') return { kind: 'skip', boostMagnitude: null, rawMark: '[ ]' };
  if (m === ' ') return { kind: 'skip', boostMagnitude: null, rawMark: '[ ]' };
  if (/^[xX]$/.test(m)) return { kind: 'approve', boostMagnitude: null, rawMark: '[x]' };
  if (/^[rR]$/.test(m)) return { kind: 'reject', boostMagnitude: null, rawMark: '[r]' };
  if (m === '+') return { kind: 'boost', boostMagnitude: boostDefault, rawMark: '[+]' };
  const plusN = /^\+(\d+)$/.exec(m);
  if (plusN) {
    const n = parseInt(plusN[1]!, 10);
    if (!Number.isNaN(n) && n > 0 && n <= 100) {
      return { kind: 'boost', boostMagnitude: n, rawMark: `[+${n}]` };
    }
  }
  return null; // unrecognized
}

interface PoiEntry {
  // Parsed from "## [SCORE] Name (category)"
  scoreFromHeader: number;
  name: string;
  category: string;
  // Parsed from body
  poiId: string | null;
  decisionRaw: string;
  decision: ParsedDecision | null;
  note: string | null;
  noteIsPlaceholder: boolean;
  // Where in the input doc
  headerLineNum: number;
}

interface CuratorAddition {
  raw: string;
  lineNum: number;
  decision: ParsedDecision | null;
  // Tokens after the mark
  remainder: string;
  // Parsed structure
  name: string;
  hint: string | null;        // parens-suffix on shape 2
  lat: number | null;
  lon: number | null;
  categorySlug: string | null;
  seedScore: number | null;
  isNewSeed: boolean;         // true if coords+category present
}

interface ParseResult {
  pois: PoiEntry[];
  additions: CuratorAddition[];
  lines: string[]; // original lines (for re-emit)
}

function parseNoteValue(line: string): { value: string | null; isPlaceholder: boolean } {
  // Strip leading "- **Note:**" prefix
  const m = /^- \*\*Note:\*\*\s*(.*)$/.exec(line);
  if (!m) return { value: null, isPlaceholder: false };
  const raw = m[1]!.trim();
  if (!raw) return { value: null, isPlaceholder: false };
  for (const p of NOTE_PLACEHOLDER_PATTERNS) {
    if (p.test(raw)) return { value: raw, isPlaceholder: true };
  }
  return { value: raw, isPlaceholder: false };
}

function parseMarkdown(md: string, boostDefault: number): ParseResult {
  const lines = md.split(/\r?\n/);
  const pois: PoiEntry[] = [];
  const additions: CuratorAddition[] = [];

  // Walk line-by-line; when we see a `## [N] Name (slug)`, start a new entry
  // and keep reading subsequent `-` lines until we hit a blank or another `##`/`#`.
  let inCuratorAdditions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Section transitions
    if (/^#\s+Curator Additions\b/i.test(line)) {
      inCuratorAdditions = true;
      continue;
    }
    if (/^#\s+Category:/i.test(line)) {
      inCuratorAdditions = false;
      continue;
    }
    if (inCuratorAdditions && /^#\s/.test(line) && !/Curator Additions/i.test(line)) {
      inCuratorAdditions = false;
    }

    // Curator Addition bullets — only inside the Curator Additions section,
    // and only lines that start with `- [` (the decision mark).
    if (inCuratorAdditions) {
      const ca = /^-\s+\[([^\]]*)\]\s+(.+)$/.exec(line);
      if (ca) {
        const mark = ca[1] ?? '';
        const remainder = (ca[2] ?? '').trim();
        const decision = parseDecisionMark(mark, boostDefault);
        const parsed = parseAdditionRemainder(remainder);
        additions.push({
          raw: line,
          lineNum: i,
          decision,
          remainder,
          ...parsed,
        });
        continue;
      }
    }

    // POI entry header
    const header = /^##\s+\[(\d+)\]\s+(.+?)\s+\(([^)]+)\)\s*$/.exec(line);
    if (header) {
      const scoreFromHeader = parseInt(header[1]!, 10);
      const name = header[2]!.trim();
      const category = header[3]!.trim();
      const entry: PoiEntry = {
        scoreFromHeader,
        name,
        category,
        poiId: null,
        decisionRaw: '',
        decision: null,
        note: null,
        noteIsPlaceholder: false,
        headerLineNum: i,
      };
      // Read subsequent lines until next section header (## or # ) or EOF
      for (let j = i + 1; j < lines.length; j++) {
        const inner = lines[j]!;
        if (/^#{1,2}\s/.test(inner)) break;
        // POI id
        const idM = /^- \*\*POI id:\*\*\s*`([^`]+)`/.exec(inner);
        if (idM) entry.poiId = idM[1]!.trim();
        // Decision
        const decM = /^- \*\*Decision:\*\*\s*\[([^\]]*)\]/.exec(inner);
        if (decM) {
          entry.decisionRaw = decM[1] ?? '';
          entry.decision = parseDecisionMark(decM[1] ?? '', boostDefault);
        }
        // Note
        const noteParsed = parseNoteValue(inner);
        if (noteParsed.value !== null) {
          entry.note = noteParsed.value;
          entry.noteIsPlaceholder = noteParsed.isPlaceholder;
        }
      }
      pois.push(entry);
    }
  }
  return { pois, additions, lines };
}

function parseAdditionRemainder(remainder: string): {
  name: string;
  hint: string | null;
  lat: number | null;
  lon: number | null;
  categorySlug: string | null;
  seedScore: number | null;
  isNewSeed: boolean;
} {
  // Long-form: `Name — region — coords LAT,LON — category SLUG [— score N]`
  // We split on em-dash (—) OR hyphen-surrounded-by-spaces ( - ) to be lenient.
  const parts = remainder.split(/\s+[—–-]\s+/).map(s => s.trim()).filter(Boolean);
  let name = parts[0] ?? remainder.trim();
  let hint: string | null = null;
  let lat: number | null = null;
  let lon: number | null = null;
  let categorySlug: string | null = null;
  let seedScore: number | null = null;

  // If single segment, check for parens hint at end of name
  if (parts.length === 1) {
    const parenM = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(parts[0]!);
    if (parenM) {
      name = parenM[1]!.trim();
      hint = parenM[2]!.trim();
    }
  }

  // Parse subsequent segments
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i]!;
    const coordM = /^coords?\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(seg);
    if (coordM) {
      lat = Number(coordM[1]);
      lon = Number(coordM[2]);
      continue;
    }
    const catM = /^category\s+([a-z_]+)/i.exec(seg);
    if (catM) {
      categorySlug = catM[1]!.toLowerCase();
      continue;
    }
    const scoreM = /^score\s+(\d+)/i.exec(seg);
    if (scoreM) {
      seedScore = parseInt(scoreM[1]!, 10);
      continue;
    }
    // Treat first non-keyword segment as the hint if no parens-hint already
    if (!hint) hint = seg;
  }

  const isNewSeed = lat !== null && lon !== null && categorySlug !== null;
  return { name, hint, lat, lon, categorySlug, seedScore, isNewSeed };
}

// ── DB ops ───────────────────────────────────────────────────────────────

interface PoiLookup {
  id: string;
  name: string;
  category_slug: string;
  lat: number | null;
  lon: number | null;
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSetRatio(a: string, b: string): number {
  const A = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const B = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = new Set([...A, ...B]).size;
  return inter / union;
}

async function fuzzyMatchName(
  pool: pkg.Pool,
  name: string,
  hint: string | null,
): Promise<{ matches: PoiLookup[]; reason: string }> {
  // First pass: exact normalized match
  const allRows = await pool.query(
    `SELECT p.id, p.name, pc.slug AS category_slug,
            CASE WHEN p.location IS NULL THEN NULL ELSE ST_Y(p.location::geometry) END AS lat,
            CASE WHEN p.location IS NULL THEN NULL ELSE ST_X(p.location::geometry) END AS lon
       FROM public.pois p
       JOIN public.poi_categories pc ON pc.id = p.category_id
      WHERE p.merged_into IS NULL
        AND lower(p.name) = lower($1)`,
    [name],
  );
  if (allRows.rows.length > 0) {
    return { matches: allRows.rows as PoiLookup[], reason: 'exact_name' };
  }

  // Second pass: normalized exact (strip diacritics + punctuation)
  const normTarget = normalizeName(name);
  const normRows = await pool.query(
    `SELECT p.id, p.name, pc.slug AS category_slug,
            CASE WHEN p.location IS NULL THEN NULL ELSE ST_Y(p.location::geometry) END AS lat,
            CASE WHEN p.location IS NULL THEN NULL ELSE ST_X(p.location::geometry) END AS lon
       FROM public.pois p
       JOIN public.poi_categories pc ON pc.id = p.category_id
      WHERE p.merged_into IS NULL
        AND lower(regexp_replace(p.name, '[^a-zA-Z0-9]+', ' ', 'g')) = $1`,
    [normTarget],
  );
  if (normRows.rows.length > 0) {
    return { matches: normRows.rows as PoiLookup[], reason: 'normalized_name' };
  }

  // Third pass: token-set ratio >= 0.6 with first-token-anchor (avoids
  // hitting every "Bridge" in the catalog when curator types "Foo Bridge").
  const firstToken = normTarget.split(/\s+/)[0] ?? '';
  if (!firstToken) return { matches: [], reason: 'no_tokens' };
  const candRows = await pool.query(
    `SELECT p.id, p.name, pc.slug AS category_slug,
            CASE WHEN p.location IS NULL THEN NULL ELSE ST_Y(p.location::geometry) END AS lat,
            CASE WHEN p.location IS NULL THEN NULL ELSE ST_X(p.location::geometry) END AS lon
       FROM public.pois p
       JOIN public.poi_categories pc ON pc.id = p.category_id
      WHERE p.merged_into IS NULL
        AND p.name ILIKE $1
      LIMIT 200`,
    [`%${firstToken}%`],
  );
  const fuzzy = (candRows.rows as PoiLookup[])
    .map(r => ({ row: r, ratio: tokenSetRatio(r.name, name) }))
    .filter(x => x.ratio >= 0.6)
    .sort((a, b) => b.ratio - a.ratio);

  if (fuzzy.length === 0) return { matches: [], reason: 'no_match' };

  // If a hint is supplied, prefer matches whose name contains the hint
  // or whose nearest centroid (approx) is plausible. For v1 we just
  // hint-match by substring within the name.
  if (hint) {
    const hintNorm = normalizeName(hint);
    const hintFiltered = fuzzy.filter(x => normalizeName(x.row.name).includes(hintNorm));
    if (hintFiltered.length > 0) {
      return { matches: hintFiltered.map(x => x.row), reason: 'fuzzy_with_hint' };
    }
  }

  // Without hint: return all >=0.8 if uniquely identifiable; else all >=0.6
  const tight = fuzzy.filter(x => x.ratio >= 0.8);
  if (tight.length > 0) {
    return { matches: tight.map(x => x.row), reason: 'fuzzy_tight' };
  }
  return { matches: fuzzy.map(x => x.row), reason: 'fuzzy_loose' };
}

async function applyPoiDecision(
  pool: pkg.Pool,
  entry: PoiEntry,
): Promise<{ ok: boolean; message: string }> {
  if (!entry.poiId) return { ok: false, message: 'no POI id parsed' };
  if (!entry.decision || entry.decision.kind === 'skip') {
    return { ok: true, message: 'skipped (no decision)' };
  }
  const note = entry.noteIsPlaceholder ? null : entry.note;
  const dec = entry.decision;
  let curated: boolean;
  let boost: number;
  if (dec.kind === 'approve') { curated = true; boost = 0; }
  else if (dec.kind === 'reject') { curated = false; boost = 0; }
  else { curated = true; boost = dec.boostMagnitude ?? DEFAULT_BOOST; }

  await pool.query(
    `UPDATE public.pois
        SET editorial_curated       = $1,
            editorial_score_boost   = $2,
            editorial_curation_note = $3,
            editorial_curated_at    = NOW()
      WHERE id = $4`,
    [curated, boost, note, entry.poiId],
  );
  return {
    ok: true,
    message: `${dec.rawMark} curated=${curated} boost=${boost}${note ? ` note="${note.slice(0, 40)}"` : ''}`,
  };
}

async function applyCuratorAddition(
  pool: pkg.Pool,
  add: CuratorAddition,
  boostDefault: number,
  scoreDefault: number,
): Promise<{ ok: boolean; message: string; action: string }> {
  if (!add.decision || add.decision.kind === 'skip') {
    return { ok: true, message: 'skipped (no decision)', action: 'skip' };
  }
  if (add.decision.kind === 'reject') {
    return { ok: false, message: '[r] not supported for additions — use [x]/[+] to add, [r] is rejection for surfaced entries only', action: 'unsupported' };
  }

  const boost = add.decision.kind === 'boost' ? (add.decision.boostMagnitude ?? boostDefault) : 0;

  if (add.isNewSeed) {
    if (!add.categorySlug || add.lat == null || add.lon == null) {
      return { ok: false, message: 'new seed needs category + coords', action: 'seed_invalid' };
    }
    // Resolve category_id
    const catRes = await pool.query(
      `SELECT id FROM public.poi_categories WHERE slug = $1`,
      [add.categorySlug],
    );
    if (catRes.rows.length === 0) {
      return { ok: false, message: `unknown category slug: ${add.categorySlug}`, action: 'seed_invalid' };
    }
    const categoryId = catRes.rows[0].id;
    const newId = randomUUID();
    const score = add.seedScore ?? scoreDefault;
    const sourceId = `editorial:${newId}`;
    const noteText = `Curator-added editorial seed via curation/import.ts. ${add.hint ? `hint=${add.hint}; ` : ''}coords=${add.lat},${add.lon}`;
    await pool.query(
      `INSERT INTO public.pois
         (id, name, category_id, location,
          significance_score, source_type, source_id, source_citation,
          confidence_score, verified, editorial_status,
          editorial_curated, editorial_score_boost, editorial_curation_note, editorial_curated_at,
          imported_at)
       VALUES
         ($1, $2, $3, ST_GeogFromText($4),
          $5, 'editorial', $6, $7,
          1.0, true, 'verified',
          true, $8, $9, NOW(),
          NOW())`,
      [
        newId,
        add.name,
        categoryId,
        `POINT(${add.lon} ${add.lat})`,
        score,
        sourceId,
        `Editorial seed added by curator on ${new Date().toISOString().slice(0, 10)} via scripts/curation/import.ts`,
        boost,
        noteText,
      ],
    );
    return {
      ok: true,
      message: `inserted new editorial seed id=${newId.slice(0, 8)}… score=${score} boost=${boost}`,
      action: 'seed_inserted',
    };
  }

  // Manual boost path — fuzzy-match against existing POIs.
  const match = await fuzzyMatchName(pool, add.name, add.hint);
  if (match.matches.length === 0) {
    return { ok: false, message: `no POI matches "${add.name}"${add.hint ? ` (hint: ${add.hint})` : ''}`, action: 'match_none' };
  }
  if (match.matches.length > 1) {
    const previews = match.matches.slice(0, 5).map(m => `${m.name} (${m.category_slug}, id=${m.id.slice(0, 8)}…)`);
    return {
      ok: false,
      message: `multiple matches (${match.matches.length}): ${previews.join(' | ')} — disambiguate with hint or use long-form coords`,
      action: 'match_ambiguous',
    };
  }
  const m = match.matches[0]!;
  const noteText = `Manual boost via curation/import.ts. match_reason=${match.reason}${add.hint ? `; hint=${add.hint}` : ''}`;
  await pool.query(
    `UPDATE public.pois
        SET editorial_curated       = true,
            editorial_score_boost   = $1,
            editorial_curation_note = $2,
            editorial_curated_at    = NOW()
      WHERE id = $3`,
    [boost, noteText, m.id],
  );
  return {
    ok: true,
    message: `matched "${m.name}" (${m.category_slug}, id=${m.id.slice(0, 8)}…) boost=${boost} via ${match.reason}`,
    action: 'match_boosted',
  };
}

// ── Annotated output ─────────────────────────────────────────────────────

function annotate(
  parseResult: ParseResult,
  poiOutcomes: Map<number, string>,
  addOutcomes: Map<number, string>,
): string {
  const lines = [...parseResult.lines];
  // Insert annotations after each Curator Addition bullet (lineNum) and
  // after each POI entry's Note line. Walk in reverse so line indices
  // don't shift.
  const insertions: Array<{ after: number; line: string }> = [];
  for (const [lineNum, msg] of addOutcomes.entries()) {
    insertions.push({ after: lineNum, line: `  <!-- IMPORT: ${msg} -->` });
  }
  for (const entry of parseResult.pois) {
    const outcome = poiOutcomes.get(entry.headerLineNum);
    if (!outcome) continue;
    // Find the Note line within this entry's block
    let noteLineNum = entry.headerLineNum;
    for (let j = entry.headerLineNum + 1; j < lines.length; j++) {
      if (/^#{1,2}\s/.test(lines[j]!)) break;
      if (/^- \*\*Note:\*\*/.test(lines[j]!)) {
        noteLineNum = j;
        break;
      }
      noteLineNum = j;
    }
    insertions.push({ after: noteLineNum, line: `<!-- IMPORT: ${outcome} -->` });
  }
  insertions.sort((a, b) => b.after - a.after);
  for (const ins of insertions) {
    lines.splice(ins.after + 1, 0, ins.line);
  }
  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  if (!process.env['DATABASE_URL']) {
    console.error('FATAL: DATABASE_URL not set in .env');
    process.exit(1);
  }
  const inputAbs = resolve(process.cwd(), args.inputPath);
  if (!existsSync(inputAbs)) {
    console.error(`FATAL: input file not found: ${inputAbs}`);
    process.exit(1);
  }

  const md = readFileSync(inputAbs, 'utf-8');
  const parsed = parseMarkdown(md, args.boostDefault);

  console.log('=== POI Curation Import ===');
  console.log(`  Input:           ${inputAbs}`);
  console.log(`  Mode:            ${args.apply ? 'APPLY (writes to DB)' : 'DRY-RUN (no DB writes)'}`);
  console.log(`  Boost default:   ${args.boostDefault}`);
  console.log(`  New-seed score:  ${args.scoreDefault}`);
  console.log(`  POI entries parsed:        ${parsed.pois.length}`);
  console.log(`  Curator additions parsed:  ${parsed.additions.length}`);
  console.log('');

  // Pre-tally decision distribution
  const dist: Record<string, number> = { approve: 0, reject: 0, boost: 0, skip: 0, unparseable: 0, no_id: 0 };
  for (const e of parsed.pois) {
    if (!e.decision) dist['unparseable']!++;
    else if (!e.poiId && e.decision.kind !== 'skip') dist['no_id']!++;
    else dist[e.decision.kind]!++;
  }
  console.log('=== POI entry decision distribution ===');
  for (const k of Object.keys(dist)) console.log(`  ${k.padEnd(12)} ${dist[k]}`);
  console.log('');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 4 });

  const poiOutcomes = new Map<number, string>(); // entry.headerLineNum -> message
  const addOutcomes = new Map<number, string>(); // addition.lineNum -> message
  let poiApplied = 0;
  let poiSkipped = 0;
  let poiFailed = 0;
  let addApplied = 0;
  let addSkipped = 0;
  let addFailed = 0;

  try {
    // POI entries
    console.log('=== Applying POI entry decisions ===');
    for (const entry of parsed.pois) {
      if (!entry.decision) {
        poiOutcomes.set(entry.headerLineNum, `unparseable mark "${entry.decisionRaw}"`);
        poiFailed++;
        continue;
      }
      if (entry.decision.kind === 'skip') {
        poiSkipped++;
        continue;
      }
      if (!entry.poiId) {
        poiOutcomes.set(entry.headerLineNum, `no POI id parsed for "${entry.name}"`);
        poiFailed++;
        continue;
      }
      if (args.apply) {
        try {
          const r = await applyPoiDecision(pool, entry);
          poiOutcomes.set(entry.headerLineNum, r.message);
          if (r.ok) poiApplied++;
          else poiFailed++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          poiOutcomes.set(entry.headerLineNum, `DB error: ${msg}`);
          poiFailed++;
        }
      } else {
        const dec = entry.decision;
        const previewBoost = dec.kind === 'boost' ? (dec.boostMagnitude ?? DEFAULT_BOOST) : 0;
        const curated = dec.kind === 'reject' ? false : true;
        poiOutcomes.set(entry.headerLineNum, `[dry-run] ${dec.rawMark} would set curated=${curated} boost=${previewBoost}`);
        poiApplied++;
      }
    }
    console.log(`  Applied: ${poiApplied}  Skipped: ${poiSkipped}  Failed: ${poiFailed}`);
    console.log('');

    // Curator additions
    console.log('=== Applying Curator Additions ===');
    for (const add of parsed.additions) {
      if (!add.decision) {
        addOutcomes.set(add.lineNum, `unparseable addition`);
        addFailed++;
        continue;
      }
      if (add.decision.kind === 'skip') {
        addSkipped++;
        continue;
      }
      if (args.apply) {
        try {
          const r = await applyCuratorAddition(pool, add, args.boostDefault, args.scoreDefault);
          addOutcomes.set(add.lineNum, `${r.action}: ${r.message}`);
          if (r.ok) addApplied++;
          else addFailed++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          addOutcomes.set(add.lineNum, `DB error: ${msg}`);
          addFailed++;
        }
      } else {
        const summary = add.isNewSeed
          ? `[dry-run] would insert new editorial seed (${add.categorySlug} @ ${add.lat},${add.lon}, score=${add.seedScore ?? args.scoreDefault})`
          : `[dry-run] would fuzzy-match "${add.name}"${add.hint ? ` (hint: ${add.hint})` : ''} and boost`;
        addOutcomes.set(add.lineNum, summary);
        addApplied++;
      }
    }
    console.log(`  Applied: ${addApplied}  Skipped: ${addSkipped}  Failed: ${addFailed}`);
    console.log('');

    // Annotated output
    const annotated = annotate(parsed, poiOutcomes, addOutcomes);
    const inDir = dirname(inputAbs);
    const inExt = extname(inputAbs);
    const inStem = basename(inputAbs, inExt);
    const outName = args.apply ? `${inStem}.imported${inExt}` : `${inStem}.import-preview${inExt}`;
    const outAbs = join(inDir, outName);
    writeFileSync(outAbs, annotated, 'utf-8');
    console.log(`  ✓ Annotated output: ${outAbs}`);
    console.log('');

    if (!args.apply) {
      console.log('  (dry-run — DB was not modified. Re-run with --apply to commit.)');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
