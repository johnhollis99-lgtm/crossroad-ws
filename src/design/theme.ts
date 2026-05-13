/**
 * XRoad theme — Pine (single dark scheme + CVD-safe accent swap).
 *
 * The CVD-safe toggle swaps `theme.colors.accent` from cobalt (`secondary`)
 * to amber (`cvdSafe`). Icons read the accent color via `theme.colors.accent`
 * — the RN port of the spec's `--ax` CSS custom property — so a single
 * toggle paints every icon at once.
 *
 * `secondary` / `secondaryDeep` / `secondaryTint` stay cobalt regardless,
 * so non-icon UI (Add stop pill bg, cobalt-tinted surfaces) is unaffected
 * by CVD mode. That matches the spec — CVD only swaps the icon accent.
 *
 * Persistence: AsyncStorage key `xroad.cvdSafe` ('0' | '1').
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TextStyle, ViewStyle } from 'react-native';

import {
  pineColors,
  textVariants,
  spacing,
  radii,
  shadows,
  fontFamilies,
} from './tokens';
import type { TextVariantName } from './tokens';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ThemeColors {
  paper:             string;
  paperSoft:         string;
  paperWarm:         string;
  paperEdge:         string;

  ink:               string;
  inkSoft:           string;
  inkFaint:          string;

  line:              string;
  lineSoft:          string;

  primary:           string;
  primaryDeep:       string;
  primaryTint:       string;
  primaryTintEdge:   string;

  secondary:         string;
  secondaryDeep:     string;
  secondaryTint:     string;
  secondaryTintEdge: string;

  /** CVD-aware icon accent. Cobalt when CVD-safe is off, amber when on. */
  accent:            string;

  danger:            string;
  dangerDeep:        string;
  dangerTint:        string;
}

export interface Theme {
  colors:        ThemeColors;
  spacing:       typeof spacing;
  radii:         typeof radii;
  shadows:       typeof shadows;
  textVariants:  Record<TextVariantName, TextStyle>;
  fontFamilies:  typeof fontFamilies;
}

// ── Theme construction ────────────────────────────────────────────────────

function buildTheme(opts: { cvdSafe: boolean }): Theme {
  return {
    colors: {
      paper:             pineColors.paper,
      paperSoft:         pineColors.paperSoft,
      paperWarm:         pineColors.paperWarm,
      paperEdge:         pineColors.paperEdge,
      ink:               pineColors.ink,
      inkSoft:           pineColors.inkSoft,
      inkFaint:          pineColors.inkFaint,
      line:              pineColors.line,
      lineSoft:          pineColors.lineSoft,
      primary:           pineColors.primary,
      primaryDeep:       pineColors.primaryDeep,
      primaryTint:       pineColors.primaryTint,
      primaryTintEdge:   pineColors.primaryTintEdge,
      secondary:         pineColors.secondary,
      secondaryDeep:     pineColors.secondaryDeep,
      secondaryTint:     pineColors.secondaryTint,
      secondaryTintEdge: pineColors.secondaryTintEdge,
      accent:            opts.cvdSafe ? pineColors.cvdSafe : pineColors.secondary,
      danger:            pineColors.danger,
      dangerDeep:        pineColors.dangerDeep,
      dangerTint:        pineColors.dangerTint,
    },
    spacing,
    radii,
    shadows,
    textVariants,
    fontFamilies,
  };
}

export const pineTheme:        Theme = buildTheme({ cvdSafe: false });
export const pineThemeCvdSafe: Theme = buildTheme({ cvdSafe: true });

// ── Context + Provider + hook ─────────────────────────────────────────────

const CVD_STORAGE_KEY = 'xroad.cvdSafe';

interface ThemeContextValue {
  theme:      Theme;
  cvdSafe:    boolean;
  setCvdSafe: (next: boolean) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [cvdSafe, setCvdSafeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CVD_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw === '1') setCvdSafeState(true);
      })
      .catch(() => { /* AsyncStorage failure is non-fatal */ })
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  const setCvdSafe = useCallback((next: boolean) => {
    setCvdSafeState(next);
    AsyncStorage.setItem(CVD_STORAGE_KEY, next ? '1' : '0').catch(() => { /* ignore */ });
  }, []);

  const theme = cvdSafe ? pineThemeCvdSafe : pineTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, cvdSafe, setCvdSafe }),
    [theme, cvdSafe, setCvdSafe],
  );

  // Wait for the persisted CVD flag to land before rendering — otherwise
  // we'd flash the wrong accent for ~1 frame on cold start.
  if (!hydrated) return null;

  // createElement (not JSX) so this stays a .ts file.
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() must be called inside <ThemeProvider>');
  }
  return ctx;
}
