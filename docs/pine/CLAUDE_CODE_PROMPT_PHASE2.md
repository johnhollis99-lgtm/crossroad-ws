# XRoad redesign — Phase 2: Customize + Trip

**Prerequisite:** Phase 1 (`CLAUDE_CODE_PROMPT.md`) is already merged. Home screen is in production with the Pine palette, duotone icons, motion system, and a11y tokens. This document is **additive** — it spec's two new screens and one new token without touching anything Phase 1 already shipped.

Same constraints apply: **this is a visual + layout pass.** Every existing handler, route, search call, narrator-selection logic, trip start/end flow, story playback engine, geolocation tracking, polyline rendering pipeline, and player state machine **stays exactly as it is today.** You are re-skinning the views and re-arranging the chrome.

If a button is wired to `startTrip()` today, the redesigned button still calls `startTrip()`. If a slider drives `setMinRelevance(value)`, the redesigned slider drives it too. Wiring stays; pixels change.

---

## 1. New token: `danger` (add to your theme file)

Pine already has `primary`, `secondary`, etc. Add one more:

```
danger          #E11D48   // rose — destructive actions (End trip)
dangerDeep      #BE123C
dangerTint      rgba(225,29,72,0.16)
```

Use cases: **End trip** button, any "destroy" / "leave" / "cancel-with-consequences" confirmation. It deliberately doesn't share hue with primary (emerald) or secondary (cobalt) so it reads as "stop, this is a different category of action."

Verified contrast on Pine paper: `danger` on `paper` = ~4.8:1 (AA for normal, AAA for large). White on `danger` = 4.6:1 (AA).

---

## 2. New icons (extend the icon library)

All duotone — same `var(--ax, currentColor)` accent shape pattern as the rest. 24×24 viewBox, stroke 1.7, round caps/joins. Add the following:

- **IconArrowLeft** — back navigation (top-left in both screens)
- **IconPlay / IconPause** — media controls
- **IconSkipBack / IconSkipFwd** — prev/next story
- **IconVolume / IconVolumeOff** — mute / unmute (the Quiet pill)
- **IconMic** — optional, narrator-related affordances
- **IconSparkle** — optional, "loading stories" / generation status

The accent shape is the obvious "filled" half — the play triangle, the icon body, the speaker cone, etc.

---

## 3. Customize screen

**Mode:** conservative refactor — IA preserved, every control re-skinned to Pine, narrator avatar colors constrained, emoji-mode-icons swapped to duotone.

Reference artboard: `customize-pine` (360×1280) in the prototype canvas.

### Top region — map peek

A 240px tall map peek at the top of the screen, identical render to the home map but smaller. Fades into the paper bg via a `linear-gradient(180deg, transparent 0%, paper 90%)` overlay on the bottom 110px.

Floating chrome:
- **Back button** — top-left, 40×40 circular, `paperSoft` bg + `paperEdge` border, `IconArrowLeft` inside.
- **Map style chip** — top-right, pill 22 radius, `paperSoft` bg, 1px `paperEdge` border, leading 28×28 thumbnail (gradient + `IconLayers`), label "Dark". This is the same chip pattern Phase 1 used for the layers control — extract to a shared component if it doesn't exist yet.

### Below the map — scrollable content

`padding: 4px 16px 110px` so the sticky CTA at the bottom doesn't overlap the last slider.

**Route summary** (inline wrapped row, 14px DM Sans):
- "Current location" (`inkSoft`, 500) → (terracotta/primary 700) → "Cambria, CA" (`ink`, 700) · (`inkFaint` separator) · "3h 29m" (`inkSoft`, 500)

**Stats strip** — 4 equal columns, separator borders top + bottom (1px `line`), `padding: 12px 0`:
- 208.6 mi · 3h 29m · 0 POIs · ★
- Each: value 15/700 `ink` + optional unit 11/500 `inkSoft`

**Section: "Narration depth"** — uppercase eyebrow 11/700 letter-spaced 0.18em, `inkSoft`, margin-bottom 10. Then a `SegmentedTrio` (custom 3-button segmented):
- 3 equal columns, gap 8.
- Each button: 10px padding, radius 14, two-line content (main label + sub label).
- Selected: bg `primaryTint`, border `primary`, box-shadow `0 0 0 1px primary`, color `primary`, weight 700.
- Unselected: bg `paperWarm`, border `paperEdge`, color `ink`, sub color `inkSoft`.
- Items: Glance / 1–2 lines · **Ride along / Short paragraph** (default) · Deep dive / Full story.

**Section: "Your narrator"** — 2×2 grid of NarratorCard, gap 10.

Each card (`NarratorCard`):
- Padding 14, radius 16, flex column gap 10.
- 34×34 accent-colored avatar circle with 2-letter initials (white text, 13/700).
- Name 15/700, tagline 11.5/500 `inkSoft` (single-line truncated).
- Selected: bg `primaryTint`, border `primary` + 1px box-shadow ring, name color `primary`.
- Unselected: bg `paperSoft`, border `paperEdge`, name color `ink`.

**Avatar accent palette** — constrained to Pine-coherent hues. Reuse the persona's existing identity color *only if it falls within this set*; otherwise migrate to the nearest one:
- JR (Junior Ranger): `#10B981` (emerald — matches primary)
- TL (Local): `#9F7AEA` (lilac — replaces the existing brown which read off in dark)
- TP (Professor): `#60A5FA` (cobalt — matches secondary)
- TD (Truck Driver): `#F59E0B` (amber — same hex as the CVD-safe accent)

If you add more narrators in the future, pick from this set or a complementary Pine-safe hue (avoid pure red, orange, or saturated brown — they fight the palette).

**Section: "Categories"** — same horizontal chip rail as the home screen (reuse the `xr-chip-rail` component). Selected = solid `primary` bg + `paperSoft` text. Unselected = `paperSoft` bg + `ink` text. The History chip's old terracotta-orange goes away — same emerald treatment as every other selected chip.

**Section: "Density"** — another `SegmentedTrio`, single-line labels (no sub):
- Sparse · **Balanced** (default) · Dense

**Section: "Min relevance"** — `LabeledSlider`:
- Header row: uppercase eyebrow on the left, large value (20/700 `primary`) on the right.
- 4px track in `paperWarm` with `primary` fill at the value %.
- 22×22 thumb: `paper` bg, 2px `primary` border, drop shadow.
- Min/max labels below in 11px `inkSoft`.
- Range 0–100, default 100.

**Section: "POI distance"** — same `LabeledSlider`, unit " mi", range 0–20, default 1.

### Sticky bottom — Start trip

Absolute-positioned 24px above the bottom edge, full-width minus 16px gutters:
- Padding `16px 18px`, radius 16, bg `primary`, color `paper` (dark text on bright emerald for max readability), font 16/700.
- Leading `IconCar` 20px.
- Box-shadow `0 6px 18px primaryTintEdge` for lift.

Wire to the existing `startTrip(...)` handler. Don't change which params get collected.

---

## 4. Trip screen — retracted and deployed

**Mode:** conservative refactor — restructures the sheet into two clearer states, swaps the polyline color, introduces the `danger` button, keeps every control.

Reference artboards: `trip-pine-retracted` and `trip-pine-deployed` (both 360×780).

### Map layer

Map fills the screen. **Polyline color: switch from cobalt blue (#3b82f6 or wherever it's hardcoded today) to Pine `primary` (#10B981 emerald).** This is the most visible single-pixel change.

Stops along the polyline render as **stylized serif Xs** — same `<text fontFamily="'Instrument Serif'" paintOrder="stroke">X</text>` treatment Phase 1 introduced. Each stop pulses a `xr-sonar` ring.

### Top chrome — two floating pills

Both pills sit at `top: 38px`, left and right edges (`left: 12px` / `right: 12px`). They're intentionally separated so the map breathes between them.

**Left pill — Persona pill:**
- Single `paperSoft` pill with 1px `paperEdge` border, padding `6px 16px 6px 6px`.
- Contains: 28×28 transparent back button (`IconArrowLeft`), then a 28×28 avatar circle (filled in the narrator's persona color — for The Professor that's cobalt `#60A5FA`) with 2-letter initials, then narrator name 14/700 `ink`.
- Tapping the back arrow returns to Customize.

**Right pill — Stories badge:**
- Pill with `paperSoft` bg, `paperEdge` border, padding `6px 14px`.
- Italic-serif numeral 22/400 `primary` (matches the wordmark vocabulary) — this is the story-count metric.
- "STORIES" eyebrow 10/700 letter-spaced 0.16em uppercase `inkSoft`.

### Below — stats strip

A wide 3-column stats card at `top: 96px`, full-width minus 12px gutters:
- `paperSoft` bg, 1px `paperEdge` border, radius 18, shadow.
- 3 columns: **Remaining** (3h 29m), **Distance** (208.6 mi, with hairline `line` dividers left + right), **Next story** (— / story title when active).
- Value 15/700, eyebrow 9.5/700 letter-spaced 0.18em uppercase, `inkSoft`.

### Map controls (visible only when sheet is retracted)

Stack on the right edge below the stats card:
- Compass puck (`top: 200`, 46×46, circular, `paperSoft`, `IconNorth` in `primary`).
- Map style chip (`top: 256`, same chip pattern as Customize).

When the sheet is deployed they hide — the map is mostly covered anyway.

### Bottom sheet — retracted state

Floating card lifted 24px off the bottom (clears Android nav / iOS gesture pill). `position: absolute; left: 10px; right: 10px; bottom: 24px;` `paper` bg, radius 24 all four corners, 1px `paperEdge` border, shadow `0 -8px 24px rgba(0,0,0,0.5)`.

Contents top → bottom:
1. **Drag handle** — 40×4 pill in `line` color, centered, paddingTop 8.
2. **XRoad watermark** — large display. Serif roman `X` at 56px in `primary` (the X visibly **breathes** with the same `.xr-ax-pulse` rhythm as the icon accents), and italic `Road` at 38px in `ink`. Centered. Opacity ~0.65 in the retracted state.
3. **"0 POIs ahead"** — DM Sans 13/600 `inkSoft`, centered.
4. **Action row** — `padding: 0 14px`, flex gap 10:
   - Big circular **Play** button (52×52, `ink` bg, `paper` foreground — high contrast for primary affordance). Wired to existing playback handler.
   - **Skip forward** (44×44, `paperWarm` bg, `paperEdge` border, `IconSkipFwd`).
   - **End trip** — `flex: 1` pill, `padding: 14px 18px`, radius 999, bg `danger`, white text, 15/700, leading `IconClose`, box-shadow `0 4px 14px dangerTint`. Wired to existing endTrip handler.

### Bottom sheet — deployed state

Same chrome (floating card lifted 24px). Contents reorganize:
1. Drag handle (same).
2. **XRoad watermark** — same X+Road treatment, smaller opacity (~0.55) so it sits in the background rather than competing with the controls.
3. "0 POIs ahead" line.
4. Horizontal divider — 1px `line`, margin `12px 18px 0`.
5. **Media controls** — 3 circular buttons centered, gap 28: skip-back (44), play (58, primary `ink` bg), skip-fwd (44).
6. **"Up next" section** — eyebrow 10.5/700 letter-spaced 0.18em `inkSoft`. Below: a 13/italic `inkSoft` "Loading stories…" placeholder, replaced by the actual upcoming-story title when one resolves.
7. **Story corridor** — `LabeledSlider`, same component as Customize, label "Story corridor", range 0–20 mi, default 1 mi.
8. **Mode toggle** — `Drive` / `Walk` segmented control (the same one Phase 1 introduced for Home). Selected uses `primary`. Replaces the current 🚗/🥾 emoji buttons.
9. **Footer row** — flex gap 10, padding `0 14px`:
   - **Quiet** pill — `paperWarm` bg, `paperEdge` border, `IconVolumeOff` + "Quiet" 13/600 `ink`, radius 14, padding `10px 14px`. Toggles narration on/off via the existing handler.
   - **End trip** — `flex: 1`, danger styling (same as retracted), 12px padding, radius 14, leading `IconClose`, 14/700.

The sheet switches between retracted and deployed via the existing collapse/expand affordance — drag handle, chevron, swipe — whatever your existing sheet primitive supports. Keep that wiring.

---

## 5. Animations that apply

All Phase 1 animations carry over and apply to the new chrome with no extra setup:

- **Icon accent breath (`xr-ax-breath`)** — every duotone icon in both screens.
- **Chip rail stagger (`xr-chip-rail`)** — Customize's Categories rail.
- **Sonar rings (`xr-sonar`)** — route-stop X markers on the Trip map.
- **User-location halo (`xr-user-halo`)** — user dot on the Trip map.
- **Cluster breath + dashed ring** — any cluster bubbles that appear in either map view.

**New use of an existing animation:** the **XRoad watermark X** inside the Trip sheet gets the same accent breath. Add `className="xr-ax-pulse"` or wrap the X glyph in `<span className="xr-ax">` so it picks up `xr-ax-breath`. It's the same animation, just applied to a non-icon element.

Nothing new to add to the stylesheet.

---

## 6. Acceptance criteria

A Phase 2 PR is correct if:

- **Visual fidelity**: Customize, Trip retracted, and Trip deployed match the prototype artboards (`customize-pine`, `trip-pine-retracted`, `trip-pine-deployed`) at 360×viewport height. Scales cleanly up to 390×844 and 412×915.
- **Functional preservation**: every handler / state machine / data binding still works exactly as before Phase 2. No behavior regressions. Trip playback, narrator selection, category filters, slider value pushes, start/end trip wiring, all untouched.
- **Color discipline**: zero remaining instances of the old terracotta-orange chip color, brown narrator-avatar background, or cobalt-blue polyline in Trip. All accents resolve to Pine's `primary` / `secondary` / `danger` tokens.
- **CVD safety**: toggling **Color-blind safe** in the settings panel swaps `secondary` → `cvdSafe` everywhere it appears on these screens (icon accents primarily), with no side effects on `primary` or `danger`.
- **Motion**: the Trip XRoad watermark visibly breathes when reduced-motion is off, holds still when reduced-motion is on.
- **No emojis**: 🚗 / 🥾 / 🔇 are gone — replaced with `IconCar` / `IconHike` / `IconVolumeOff`.

---

## 7. Out of scope (do not do)

- Don't touch the Home screen — it's already implemented and shipped from Phase 1.
- Don't introduce new screens beyond Customize and Trip.
- Don't change the narrator personalities, copy, or what stories play.
- Don't change the trip lifecycle (start, pause, resume, end).
- Don't move the polyline-rendering pipeline; only its color.
- Don't refactor the bottom-sheet library you use (Gorhom BottomSheet on RN, whatever on web) — just slot the new contents into the existing sheet host.
- Don't add new analytics events for the redesign itself. If you want behavior-comparison analytics, that's a follow-up PR.

If anything seems necessary outside this scope, raise it in the PR description instead of doing it silently.

---

## 8. Files to update (suggested mapping — adapt to your code structure)

- `theme.ts` / `tokens.ts` — add the `danger`, `dangerDeep`, `dangerTint` tokens.
- `Icons/` directory — add `ArrowLeft`, `Play`, `Pause`, `SkipBack`, `SkipFwd`, `Volume`, `VolumeOff`, `Mic`, `Sparkle`.
- `screens/Customize/Customize.tsx` (or your equivalent) — restructure per section 3.
- `screens/Trip/Trip.tsx` (or your equivalent) — restructure per section 4.
- `screens/Trip/TripSheet.tsx` — the retracted/deployed sheet content split.
- `components/SegmentedTrio.tsx` — new shared atom for the 3-button segmented (used in both Narration Depth and Density).
- `components/NarratorCard.tsx` — new shared atom (or update existing).
- `components/LabeledSlider.tsx` — new shared atom (Min relevance, POI distance, Story corridor — three callsites).
- `components/MapStyleChip.tsx` — extract if not already.
- `components/PersonaPill.tsx`, `components/StoriesBadge.tsx`, `components/TripStat.tsx` — new shared atoms.

Reuse aggressively across the two screens (`LabeledSlider` and `SegmentedTrio` each have multiple callsites). Don't re-implement the segmented or slider per-screen.

---

That's everything Phase 2 needs. Same `design-tokens.json` reference, same Pine palette, just the additional `danger` token. Ping back if any of the per-section spec is unclear or if there's a code-structure constraint that needs to override.
