/**
 * Source: Bancroft Library Oral History Transcripts
 * https://bancroft.berkeley.edu/roho/
 *
 * Status: STUB — not yet implemented.
 *
 * Implementation notes for when this is built:
 *
 * The Bancroft Library Regional Oral History Office (ROHO) publishes
 * transcripts via the Online Archive of California (OAC):
 *   https://oac.cdlib.org/institutions/UCB::bancroft
 *
 * Openly-licensed items are identified by their access condition in the
 * EAD/MODS metadata.  The OAC API (v1) can be queried like:
 *   GET https://oac.cdlib.org/api/v1/collections?inst=UCB::bancroft&format=json
 *
 * Steps to implement:
 *   1. Hit OAC API to list Bancroft oral history finding aids.
 *   2. Filter to items whose <accessCondition> permits redistribution
 *      (typically CC-BY or "no restrictions on access").
 *   3. For each item, fetch the transcript PDF or plain-text URL from
 *      the digital objects endpoint.
 *   4. Parse PDF with a pdf-parse or pdf2json approach, or download
 *      the text derivative if available.
 *   5. Use extractSections() (same heading-detection approach as wpa-guide)
 *      to split on speaker turns / section headers.
 *   6. Run through chunkText() and upsert to narrative_documents.
 *
 * Suggested first item (publicly accessible transcript):
 *   Earl Warren Oral History Project — many transcripts are on the
 *   Internet Archive with plain-text derivatives.
 */

import type { IngestOptions, IngestResult } from '../lib/types.js';

export async function runIngest(_opts: IngestOptions): Promise<IngestResult> {
  throw new Error(
    'Bancroft source is not yet implemented. ' +
    'See sources/bancroft.ts for implementation notes.',
  );
}
