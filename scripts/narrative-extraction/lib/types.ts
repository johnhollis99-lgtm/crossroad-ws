export type SourceName = 'wpa-guide' | 'bancroft' | 'cdnc';

export interface DocumentChunk {
  source:      SourceName;
  title:       string;
  date:        Date | null;
  url:         string;       // unique per section; chunk_index differentiates chunks
  full_text:   string | null; // stored only on chunk_index === 0
  chunk_index: number;
  chunk_text:  string;
}

export interface IngestOptions {
  cacheDir: string;
  dryRun:   boolean;
  force:    boolean;
  limit?:   number;          // cap on sections/articles to process (for testing)
}

export interface IngestResult {
  source:         SourceName;
  sections:       number;    // logical sections/articles found
  chunks:         number;    // total chunks produced
  inserted:       number;    // rows written (dry-run: 0)
  errors:         number;
  durationMs:     number;
}
