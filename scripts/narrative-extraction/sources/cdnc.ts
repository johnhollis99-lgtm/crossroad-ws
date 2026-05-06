/**
 * Source: California Digital Newspaper Collection (CDNC)
 * https://cdnc.ucr.edu  — hosted by UC Riverside
 *
 * Status: STUB — not yet implemented.
 *
 * Implementation notes for when this is built:
 *
 * CDNC exposes newspapers via two interfaces:
 *
 * 1. Search API (Lucene-based):
 *    GET https://cdnc.ucr.edu/cgi-bin/cdnc
 *       ?a=cl           (action: content-list)
 *       &sp=1           (start page)
 *       &e=-------en--20--1--txt-txIN-------- (query template)
 *       &q=california   (search query)
 *       &dateRange=custom
 *       &date1=01/01/1900
 *       &date2=12/31/1910
 *       &ortext=...
 *       &andtext=...
 *       &phrasetext=...
 *       &proxtext=...
 *       &proxdistance=5
 *       &rows=20
 *       &output=json
 *    Returns paginated JSON with items: [{id, title, date, pageCount, url}]
 *
 * 2. Page-text endpoint (for a known item ID):
 *    GET https://cdnc.ucr.edu/cgi-bin/cdnc
 *       ?a=d
 *       &d={item_id}    e.g. "sn85066387/1905-07-04/ed-1/seq-1"
 *       &e=-------en--20--1--txt-txIN--------1
 *    Returns HTML; article text is in <div class="article-text">
 *
 * Suggested test run (1900-1910, California-focused queries):
 *   - Query: "California" OR "San Francisco" OR "Los Angeles"
 *   - Papers: Los Angeles Herald, San Francisco Chronicle (earlier issues)
 *   - Limit to ~100 articles on first run
 *
 * Steps to implement:
 *   1. Paginate the search API for the target date range.
 *   2. For each result, fetch the page-text endpoint.
 *   3. Strip HTML, extract article text.
 *   4. Chunk with chunkText() and upsert to narrative_documents.
 *      url  = canonical CDNC page URL
 *      date = parsed from item metadata
 *      title = newspaper name + date
 */

import type { IngestOptions, IngestResult } from '../lib/types.js';

export async function runIngest(_opts: IngestOptions): Promise<IngestResult> {
  throw new Error(
    'CDNC source is not yet implemented. ' +
    'See sources/cdnc.ts for implementation notes.',
  );
}
