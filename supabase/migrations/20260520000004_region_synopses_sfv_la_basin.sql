-- =====================================================================
-- 20260520000004_region_synopses_sfv_la_basin.sql
--
-- WHAT
--   Two UPDATEs on public.regions, replacing the imported (Wikidata-
--   excerpt) descriptions for San Fernando Valley + Los Angeles Basin
--   with hand-crafted ~3-min narration scripts.
--
-- WHY
--   v1 launch demo (LA → Mammoth) opens inside one or both of these
--   region polygons. The imported descriptions were 200–400-word
--   encyclopedia-style stubs intended as seed text for the region
--   narrator prompt template. Per standing order, geographical-area
--   synopses can run up to 3 minutes; these are finished narrations
--   (not seed text), so the standard Haiku rewrite pass is bypassed
--   downstream. Audio regen pulls description text verbatim into TTS.
--
--   Length intentionally exceeds the addendum's "200-400 word reference"
--   comment on regions.description — these are finished narrations, not
--   seed text. The schema comment will be refreshed when the doc sync
--   lands (v1.1 backlog).
--
-- PRE-FLIGHT
--   Required dependency: 20260514000005_regions.sql created the table
--   + set_updated_at() trigger; this migration relies on the trigger
--   to bump updated_at automatically.
--
-- TARGETED ROWS
--   733e4582-bb39-48d1-8dc3-f6911d360bf1  San Fernando Valley  (Wikidata Q816843)
--   f63e48f5-2cef-4112-8639-a54b65fffd20  Los Angeles Basin    (Wikidata Q2887490)
--
-- DOLLAR-QUOTING
--   Body text uses $narration$ ... $narration$ literals so the embedded
--   apostrophes ("you're", "didn't", "they're") survive without escaping.
--
-- POST-APPLY
--   Audio regen via direct-text-to-TTS (bypasses the standard region
--   prompt template + Haiku step). New Opus files overwrite existing
--   Storage paths regions/{region_id}/{narrator_slug}.opus; matching
--   narration_audio rows updated in place via upsert on the 6-column
--   conflict tuple.
-- =====================================================================

BEGIN;

UPDATE public.regions
SET description = $narration$
The valley you've entered was once a lake — a Pleistocene basin holding meltwater that ran down off the San Gabriels, the Santa Susanas, the Verdugos, the Santa Monicas. Over hundreds of thousands of years, that water carried sediment off those slopes and laid it across the basin floor. The valley you see now — flat from edge to edge — is the bottom of a lake that filled and drained and filled again, until the rivers cut their way out toward the sea and the lakebed turned to soil.

The Tongva built villages on the eastern side, near the springs. To the west, in the country bending toward the Santa Clarita pass, the Tataviam lived along the creeks for a thousand years before any European saw the place. The Tataviam name for one of those creeks — Pacoima — is still on the map.

In 1797 the Spanish founded a mission at the foot of the northern hills and called it San Fernando Rey de España, after the canonized 13th-century king of Castile. The valley took the mission's name. Cattle grazed the slopes; the mission grew wheat and grapes on the lakebed soil. After the Mexican secularization, the land broke into ranchos. After 1848, into farms.

Then came the water.

In 1913, William Mulholland opened a gate at the north end of this valley and let the Owens River fall down the mountains from 250 miles away. The valley filled with apricot and orange groves almost overnight. The city of Los Angeles, on the far side of the Cahuenga Pass, annexed it all by 1915 — not for the people, but for the water rights. Within a generation, the orchards were subdivisions. Within two, the subdivisions had names — Sherman Oaks, Studio City, Encino, Northridge.

The film studios came too. Universal climbed the southern hills, Warner Bros. and Disney took root in Burbank, so that a century after the Tataviam, this valley became where America went to see itself on screen. The lakebed soil is still under all of it. Twice in living memory — 1971 in Sylmar, 1994 in Northridge — the ground has reminded everyone that the mountains ringing the valley are still moving.
$narration$
WHERE id = '733e4582-bb39-48d1-8dc3-f6911d360bf1';

UPDATE public.regions
SET description = $narration$
The city you're entering was a riverbed. The Los Angeles River once braided through a basin walled in by mountains — the San Gabriels to the north, the Santa Monicas to the west, the Puente Hills and Palos Verdes to the south — and flooded out in different directions in different decades. The basin floor is alluvium, miles deep, with pockets of asphalt seeping up where ancient oil reservoirs reach the surface. At Rancho La Brea, Pleistocene mammoths and saber-toothed cats walked into the tar and never walked out. They're still being pulled up today.

The Tongva — the Gabrieleño people — lived along the river. Their largest village, Yang-na, stood near what is now the downtown civic center. They fished, gathered acorns, and traded with the Chumash west of the Santa Monicas and the Cahuilla east of the basin.

In 1781, a Spanish governor walked forty-four people across the plain from Mission San Gabriel and founded a town beside the river. Of those forty-four founders, most were of African, Indigenous, or mixed heritage. A handful were Spanish. The town was called El Pueblo de la Reina de los Ángeles — the town of the queen of the angels — and from its first day, it was not a Spanish city. It was an American one, three quarters of a century before the United States arrived.

Mexico took the place from Spain in 1821. The United States took it from Mexico in 1848. The pueblo became a cow town, then a railroad town, then an oil town, then a real estate town, all in fifty years. When water came from the Owens Valley in 1913 and the orange groves followed, the city annexed everything around it that needed irrigation — the San Fernando Valley, the harbor at San Pedro, the long strip down to the sea.

Hollywood started here because the light was good and the lawyers in New Jersey were far away. Aerospace came after the First World War — Lockheed, Northrop, Douglas — because the weather let test pilots fly almost every day of the year. After the Second, the suburbs poured out across the basin in every direction the freeways could reach.

The city you see now is the largest in California, the second largest in the country, and one of the most linguistically diverse on Earth. Beneath it all, the river still runs, mostly in concrete now, mostly out of sight — but the basin remembers when it ran free.
$narration$
WHERE id = 'f63e48f5-2cef-4112-8639-a54b65fffd20';

-- Verification: both rows present, descriptions updated.
DO $verify$
DECLARE
  v_sfv_len     int;
  v_labasin_len int;
BEGIN
  SELECT LENGTH(description) INTO v_sfv_len
  FROM public.regions
  WHERE id = '733e4582-bb39-48d1-8dc3-f6911d360bf1';

  SELECT LENGTH(description) INTO v_labasin_len
  FROM public.regions
  WHERE id = 'f63e48f5-2cef-4112-8639-a54b65fffd20';

  IF v_sfv_len IS NULL THEN
    RAISE EXCEPTION 'San Fernando Valley row missing after UPDATE';
  END IF;
  IF v_labasin_len IS NULL THEN
    RAISE EXCEPTION 'Los Angeles Basin row missing after UPDATE';
  END IF;

  -- New synopses are ~2.6-3.0 KB; loose floor catches partial updates.
  IF v_sfv_len < 2000 THEN
    RAISE EXCEPTION 'SFV description shorter than expected after UPDATE: % chars', v_sfv_len;
  END IF;
  IF v_labasin_len < 2000 THEN
    RAISE EXCEPTION 'LA Basin description shorter than expected after UPDATE: % chars', v_labasin_len;
  END IF;

  RAISE NOTICE 'Verified: SFV=% chars, LA Basin=% chars', v_sfv_len, v_labasin_len;
END $verify$;

COMMIT;
