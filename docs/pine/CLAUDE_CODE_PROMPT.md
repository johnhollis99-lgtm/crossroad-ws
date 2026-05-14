# XRoad redesign — Claude Code handoff (Phase 1)

This is a **visual + layout redesign** of the existing XRoad app. **Every existing function, handler, route, API call, navigation event, search behavior, location service, and data binding must remain intact.** You are re-skinning and re-arranging the existing screen — not rebuilding it.

Treat this as a CSS / view-layer migration. Do not touch:

- Business logic, state management, reducers, stores
- Network calls, fetching, caching, offline handling
- Map provider integration (whatever you use today — Mapbox, Google Maps, MapLibre, etc.)
- Authentication, profile, account routing
- Routing engine, navigation, turn-by-turn
- Search backend, geocoding, autocomplete data source

If a handler or service is wired to an element today, keep that wiring on the new equivalent element.

---

## 1. The committed direction: **Pine — Emerald + Cobalt**

A single dark theme with an emerald-green primary accent and cobalt-blue secondary. Replaces the current warm-paper/terracotta scheme entirely.

Two screen states to implement: **deployed** (full route panel sheet) and **retracted** (collapsed sheet showing only tabs + summary). The user can toggle between them.

---

## 2. Design tokens

See `design-tokens.json` for the machine-readable version. Inline summary:

### Color (use these EXACT hex values — they pass WCAG 2.1 AA across every meaningful pair)

```
paper            #08160F   // primary surface (header card, sheet, FAB)
paperSoft        #0F1F18   // text color on primary-accent backgrounds
paperWarm        #142922   // secondary surface (search field, avatar, active tab pill)
paperEdge        #2A4035   // border / divider on opaque surfaces

ink              #E8FAEF   // body text, icon primary stroke
inkSoft          #9ACCB0   // secondary text, meta labels
inkFaint         #5E907C   // tertiary — decorative only, never content

line             rgba(232,250,239,0.22)
lineSoft         rgba(232,250,239,0.10)

primary          #10B981   // EMERALD — chips selected, Drive button, route stops, rating chip
primaryDeep      #059669
primaryTint      rgba(16,185,129,0.14)
primaryTintEdge  rgba(16,185,129,0.28)

secondary        #60A5FA   // COBALT — icon accent dots, Add stop pill
secondaryDeep    #3B82F6
secondaryTint    rgba(96,165,250,0.14)
secondaryTintEdge rgba(96,165,250,0.28)

cvdSafe          #F59E0B   // amber — replaces `secondary` when color-blind-safe mode is on
```

### Typography

| Role     | Family                                   | Weight  | Size     | Used for                                  |
|----------|------------------------------------------|---------|----------|-------------------------------------------|
| Display  | Instrument Serif italic                  | 400     | 26–32px  | Route hero ("1h 12m"), feature headlines  |
| Wordmark | Instrument Serif (roman X + italic Road) | 400     | 20–22px  | The XRoad logo                            |
| Body     | DM Sans                                  | 600     | 14px     | Stop titles, primary text                 |
| Label    | DM Sans                                  | 600–700 | 14px     | Button labels, chip labels                |
| Meta     | DM Sans                                  | 500     | 12px     | Stop subtitles, distance, etc.            |
| Eyebrow  | DM Sans                                  | 700     | 10–11px  | UPPERCASE section headers, tracking 0.18em |

Load both Google Fonts: `Instrument Serif:ital@0;1` and `DM Sans:wght@400..700`.

### Radii / Shadow

```
card / sheet     26 / 24 px (sheet has all 4 corners rounded when floating off the bottom)
chips / pills    999px
buttons / tabs   12–14px
maprail seg      16px

shadow.card      0 10px 28px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)
shadow.control   0 4px 14px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)
shadow.sheet     0 -8px 24px rgba(20,16,8,0.18)
```

---

## 3. Layout — Pine deployed screen

A single 360×780 screen on top of the full-bleed map.

### Top header card (`position: absolute; top: 38px; left: 12px; right: 12px`)

Single `paper`-filled rounded card (radius 26, padding `14px 16px 12px`), with **three rows** stacked:

**Row 1 — logo on the left, avatar on the right**
- Left group (horizontal flex, gap 10): a small hand-drawn **Squiggle** (36px wide tan/cream wavy line with a terracotta dot — preserve as inline SVG) followed by the **Wordmark** at 22px.
- Right: a 34×34 circular avatar — `paperWarm` background, 1px `paperEdge` border, centered user icon.

**Row 2 — full-width segmented mode toggle** (`marginTop: 12`)
- Two-segment pill switcher: **Drive** (left) and **Walk** (right). Selected segment uses `primary` background + `paperSoft` text; unselected uses transparent + `ink` text. Pill radius 999. Each segment shows its icon + label.

**Row 3 — search field** (`marginTop: 10`)
- 42px tall rounded pill, `paperWarm` bg, 1px `paperEdge` border. Leading **IconSearch**, then a text input with placeholder "Where to?" in `inkSoft`. No avatar inside the field (avatar lives in Row 1).

### Chip rail (below the card, `marginTop: 10`)

- Horizontal scroll row with `gap: 8`, `padding: 2px 2px 6px`, `overflowX: auto`, `scrollbarWidth: none`.
- Right-edge fade: `maskImage: linear-gradient(90deg, #000 90%, transparent)`.
- 6 chips, label + icon (size 14, sw 1.8): `History · Nature · Architecture · Food · Music · Art`.
- Selected chip: `primary` bg + `paperSoft` text + `primaryDeep` border.
- Unselected chip: `paperSoft` bg + `ink` text + `paperEdge` border.
- Size: padding `6px 12px`, radius 999, font 13/600.

### Map right rail (`position: absolute; right: 12px; top: 308px`)

Vertical rounded-pill column of 4 buttons stacked, each ~32×40, with hairline dividers (`line` color) between them:
1. **Compass / North** — active state (terracotta/primary tinted bg)
2. **Layers** (this is the satellite / map-style switcher)
3. **Plus** (zoom in)
4. **Minus** (zoom out)

### Recenter FAB (`position: absolute; right: 12px; bottom: 416px when deployed; 178px when retracted`)

A 44px circular `paper` button with crosshair icon. Sits above the bottom sheet edge so it never overlaps the sheet content.

### Bottom sheet — deployed state

Floating card, NOT flush with the phone's bottom edge:
- `position: absolute; left: 10px; right: 10px; bottom: 24px;`
- `paper` background, all four corners radius 24, 1px `paperEdge` border, `shadow.sheet`.
- Drag handle at top: 40×4 pill in `line` color, centered, `paddingTop: 8px`.

Contents top–bottom:

1. **Segmented tabs** — `padding: 4px 16px 6px`, three buttons `Route · Saved · Recent`, flex 1 each. Active tab: `paperWarm` bg, `ink` text, weight 700, radius 12. Inactive: transparent, `inkSoft` text.
2. **Route summary** — `padding: 8px 18px 6px`, bottom border `line`. Two columns:
   - Left: Italic-serif display "1h 12m" (26px) + meta "24 mi · 3 stops" (12px, `inkSoft`).
   - Right (flex 1): a 6px-tall `paperWarm` progress track with 65%-wide `primary` fill, then a rating chip "★ 4.8" — `primaryTint` bg, `primaryTintEdge` border-ish, `primaryDeep` text, radius 999.
3. **Stops list** — `padding: 8px 14px 0`. Four rows, each `padding: 8px 4px`, layout `flex; gap: 12`:
   - 26×26 circle marker. Start = `ink` (light), end = `ink`, intermediate = `primary` (emerald). White text/icon inside (`paperSoft`). 2px paperSoft border + 1px `line` outer ring.
   - Middle column: title (14/700, `ink`, ellipsis) + subtitle (12/500, `inkSoft`).
   - Right: a 16px grip icon (`inkFaint` stroke).
   - The four rows: start ("Current location" / "Thousand Oaks, CA"), stop "Vasquez Rocks" (Nature · 12 min visit), stop "Skirball Center" (Architecture · 35 min), end "Santa Monica Pier" (Destination).
4. **Footer** — `marginTop: 6; padding: 10px 14px 0`, top border `line`. Single full-width pill button **+ Add stop** — `secondaryTint` bg, `secondary` text, 1px `secondaryTintEdge` border, radius 12, padding `10px 14px`, font 14/700.

### Bottom sheet — retracted state

Same floating card chrome (`bottom: 24`, all 4 radii, border, shadow), but content collapses to:

1. Drag handle (same as deployed).
2. Segmented tabs (same).
3. Single summary row (no stops list, no footer). Same "1h 12m / 24 mi · 3 stops" + progress + rating chip layout, plus a small **chevron-up** circular button at the right (32×32, `paperWarm` bg, 1px `line` border) that expands the sheet on tap.

Approximate sheet height: 120–130px retracted, 360–380px deployed.

The user toggles between states by tapping the chevron, swiping the handle, or pressing some equivalent affordance in your existing code. Whatever you have today, wire it to swap between these two layouts.

---

## 4. Map presentation

Whatever provider you use, layer these visual changes on top of the existing map view:

### POI marker style — **stylized serif "X"**

Replace any dot/pin/circle POI markers with an **Instrument Serif "X" glyph**:

```svg
<text textAnchor="middle" dy="4.5"
      fontSize="14"
      fontFamily="'Instrument Serif', Georgia, serif"
      fontWeight="700"
      fill="{primary}"
      stroke="{paperSoft}"
      strokeWidth="2.4"
      strokeLinejoin="round"
      paintOrder="stroke">X</text>
```

The `paintOrder="stroke"` trick renders a light halo behind the glyph so it stays legible on any map color. The X uses the same serif as the wordmark — it's the brand mark, not a generic icon.

### Cluster markers — layered bubble

For grouped/clustered POIs render this composition (radius `r` scales with cluster count: `r = 10 + min(18, count * 0.8)`):

1. Outer soft halo: `circle r=r+6 fill=paperSoft opacity=0.18`
2. Dashed cartographic ring: `circle r=r+3 fill=none stroke=paperSoft strokeWidth=0.7 strokeDasharray="2.4 3.6" opacity=0.6` — slowly rotates 360° / 24s (see motion section).
3. Filled bubble: `circle r=r` with radial gradient `primary → primaryDeep` at 95% opacity.
4. Hairline border: `circle r=r stroke=paperSoft strokeWidth=0.5 opacity=0.5`.
5. Inner top-left highlight: `circle cx=-r*0.32 cy=-r*0.4 r=r*0.22 fill=paperSoft opacity=0.32` — gives the bubble dimension.
6. The count as **Instrument Serif** numeral (14–16px, weight 600, `paperSoft` fill).

### Route-stop X markers

Larger version of the POI X (fontSize 22, strokeWidth 3.5) with a labeled pill chip directly below (10/700 DM Sans, `paper` bg, `ink` text). Each emits two sonar rings (see motion).

### User location

The existing user-location dot stays as is (blue), but wrap its outer halo (`r=14, fill=#3b82f6, opacity=0.18`) in the `xr-user-halo` animation class so it gently pulses.

---

## 5. Duotone icon system

Every icon is now **duotone**: a primary stroke (currentColor) plus an accent shape (the small dot, fill, or splash). The accent reads from a CSS custom property `--ax` so a single declaration on the screen root paints every icon at once.

### How to wire it

On the screen-root container:

```css
--ax: var(--secondary);   /* cobalt in Pine */
```

(When color-blind-safe mode is on, swap that value for `var(--cvdSafe)` = `#F59E0B`. That's the only change CVD mode needs.)

Inside each icon SVG, the accent shapes use:

```html
<circle ... fill="var(--ax, currentColor)" />
<!-- or via inline style: -->
<circle ... style="fill: var(--ax, currentColor); stroke: none;" />
```

Mono fallback (when no ancestor sets --ax) collapses to currentColor — single-color icon.

### Which shapes are "accent"

Inventory of the 24 icons we use, and which part is the accent:

- **IconSearch** — small center dot inside the lens
- **IconCar** — both wheels filled
- **IconHike** / Walk — small "sun" at top-right
- **IconUser** — small filled center of the head circle
- **IconNorth** — the upward triangle (north tip), filled
- **IconLayers** — soft accent fill on the top layer
- **IconPlus / IconClose / IconChevronUp / IconChevronDown / IconHandle** — no accent (mono)
- **IconGrip** — all six dots
- **IconRoute** — start endpoint circle, filled
- **IconClock** — center dot + minute hand
- **IconHistory** — small dot in the top-right corner
- **IconNature** — soft leaf fill + small "berry" dot
- **IconArch** — accent-filled doorway
- **IconFood** — small dot at fork-tip
- **IconMusic** — both note-heads filled
- **IconArt** — three accent dots (palette blobs)
- **IconPin** — center bulb, filled
- **IconFlag** — flag body fill
- **IconStar** — soft fill, with stroke on top
- **IconBookmark** — soft fill

All shapes default to a stroke of 1.7px, round caps, round joins, on a 24×24 viewBox.

---

## 6. Motion system

Five CSS keyframe animations, all run on the GPU (opacity / transform only), all gated by `prefers-reduced-motion`. Paste this stylesheet at the app root (or convert to your CSS-in-JS / RN-animated equivalent):

```css
/* ─── Icon accent breath ──────────────────────────────── */
@keyframes xr-ax-breath {
  0%, 100% { opacity: 0.72; }
  50%      { opacity: 1; }
}
.xr-ax {
  animation: xr-ax-breath 2.8s ease-in-out infinite;
  will-change: opacity;
}

/* Stagger across the chip rail so the breath rolls left → right */
.xr-chip-rail > *:nth-child(1) .xr-ax { animation-delay: 0s;    }
.xr-chip-rail > *:nth-child(2) .xr-ax { animation-delay: 0.18s; }
.xr-chip-rail > *:nth-child(3) .xr-ax { animation-delay: 0.36s; }
.xr-chip-rail > *:nth-child(4) .xr-ax { animation-delay: 0.54s; }
.xr-chip-rail > *:nth-child(5) .xr-ax { animation-delay: 0.72s; }
.xr-chip-rail > *:nth-child(6) .xr-ax { animation-delay: 0.90s; }

/* ─── Sonar rings on route-stop X markers ─────────────── */
@keyframes xr-sonar {
  0%   { transform: scale(0.5); opacity: 0.7; }
  80%  {                         opacity: 0;   }
  100% { transform: scale(3.6); opacity: 0;   }
}
.xr-sonar-ring {
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: xr-sonar 2.8s ease-out infinite;
  will-change: transform, opacity;
}
.xr-sonar-ring.xr-sonar-late { animation-delay: 1.4s; }

/* ─── User location halo ──────────────────────────────── */
@keyframes xr-user-halo {
  0%, 100% { transform: scale(1);    opacity: 0.22; }
  50%      { transform: scale(1.5);  opacity: 0.06; }
}
.xr-user-halo {
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: xr-user-halo 2.2s ease-in-out infinite;
}

/* ─── Cluster bubbles — slow asymmetric breath ────────── */
@keyframes xr-cluster-breath {
  0%, 100% { transform: scale(1);     opacity: 1;    }
  50%      { transform: scale(1.045); opacity: 0.93; }
}
.xr-cluster {
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: xr-cluster-breath 4s ease-in-out infinite;
}

/* ─── Cluster dashed ring — marching dial ────────────── */
@keyframes xr-cluster-ring {
  to { transform: rotate(360deg); }
}
.xr-cluster-ring {
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: xr-cluster-ring 24s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .xr-ax, .xr-sonar-ring, .xr-user-halo, .xr-cluster, .xr-cluster-ring {
    animation: none;
  }
}
```

For each cluster, stagger the breath with an inline `animation-delay` so they don't pulse in unison — e.g. `(index * 0.31s) % 4s`.

For each route-stop X marker, render TWO `.xr-sonar-ring` circles per stop — one at default phase, one with `.xr-sonar-late` (1.4s delay) — so each marker has a sustained double-ripple.

If you're on React Native, port these to `Animated.loop(Animated.timing(...))` with the same durations/easings; the visual contract is what matters, not the engine.

---

## 7. Accessibility — must preserve, must add

The current app likely has some of these wired already. Reconnect / add as needed:

1. **Text scale** — at least respect the OS dynamic-type setting, with an in-app slider 1.0–1.5×.
2. **Bold text toggle** — boosts every font-weight by +200 (capped at 900).
3. **High contrast** — irrelevant in Pine (the theme is already high-contrast), but the toggle should still exist; have it no-op in Pine for now.
4. **Large touch targets** — multiply control heights by 1.18 when on.
5. **Map dim** — overlay slider 0.0–0.6 alpha on the map for low-light readability.
6. **Night drive** — irrelevant in Pine (already dark) — same as high contrast, expose the toggle but no-op.
7. **Color-blind safe** — when on, swap `secondary` (#60A5FA) → `cvdSafe` (#F59E0B) **app-wide**. This is the single most impactful CVD adjustment because cobalt + emerald is already mostly safe; switching the secondary to amber covers the remaining tritanopia case. The primary stays emerald.

Expose all of these in a settings panel that mirrors what the design canvas shows. The hooks for them in our prototype are on the `useA11y()` context — translate to whatever your settings system uses.

WCAG 2.1 AA contrast is verified in the audit artboard — the lowest scoring pair is `inkFaint` (#5E907C) on `paper` at 5.09:1, which still passes full AA. Don't introduce any new tokens without re-running the audit.

---

## 8. Implementation order suggestion

1. **Tokens first** — pull the color/type/spacing values into your design-system file. Drop the old terracotta/moss/paper-warm names; rename to the Pine set or alias them via a single theme object.
2. **Typography** — load Instrument Serif + DM Sans. Replace any current display/serif usage with Instrument Serif italic at 26+.
3. **Top header card** — replace whatever the current top-of-screen header is with the three-row card. Wire the existing search input, mode-toggle handler, and avatar tap into the new elements.
4. **Bottom sheet — deployed** — restructure the existing route panel into the tabs + summary + stops + Add-stop footer layout. All existing stop data, route durations, and progress values stay; only the visual chrome changes.
5. **Bottom sheet — retracted** — add the collapsed state and the expand/collapse toggle. Use whatever sheet primitive you already have (e.g. BottomSheet from `@gorhom/bottom-sheet` if RN, or a CSS-driven height swap on web).
6. **Map rail + FAB** — consolidate the existing compass / layers / zoom controls into one right-edge rail. Move the recenter FAB above the sheet so they don't overlap.
7. **POI markers** — re-render existing POI data with the serif-X glyph and the new cluster bubble composition. The provider's clustering plug-in stays — only the marker view changes.
8. **Icons** — swap to the duotone system. Add the `--ax` CSS variable on the screen root.
9. **Motion** — add the keyframes stylesheet. Tag the relevant elements with the classes (`.xr-ax` on icon accent shapes, `.xr-chip-rail` on the chip row, `.xr-sonar-ring` on each route stop's ripple circles, `.xr-user-halo` on the user-location outer ring, `.xr-cluster` + `.xr-cluster-ring` on cluster groups). Respect `prefers-reduced-motion`.
10. **Settings panel** — add or update the a11y toggles, including the new **Color-blind safe** switch.

---

## 9. Acceptance criteria

A change is correct if all of these are true:

- Visual: matches the Pine deployed and retracted artboards in this project at 360×780 viewport.
- Functional: every existing handler / route / data flow still works exactly as it did before this PR. No behavior regressions.
- Accessibility: passes the WCAG 2.1 AA contrast audit (see `design-tokens.json` and the audit artboard).
- Motion: animations run smoothly at 60fps on mid-tier devices, and disable entirely when `prefers-reduced-motion: reduce` is set.
- Theme switching: toggling **Color-blind safe** swaps every icon accent and the Add-stop pill amber, with zero other side effects.
- Touch targets: every interactive control is ≥ 44×44 logical pixels (Apple HIG / WCAG 2.5.5).

---

## 10. Out of scope (do not do)

- Don't change route engine, search backend, or any data integration.
- Don't introduce new screens, features, or flows.
- Don't add analytics, feature flags, or A/B framework.
- Don't migrate to a different state-management library.
- Don't refactor existing component hierarchies unless necessary for the layout changes above.

If any of the above seems necessary to deliver a clean migration, flag it in the PR description rather than doing it silently.
