# Pine design system — source documents

The Pine palette + component vision was specified across two prompts from Claude Design, both shared into a session with Claude Code on 2026-05-14. This folder captures them so the design source-of-truth is committed alongside the code.

## Files

- [`CLAUDE_CODE_PROMPT.md`](./CLAUDE_CODE_PROMPT.md) — **Phase 1**: tokens, type ramp, duotone icon system, motion system, a11y toggles, home screen layout. Foundation.
- [`CLAUDE_CODE_PROMPT_PHASE2.md`](./CLAUDE_CODE_PROMPT_PHASE2.md) — **Phase 2**: Customize + Trip screens, danger token, new shared atoms.
- [`design-tokens.json`](./design-tokens.json) — canonical token values. Matches `src/design/tokens.ts` modulo two evolutions made during implementation:
    - **Paper colors swapped to near-black** (commit `e9a2659`). Pine prompt specified dark forest-green (`paper: #08160F`); user reported the green tint was reading as the dominant identity over the emerald + cobalt accents. Swapped to neutral near-black gradient (`paper: #0A0A0A`, `paperSoft: #141414`, `paperWarm: #1E1E1E`, `paperEdge: #2E2E2E`).
    - Implementation added `displaySmall` + `titleSmall` text variants beyond what the JSON specifies, to cover the route-hero (26px) and wordmark "Road" (22px) sizes the spec describes inline.

## Implementation status (as of 2026-05-14)

| Phase | Status | Commit chain on `main` |
|---|---|---|
| 1 (foundation + home tokens) | **landed** | `880b807` |
| 1 (paper-color black correction) | **landed** | `e9a2659` |
| 2 (customize + drive full rebuild) | **landed** (part of `880b807`) | — |
| 2 (marker visuals + sonar + halo) | **landed** | `160b88a` |
| 2 (cluster pin shape + home header card) | **landed** | `c85b562` → `7325b58` |
| 3 (home bottom sheet rebuild) | **pending** | — |
| 3 (legacy screens off `C` palette) | **pending** | — |

See the **"Pine redesign — current direction"** section at the top of [`CLAUDE.md`](../../CLAUDE.md) for the implementation state-of-the-world (palette current values, screens that are Pine vs legacy, motion hooks, marker discipline, etc).

## Out-of-scope deviations from the prompts

A few specifics in the prompts that didn't translate directly to RN:

1. **CSS keyframes in motion section** — ported to RN `Animated.loop` in `src/design/motion.ts` (`useBreath`, `useSonar`, `useUserHalo`). All gated on `AccessibilityInfo.isReduceMotionEnabled()`.
2. **`--ax` CSS custom property pattern** — RN doesn't have CSS variables. Instead, `theme.colors.accent` is the CVD-aware mirror of `secondary` (swaps to `cvdSafe` amber when CVD-safe mode is on). Icons read `theme.colors.accent` directly.
3. **Per-POI sonar pulses** — prompt section 4 implies every route-stop X marker pulses. We animate only the *active* (currently-narrating) POI in drive — animating 30+ markers simultaneously requires `tracksViewChanges=true` on each, which churns the GPU. The static visual upgrade (target ring + bicolor X + cream halo) applies to every POI.
4. **Marker auto-sizing** — the cluster bubble was tried as a pill with auto-width via flex; users reported clipping on 4+ digit counts. Root cause documented in [`memory/feedback_marker_auto_width_clipping.md`](../../../.claude/projects/e--Dev-XRoad-roadstory/memory/feedback_marker_auto_width_clipping.md): the Marker bitmap snapshots before `<Text>` finishes measuring its width. Resolved by switching to pin shape with widths computed explicitly from digit count × character width.
