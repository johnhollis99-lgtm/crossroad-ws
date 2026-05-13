/**
 * XRoad — session-level trip preferences store
 *
 * Zustand + persist middleware (AsyncStorage) for cross-screen state that
 * needs to survive navigation and app restart but is NOT bound to a specific
 * saved trip record. Per-trip settings (density, min_relevance, depth,
 * category_filter) live on the `trips` table; session-level settings
 * (activeTripMode, selectedCategories) live here.
 *
 * Convention (per session handoff): every screen that reads cross-screen
 * trip state should consume via `useTripStore`, not via navigation params,
 * AsyncStorage directly, or React Context. Navigation params remain the
 * right channel for one-shot navigation payloads (route polyline, saved
 * trip id, etc.).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TripMode = 'driving' | 'hiking';

interface TripState {
  /** Drive vs Hike toggle on home; persists across nav and restart. */
  activeTripMode: TripMode;
  /** Category chip selection shared between home and customize. */
  selectedCategories: string[];

  setActiveTripMode: (mode: TripMode) => void;
  setSelectedCategories: (cats: string[]) => void;
  toggleCategory: (cat: string) => void;
  clearSelectedCategories: () => void;
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      activeTripMode: 'driving',
      selectedCategories: [],

      setActiveTripMode: (mode) => set({ activeTripMode: mode }),

      setSelectedCategories: (cats) => set({ selectedCategories: cats }),

      toggleCategory: (cat) =>
        set((state) => ({
          selectedCategories: state.selectedCategories.includes(cat)
            ? state.selectedCategories.filter((c) => c !== cat)
            : [...state.selectedCategories, cat],
        })),

      clearSelectedCategories: () => set({ selectedCategories: [] }),
    }),
    {
      name: 'xroad.tripStore',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeTripMode: state.activeTripMode,
        selectedCategories: state.selectedCategories,
      }),
      version: 1,
    },
  ),
);
