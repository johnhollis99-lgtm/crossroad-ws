/**
 * XRoad — session-level trip preferences store
 *
 * Zustand + persist middleware (AsyncStorage) for cross-screen state that
 * needs to survive navigation and app restart but is NOT bound to a specific
 * saved trip record. Per-trip settings (depth, poi_distance_m,
 * category_filter) live on the `trips` table; session-level settings
 * (activeTripMode, selectedCategories, detail, narrativeFocus, narratorSlug)
 * live here.
 *
 * Convention (per session handoff): every screen that reads cross-screen
 * trip state should consume via `useTripStore`, not via navigation params,
 * AsyncStorage directly, or React Context. Navigation params remain the
 * right channel for one-shot navigation payloads (route polyline, saved
 * trip id, etc.).
 *
 * J1a additions (2026-05-19):
 *   pace             — Full Drive / Light Touch (addendum §6)
 *   narrativeFocus   — The Land Speaks / + Local Color (addendum §1.2)
 *   narratorSlug     — reserved for J1b narrator picker (no UI yet); the
 *                       field persists so J1b is additive UI-only
 *
 * J1a-followups (2026-05-19):
 *   `pace` renamed to `detail` — the conceptual axis name shifts
 *   (curator walk-through feedback); option identifiers
 *   (full_drive / light_touch) keep their values. Schema v2 → v3.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TripMode       = 'driving' | 'hiking';
export type Detail         = 'full_drive' | 'light_touch';
export type NarrativeFocus = 'the_land_speaks' | 'local_color';
export type NarratorSlug   = 'narrator_a' | 'narrator_b';

interface TripState {
  /** Drive vs Hike toggle on home; persists across nav and restart. */
  activeTripMode: TripMode;
  /** Category chip selection shared between home and customize. */
  selectedCategories: string[];
  /** Detail preference — addendum §6 (was `pace` in J1a). Default Full Drive. */
  detail: Detail;
  /** Narrative focus — addendum §1.2. Default The Land Speaks. */
  narrativeFocus: NarrativeFocus;
  /**
   * Narrator selection — addendum §5. Default narrator_a.
   * J1a reserves the field with no UI; J1b adds the 2-card picker.
   */
  narratorSlug: NarratorSlug;

  setActiveTripMode: (mode: TripMode) => void;
  setSelectedCategories: (cats: string[]) => void;
  toggleCategory: (cat: string) => void;
  clearSelectedCategories: () => void;
  setDetail: (d: Detail) => void;
  setNarrativeFocus: (f: NarrativeFocus) => void;
  setNarratorSlug: (n: NarratorSlug) => void;
}

const DEFAULTS = {
  detail:         'full_drive'      as Detail,
  narrativeFocus: 'the_land_speaks' as NarrativeFocus,
  narratorSlug:   'narrator_a'      as NarratorSlug,
};

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      activeTripMode:     'driving',
      selectedCategories: [],
      detail:             DEFAULTS.detail,
      narrativeFocus:     DEFAULTS.narrativeFocus,
      narratorSlug:       DEFAULTS.narratorSlug,

      setActiveTripMode: (mode) => set({ activeTripMode: mode }),

      setSelectedCategories: (cats) => set({ selectedCategories: cats }),

      toggleCategory: (cat) =>
        set((state) => ({
          selectedCategories: state.selectedCategories.includes(cat)
            ? state.selectedCategories.filter((c) => c !== cat)
            : [...state.selectedCategories, cat],
        })),

      clearSelectedCategories: () => set({ selectedCategories: [] }),

      setDetail:         (d) => set({ detail: d }),
      setNarrativeFocus: (f) => set({ narrativeFocus: f }),
      setNarratorSlug:   (n) => set({ narratorSlug: n }),
    }),
    {
      name: 'xroad.tripStore',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeTripMode:     state.activeTripMode,
        selectedCategories: state.selectedCategories,
        detail:             state.detail,
        narrativeFocus:     state.narrativeFocus,
        narratorSlug:       state.narratorSlug,
      }),
      version: 3,
      migrate: (persisted, fromVersion) => {
        // v1 → v2 (J1a, 2026-05-19): pace + narrativeFocus + narratorSlug
        // added. Older blobs fill with the addendum defaults; nothing else
        // moves.
        // v2 → v3 (J1a-followups, 2026-05-19): `pace` field renamed to
        // `detail`. Carry the persisted value forward under the new key;
        // option identifiers (full_drive / light_touch) are unchanged.
        let p = (persisted ?? {}) as Record<string, unknown>;
        if (fromVersion < 2) {
          p = {
            ...p,
            pace:           DEFAULTS.detail,
            narrativeFocus: DEFAULTS.narrativeFocus,
            narratorSlug:   DEFAULTS.narratorSlug,
          };
        }
        if (fromVersion < 3) {
          const { pace, ...rest } = p as { pace?: Detail } & Record<string, unknown>;
          p = { ...rest, detail: pace ?? DEFAULTS.detail };
        }
        return p as unknown as TripState;
      },
    },
  ),
);
