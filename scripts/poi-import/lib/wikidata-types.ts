import type { CategorySlug, TripMode } from './types.js';

export interface WikidataClass {
  qid: string;
  label: string;
  slug: CategorySlug;
  tripMode: TripMode;
  tags: string[];
  /** Significance contribution 0–30; added as (bonus / 100) to the 0–1 score. */
  bonus: number;
}

/**
 * Curated Wikidata instance-of (P31) classes to import.
 * Ordered by bonus descending so the first match in bestClass() wins when an
 * item belongs to multiple classes.
 *
 * Q-numbers can be verified at https://www.wikidata.org/wiki/Q<id>
 */
export const WIKIDATA_CLASSES: WikidataClass[] = [
  // ── Parks & protected areas ───────────────────────────────────────────────
  { qid: 'Q46359',    label: 'national park',        slug: 'nature',       tripMode: 'all',    tags: ['national_park'],           bonus: 30 },
  { qid: 'Q179049',   label: 'state park',            slug: 'nature',       tripMode: 'all',    tags: ['state_park'],              bonus: 15 },
  { qid: 'Q46831',    label: 'nature reserve',        slug: 'nature',       tripMode: 'all',    tags: ['nature_reserve'],          bonus: 12 },

  // ── History ───────────────────────────────────────────────────────────────
  { qid: 'Q4989906',  label: 'historic site',         slug: 'history',      tripMode: 'all',    tags: ['historic'],                bonus: 15 },
  { qid: 'Q839954',   label: 'designated heritage',   slug: 'history',      tripMode: 'all',    tags: ['heritage'],                bonus: 15 },
  { qid: 'Q1195942',  label: 'historic district',     slug: 'history',      tripMode: 'all',    tags: ['historic_district'],       bonus: 15 },
  { qid: 'Q631898',   label: 'Spanish mission',       slug: 'history',      tripMode: 'all',    tags: ['mission', 'religious'],    bonus: 15 },
  { qid: 'Q1497375',  label: 'battlefield',           slug: 'history',      tripMode: 'all',    tags: ['battlefield'],             bonus: 12 },
  { qid: 'Q179700',   label: 'monument',              slug: 'history',      tripMode: 'all',    tags: ['monument'],                bonus: 12 },
  { qid: 'Q185091',   label: 'ghost town',            slug: 'hidden_gems',  tripMode: 'all',    tags: ['ghost_town'],              bonus: 15 },

  // ── Architecture ──────────────────────────────────────────────────────────
  { qid: 'Q39715',    label: 'lighthouse',            slug: 'architecture', tripMode: 'all',    tags: ['lighthouse'],              bonus: 12 },
  { qid: 'Q62832',    label: 'observatory',           slug: 'architecture', tripMode: 'all',    tags: ['observatory'],             bonus: 10 },
  { qid: 'Q16970',    label: 'church building',       slug: 'architecture', tripMode: 'all',    tags: ['religious'],               bonus:  8 },
  { qid: 'Q44613',    label: 'monastery',             slug: 'architecture', tripMode: 'all',    tags: ['religious'],               bonus:  8 },
  { qid: 'Q12280',    label: 'bridge',                slug: 'architecture', tripMode: 'all',    tags: ['bridge'],                  bonus:  8 },
  { qid: 'Q12323',    label: 'dam',                   slug: 'architecture', tripMode: 'all',    tags: ['dam'],                     bonus:  8 },

  // ── Museums & culture ─────────────────────────────────────────────────────
  { qid: 'Q207694',   label: 'art museum',            slug: 'art',          tripMode: 'all',    tags: ['museum', 'art'],           bonus: 12 },
  { qid: 'Q33506',    label: 'museum',                slug: 'history',      tripMode: 'all',    tags: ['museum'],                  bonus: 10 },

  // ── Nature features ───────────────────────────────────────────────────────
  { qid: 'Q8502',     label: 'mountain',              slug: 'nature',       tripMode: 'hiking', tags: ['summit'],                  bonus: 10 },
  { qid: 'Q34038',    label: 'waterfall',             slug: 'nature',       tripMode: 'hiking', tags: ['waterfall'],               bonus: 12 },
  { qid: 'Q23397',    label: 'lake',                  slug: 'nature',       tripMode: 'all',    tags: ['lake'],                    bonus:  8 },
  { qid: 'Q191860',   label: 'hot spring',            slug: 'nature',       tripMode: 'all',    tags: ['hot_spring'],              bonus:  8 },
  { qid: 'Q40080',    label: 'beach',                 slug: 'nature',       tripMode: 'all',    tags: ['beach'],                   bonus:  8 },
  { qid: 'Q35509',    label: 'cave',                  slug: 'geology',      tripMode: 'hiking', tags: ['cave'],                    bonus:  8 },
  { qid: 'Q2811216',  label: 'scenic viewpoint',      slug: 'nature',       tripMode: 'all',    tags: ['viewpoint'],               bonus:  8 },

  // ── Tourist / generic ─────────────────────────────────────────────────────
  { qid: 'Q570116',   label: 'tourist attraction',    slug: 'hidden_gems',  tripMode: 'all',    tags: [],                          bonus: 10 },
];

export const CLASS_BY_QID = new Map<string, WikidataClass>(
  WIKIDATA_CLASSES.map((c) => [c.qid, c]),
);

export const ALL_QIDS: string[] = WIKIDATA_CLASSES.map((c) => c.qid);
