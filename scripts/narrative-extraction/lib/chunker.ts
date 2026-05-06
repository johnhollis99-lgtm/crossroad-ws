/**
 * Splits a text block into overlapping windows bounded by paragraph/sentence
 * edges.  Targets ~8 000 chars (~2 000 tokens at 4 chars/token) with a
 * ~800-char (~200-token) look-back overlap so embeddings don't lose context
 * at chunk boundaries.
 */

const DEFAULT_TARGET_CHARS  = 8_000;
const DEFAULT_OVERLAP_CHARS =   800;

export function chunkText(
  text:         string,
  targetChars  = DEFAULT_TARGET_CHARS,
  overlapChars = DEFAULT_OVERLAP_CHARS,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= targetChars) return [normalized];

  const units = buildUnits(normalized, targetChars);
  if (units.length === 0) return [];

  const chunks: string[] = [];
  let i = 0;

  while (i < units.length) {
    // Accumulate units until we reach targetChars
    let len  = 0;
    let j    = i;
    while (j < units.length) {
      const unitLen = (units[j]?.length ?? 0) + 2; // +2 for separator
      if (len + unitLen > targetChars && j > i) break;
      len += unitLen;
      j++;
    }

    const chunk = units.slice(i, j).join('\n\n').trim();
    if (chunk) chunks.push(chunk);

    // Walk back from j to find the overlap start
    let overlapUnits = 0;
    let overlapLen   = 0;
    while (overlapUnits < j - i && overlapLen < overlapChars) {
      overlapUnits++;
      overlapLen += (units[j - overlapUnits]?.length ?? 0) + 2;
    }

    const nextI = j - overlapUnits;
    i = nextI > i ? nextI : j; // guarantee forward progress
  }

  return chunks;
}

/**
 * Breaks text into units (paragraphs, or sentences when a paragraph exceeds
 * 70 % of targetChars) so the chunker always has fine-grained boundaries.
 */
function buildUnits(text: string, targetChars: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const units: string[] = [];

  for (const raw of paragraphs) {
    const para = raw.trim();
    if (!para) continue;

    if (para.length <= targetChars * 0.7) {
      units.push(para);
    } else {
      // Split long paragraph on sentence boundaries
      const sentences = splitSentences(para);
      for (const s of sentences) {
        if (s) units.push(s);
      }
    }
  }

  return units;
}

/**
 * Splits on sentence-ending punctuation (.!?) when followed by whitespace
 * and an uppercase letter or quote.  Avoids splitting "Mr. Smith" etc. by
 * requiring the preceding word to be longer than two characters.
 */
function splitSentences(text: string): string[] {
  // Insert a sentinel after each sentence boundary
  const marked = text.replace(
    /([.!?])(\s+)(?=[A-Z"'‘’“”])/g,
    '$1\x00$2',
  );
  return marked
    .split('\x00')
    .map((s) => s.trim())
    .filter(Boolean);
}
