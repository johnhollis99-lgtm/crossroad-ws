-- Tier 1 US-395 corridor batch 1 — editorial description revisions
--
-- Refreshes the `pois.description` column on the three rows seeded by
-- commit fd1bb81 (editorial:tier1-us395-corridor-2026-05-22:01 / :02 / :03).
-- Curator calibration feedback:
--   :01 Lone Pine     — tightened, Gunga Din anecdote inserted
--   :02 Bodie         — expanded with the "Goodbye God" anecdote, list-density compressed
--   :03 Vikingsholm   — two contractions expanded for TTS ("wouldn't"→"would not",
--                       "didn't"→"did not"); prose otherwise identical
--
-- Rows stay in place: source_type / source_id unchanged; only description content
-- refreshed. Other columns untouched.
--
-- Dollar-quoted bodies ($$ ... $$) used so apostrophes / quotation marks pass
-- through verbatim.

BEGIN;

-- :01 Lone Pine
UPDATE public.pois
SET description = $$Pull off US-395 at Lone Pine and you're standing in a town of about two thousand and a hundred years of celluloid memory. The Alabama Hills rise immediately west of Main Street — rounded granite boulders piled against the Sierra horizon, Mount Whitney's serrated peak behind them at 14,505 feet. Hollywood found these hills in the silent era. In 1939, the production of Gunga Din brought eleven hundred extras to Lone Pine — more than the town's own population — and built tent cities in the Alabama Hills, set off cannon fire that shook windows in town, turned this corner of the Owens Valley into India for six weeks. The town had hosted films before; after Gunga Din, the relationship was permanent. Lone Pine became Hollywood's Western backlot. Over four hundred productions have used these boulders since — frontier Texas, alien planets, Iron Man's mountain pass.

For decades, nobody in Lone Pine kept official track of any of this. Crews came and went; stars filled the rooms at the old Dow Hotel and disappeared. The history was visible only to the people lucky enough to know what they were looking at.

In 1990, a few townspeople started the Lone Pine Film Festival — gathering surviving cast members, screening the old westerns at the high school, walking visitors out to the rock formations where particular scenes were shot. People came. They kept coming. By 2006, the community had built something more permanent: the Museum of Western Film History on the south end of Main Street.

The decision at the heart of this place is small and stubborn — a town of two thousand looking at its own history and refusing to let Hollywood be the only one who remembered. Walk out the museum's back door and the Alabama Hills are right there, a few minutes' drive on Movie Road. The Sierra wind comes down off Mount Whitney smelling like sage and high dust. Lone Pine isn't a place that became famous for being filmed. It's a place that decided, after a century of being someone else's backdrop, to claim the story for itself.$$
WHERE source_type = 'editorial'
  AND source_id   = 'editorial:tier1-us395-corridor-2026-05-22:01'
  AND merged_into IS NULL;

-- :02 Bodie
UPDATE public.pois
SET description = $$Bodie sits high in the Bodie Hills east of US-395, eighteen miles north of Lee Vining and thirteen miles down a road that turns from blacktop to washboard dirt. The wind up here cuts at 8,400 feet. No trees worth mentioning — just sagebrush and the ribbed gray of granite, and the town itself: about a hundred and ten buildings, weathered the color of old wood smoke, sitting exactly where the last residents left them.

Gold was struck in 1859 by W.S. Bodey, who died in a blizzard the next winter before he could spell his name on anything permanent. The boom did not come for nearly twenty years. When it hit in the late 1870s, Bodie went from a few hundred people to a peak of around ten thousand, with sixty-five saloons running day and night and a reputation so bad it became national. One story from the period: a minister claimed he overheard a little girl praying the night before her family moved to Bodie, and what she said was, "Goodbye, God. I'm going to Bodie." The story spread. The Bodie Daily Free Press picked it up, but moved the punctuation: "Goodbye, God! We're going to Bodie." A resigned child's farewell turned into a defiant town's motto. The phrase "Bad Man from Bodie" became national shorthand for menace. By 1881 the ore was thinning. By the early 1900s, it was over.

What is unusual about Bodie isn't that it boomed and busted — California has dozens of ghost towns. What is unusual is what happened next: nothing. The town was abandoned but never demolished or scavenged or replaced. For sixty years it sat alone in the high desert, slowly weathering.

When California State Parks took it over in 1962, they made a defining choice. They could have restored Bodie — fresh paint, new windows, the standard recreation of a frontier town for visitors. Instead they chose what they called "arrested decay": minimal stabilization to prevent collapse, no reconstruction, no replacement of missing pieces. Bottles still sit on shelves where they were left. Calendars still hang on the walls turned to whatever month it was. A pianist's sheet music is open to the page she stopped on. It is a town preserved as the moment of leaving, not the moment of arrival.

Bodie is a National Historic Landmark and one of the largest authentically preserved ghost towns in the United States. The dirt road in from US-395 is rough enough that most people who make it have made the decision twice — once to come this far, and once to keep going when the pavement ended.$$
WHERE source_type = 'editorial'
  AND source_id   = 'editorial:tier1-us395-corridor-2026-05-22:02'
  AND merged_into IS NULL;

-- :03 Vikingsholm
UPDATE public.pois
SET description = $$At the head of Emerald Bay on Lake Tahoe's western shore, you have to leave the road to reach Vikingsholm. There's a turnout off Highway 89 with a viewpoint famous for being one of the most photographed in California. From there it's a steep one-mile hike down a foot trail to the lakeshore, where a 38-room mansion built in 1929 sits half-hidden among the pines, looking like a Norwegian fjord village that wandered three thousand miles west and lost the rest of the country.

Lora Josephine Knight built it. She was a widow and an heiress — her late husband, James H. Moore, had been part of a syndicate that included Standard Oil's interests; her own family came from St. Louis money. In 1928 she traveled through Scandinavia and fell in love with the architecture she found there: the carved stave churches, the dragon-head roof ridges, the dark wood and the sod roofs sown with wildflowers. She returned to America wanting to build something that would not fake the look — something that would actually be the thing.

She hired Lehman Palmedo, a Swedish-trained architect who happened also to be her nephew, and gave him a brief that was unusual for a millionaire's summer home: build it the way the old craftsmen built. No nails. No modern fasteners. Traditional joinery throughout. Hand-hewn timbers, dragon-beam carvings done by hand, some materials shipped from Sweden, local craftsmen trained in the techniques. The sod roofs were real sod, sown with wildflowers that bloom in summer. The construction took less than a year, finishing in 1929. Knight summered there until her death in 1945.

The decision at the center of Vikingsholm is small and exact: not Scandinavian-themed but Scandinavian-built. Most American attempts at European authenticity in this era went the route of pastiche — a Tudor revival in Pasadena, a Spanish fantasy along the coast, the architecture as a costume. Knight wanted the bones. She paid more, took longer, accepted constraints she did not need to accept, in service of getting the actual craft instead of its image. The result is one of the finest examples of Scandinavian architecture in the Western Hemisphere — not a copy of one, an example of one.

The property passed through several owners after her death and became part of Emerald Bay State Park in 1953. Today it's on the National Register of Historic Places. Tours run in summer; the rest of the year, it sits empty by the water. The hike down passes the photographed viewpoint near the top, then drops into pines and switchbacks, and by the time you reach the lakeshore the modern world feels far away. Stand by the front door and look up — the dragon beams are still up there, the joinery still holding, the sod roof still flowering.$$
WHERE source_type = 'editorial'
  AND source_id   = 'editorial:tier1-us395-corridor-2026-05-22:03'
  AND merged_into IS NULL;

COMMIT;

-- Verification — fail loudly if any of the three rows was missed.
DO $verify$
DECLARE
  prev_lens CONSTANT int[] := ARRAY[2622, 2583, 2721];
  ids       CONSTANT text[] := ARRAY[
    'editorial:tier1-us395-corridor-2026-05-22:01',
    'editorial:tier1-us395-corridor-2026-05-22:02',
    'editorial:tier1-us395-corridor-2026-05-22:03'
  ];
  i         int;
  new_len   int;
  rows_hit  int;
BEGIN
  FOR i IN 1..array_length(ids, 1) LOOP
    SELECT length(description), count(*)
      INTO new_len, rows_hit
      FROM public.pois
     WHERE source_type = 'editorial'
       AND source_id   = ids[i]
       AND merged_into IS NULL
     GROUP BY description;

    IF rows_hit IS NULL THEN
      RAISE EXCEPTION 'tier1-us395-corridor revision missed: % (no active row found)', ids[i];
    END IF;

    IF new_len = prev_lens[i] THEN
      RAISE EXCEPTION 'tier1-us395-corridor revision did not change description length for %: still % chars', ids[i], new_len;
    END IF;

    RAISE NOTICE 'tier1-us395-corridor % updated: % chars (was %)', ids[i], new_len, prev_lens[i];
  END LOOP;
END
$verify$;
