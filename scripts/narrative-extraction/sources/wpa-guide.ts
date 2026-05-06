/**
 * Source: WPA Federal Writers' Project
 * "California: A Guide to the Golden State" (1939, public domain)
 * https://archive.org/details/californiastatea00fedeworkspr
 *
 * Download strategy:
 *   1. Fetch item metadata from archive.org to locate the plain-text file.
 *   2. Download the DjVuTXT (OCR plain text) and cache for 30 days.
 *   3. Pre-process: strip form feeds, page numbers, running headers.
 *   4. Detect section headings (all-caps blocks surrounded by blank lines).
 *   5. Chunk each section into ~2 000-token windows with 200-token overlap.
 *   6. Upsert into narrative_documents.
 */

import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { chunkText } from '../lib/chunker.js';
import { upsertChunks } from '../lib/upsert.js';
import type { DocumentChunk, IngestOptions, IngestResult, SourceName } from '../lib/types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE: SourceName     = 'wpa-guide';
const IDENTIFIER             = 'californiastatea00fedeworkspr';
const ARCHIVE_BASE           = 'https://archive.org';
const PUBLICATION_DATE       = new Date('1939-01-01');
const USER_AGENT             = 'XRoad-Narrative-Extraction/0.1 (johnhollis99@gmail.com)';
const CACHE_TTL_MS           = 30 * 24 * 60 * 60 * 1000; // 30 days

// Headings must be at least this long (chars) to count as a section break
const MIN_HEADING_CHARS      = 5;
// Sections shorter than this (chars of body text) are merged with the next
const MIN_SECTION_BODY_CHARS = 150;

// ── Archive.org helpers ───────────────────────────────────────────────────────

interface ArchiveFile {
  name:   string;
  format: string;
  size?:  string;
}

interface ArchiveMetadata {
  metadata: { title?: string; date?: string; description?: string };
  files:    ArchiveFile[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function readJsonCache<T>(file: string): Promise<T | null> {
  try {
    const raw               = await fs.readFile(file, 'utf8');
    const { data, savedAt } = JSON.parse(raw) as { data: T; savedAt: string };
    if (Date.now() - new Date(savedAt).getTime() < CACHE_TTL_MS) return data;
  } catch { /* miss or expired */ }
  return null;
}

async function writeJsonCache<T>(file: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ data, savedAt: new Date().toISOString() }), 'utf8');
}

async function getMetadata(cacheDir: string, force: boolean): Promise<ArchiveMetadata> {
  const cacheFile = path.join(cacheDir, 'metadata.json');
  if (!force) {
    const cached = await readJsonCache<ArchiveMetadata>(cacheFile);
    if (cached) return cached;
  }
  const url  = `${ARCHIVE_BASE}/metadata/${IDENTIFIER}`;
  console.log(chalk.gray(`[wpa-guide] fetching metadata…`));
  const data = await fetchJson<ArchiveMetadata>(url);
  await writeJsonCache(cacheFile, data);
  return data;
}

/**
 * Finds the best plain-text file in the archive item's file list.
 * Preference order: DjVuTXT format → _djvu.txt suffix → .txt suffix.
 */
function findTextFile(files: ArchiveFile[]): ArchiveFile | null {
  return (
    files.find((f) => f.format === 'DjVuTXT') ??
    files.find((f) => f.name.endsWith('_djvu.txt')) ??
    files.find((f) => f.name.endsWith('.txt') && !f.name.includes('_meta')) ??
    null
  );
}

async function downloadText(
  filename: string,
  cacheDir: string,
  force:    boolean,
): Promise<string> {
  const cacheFile = path.join(cacheDir, filename);
  const metaFile  = cacheFile + '.meta.json';

  if (!force) {
    try {
      const { savedAt } = JSON.parse(await fs.readFile(metaFile, 'utf8')) as { savedAt: string };
      if (Date.now() - new Date(savedAt).getTime() < CACHE_TTL_MS) {
        console.log(chalk.gray(`[wpa-guide] using cached text file`));
        return fs.readFile(cacheFile, 'utf8');
      }
    } catch { /* miss */ }
  }

  const url = `${ARCHIVE_BASE}/download/${IDENTIFIER}/${encodeURIComponent(filename)}`;
  console.log(chalk.gray(`[wpa-guide] downloading ${filename}…`));
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);

  const text = await res.text();
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, text, 'utf8');
  await fs.writeFile(metaFile, JSON.stringify({ savedAt: new Date().toISOString() }), 'utf8');
  console.log(chalk.gray(`[wpa-guide] cached ${(text.length / 1024).toFixed(0)} KB`));
  return text;
}

// ── Text pre-processing ───────────────────────────────────────────────────────

/**
 * Cleans raw DjVu OCR output:
 * - Converts form-feed page separators to blank lines
 * - Strips standalone page-number lines (digits only, optionally with spaces)
 * - Strips running headers: short all-caps lines that repeat verbatim on
 *   many pages (we detect them as lines appearing 10+ times in the text)
 * - Normalises whitespace
 */
function preprocess(raw: string): string {
  // Form feeds → blank lines
  let text = raw.replace(/\f/g, '\n\n');

  // Collapse \r\n
  text = text.replace(/\r\n/g, '\n');

  // Detect running headers (very frequent short all-caps lines)
  const lineCounts = new Map<string, number>();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.length > 0 && t.length <= 60 && /^[A-Z\s\-:,''.]+$/.test(t)) {
      lineCounts.set(t, (lineCounts.get(t) ?? 0) + 1);
    }
  }
  const runningHeaders = new Set(
    [...lineCounts.entries()]
      .filter(([, count]) => count >= 10)
      .map(([line]) => line),
  );

  // Remove running headers and standalone page numbers line-by-line
  const cleaned = text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (runningHeaders.has(t)) return false;
      if (/^\d+$/.test(t)) return false; // bare page number
      return true;
    })
    .join('\n');

  // Collapse runs of 3+ blank lines to exactly two
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Section detection ─────────────────────────────────────────────────────────

interface Section {
  heading: string;
  body:    string;
}

/**
 * A block is treated as a section heading when it:
 * - Is a single line (no embedded newlines after trimming the block)
 * - Is between MIN_HEADING_CHARS and 120 chars long
 * - Has ≥ 85 % uppercase letters (among letters only)
 * - Contains at least one space (not just a single word like "I")
 */
function isHeading(block: string): boolean {
  const t = block.trim();
  if (t.includes('\n'))                      return false;
  if (t.length < MIN_HEADING_CHARS)          return false;
  if (t.length > 120)                        return false;
  if (!t.includes(' '))                      return false;
  const letters    = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0)                  return false;
  const upperRatio = t.replace(/[^A-Z]/g, '').length / letters.length;
  return upperRatio >= 0.85;
}

function toTitleCase(s: string): string {
  const SMALL = new Set(['a','an','the','and','but','or','for','nor','on','at',
                         'to','by','in','of','up','as','with','from']);
  return s
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i === 0 || !SMALL.has(word)) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(' ');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractSections(text: string): Section[] {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const raw: Section[]  = [];
  let currentHeading    = 'Introduction';
  let currentBodyBlocks: string[] = [];

  for (const block of blocks) {
    if (isHeading(block)) {
      if (currentBodyBlocks.length > 0) {
        raw.push({ heading: currentHeading, body: currentBodyBlocks.join('\n\n') });
        currentBodyBlocks = [];
      }
      currentHeading = toTitleCase(block);
    } else {
      currentBodyBlocks.push(block);
    }
  }
  if (currentBodyBlocks.length > 0) {
    raw.push({ heading: currentHeading, body: currentBodyBlocks.join('\n\n') });
  }

  // Merge stub sections (too short to be meaningful) into the next section
  const merged: Section[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]!;
    if (s.body.length < MIN_SECTION_BODY_CHARS && i < raw.length - 1) {
      const next = raw[i + 1]!;
      raw[i + 1] = {
        heading: next.heading,
        body:    s.body ? `${s.body}\n\n${next.body}` : next.body,
      };
    } else {
      merged.push(s);
    }
  }

  return merged;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const start    = Date.now();
  const cacheDir = path.join(opts.cacheDir, 'wpa-guide');
  await fs.mkdir(cacheDir, { recursive: true });

  // 1. Discover text file via metadata
  const meta     = await getMetadata(cacheDir, opts.force);
  const textFile = findTextFile(meta.files ?? []);
  if (!textFile) {
    throw new Error(
      `No plain-text file found for archive.org item "${IDENTIFIER}". ` +
      `Available formats: ${(meta.files ?? []).map((f) => f.format).join(', ')}`,
    );
  }
  console.log(chalk.cyan(`[wpa-guide] text file: ${textFile.name} (${textFile.format})`));

  // 2. Download and pre-process
  const rawText       = await downloadText(textFile.name, cacheDir, opts.force);
  const cleanedText   = preprocess(rawText);
  console.log(
    chalk.cyan(
      `[wpa-guide] ${rawText.length.toLocaleString()} chars raw → ` +
      `${cleanedText.length.toLocaleString()} chars after cleanup`,
    ),
  );

  // 3. Section detection
  let sections = extractSections(cleanedText);
  console.log(chalk.cyan(`[wpa-guide] ${sections.length} sections detected`));

  if (opts.limit != null) {
    sections = sections.slice(0, opts.limit);
    console.log(chalk.yellow(`[wpa-guide] limiting to ${sections.length} sections (--limit)`));
  }

  // 4. Chunk and build DocumentChunk records
  const baseUrl  = `${ARCHIVE_BASE}/details/${IDENTIFIER}`;
  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    const anchor       = slugify(section.heading);
    const sectionUrl   = `${baseUrl}#${anchor}`;
    const textChunks   = chunkText(section.body);

    for (let ci = 0; ci < textChunks.length; ci++) {
      chunks.push({
        source:      SOURCE,
        title:       section.heading,
        date:        PUBLICATION_DATE,
        url:         sectionUrl,
        // Store full section body only on the first chunk to avoid redundancy
        full_text:   ci === 0 ? section.body : null,
        chunk_index: ci,
        chunk_text:  textChunks[ci]!,
      });
    }
  }

  console.log(
    chalk.cyan(
      `[wpa-guide] ${chunks.length} chunks across ${sections.length} sections ` +
      `(avg ${(chunks.length / Math.max(1, sections.length)).toFixed(1)} chunks/section)`,
    ),
  );

  // 5. Upsert
  const outcome = await upsertChunks(chunks, opts.dryRun);

  if (!opts.dryRun) {
    console.log(chalk.green(
      `[wpa-guide] done — ${outcome.inserted} rows upserted, ${outcome.errors} errors`,
    ));
  }

  return {
    source:    SOURCE,
    sections:  sections.length,
    chunks:    chunks.length,
    inserted:  outcome.inserted,
    errors:    outcome.errors,
    durationMs: Date.now() - start,
  };
}
