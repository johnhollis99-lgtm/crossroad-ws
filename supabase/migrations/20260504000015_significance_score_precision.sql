-- ============================================================
-- Migration: Widen significance_score column precision
-- numeric(4,2) overflows when score = 100 (requires 5 digits).
-- Widening to numeric(6,2) supports the full 0-100 range.
-- ============================================================

ALTER TABLE pois
  ALTER COLUMN significance_score TYPE numeric(6,2);
