/**
 * Xroad theme — composes tokens into light + dark Theme objects, plus a
 * Context-based provider and useTheme() hook.
 *
 * No Restyle. Existing screens use StyleSheet.create() and the new system
 * matches that pattern: components grab whatever they need off the theme
 * object and pass it to their own StyleSheet block, e.g.
 *
 *   const { theme } = useTheme();
 *   const s = StyleSheet.create({
 *     wrap: { backgroundColor: theme.colors.paper, padding: theme.spacing.l },
 *   });
 *
 * Persistence: user's explicit color-scheme override (when not 'system') is
 * stored under AsyncStorage key `xroad.colorScheme`.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TextStyle, ViewStyle } from 'react-native';

import {
  lightColors,
  darkColors,
  textVariants,
  spacing,
  radii,
  elevation,
  fontFamilies,
} from './tokens';
import type { TextVariantName } from './tokens';

// ── Types ─────────────────────────────────────────────────────────────────

export type ColorScheme = 'light' | 'dark';
export type ColorSchemeOverride = ColorScheme | 'system';

// Both schemes must expose the same shape so any themed component can swap.
// Light has no native `card`/`cardEdge` tokens — they alias to paperDeep/rule
// so a component using `theme.colors.card` works in both schemes.
export interface ThemeColors {
  paper:            string;
  paperDeep:        string;
  ink:              string;
  inkSoft:          string;
  rule:             string;
  card:             string;
  cardEdge:         string;
  accent:           string;
  accent2:          string;
  glassTint:        string;
  glassTintInverse: string;
}

export interface Theme {
  scheme:        ColorScheme;
  colors:        ThemeColors;
  spacing:       typeof spacing;
  radii:         typeof radii;
  elevation:     Record<'e1' | 'e2', ViewStyle>;
  textVariants:  Record<TextVariantName, TextStyle>;
  fontFamilies:  typeof fontFamilies;
}

// ── Theme construction ────────────────────────────────────────────────────

export const lightTheme: Theme = {
  scheme: 'light',
  colors: {
    paper:            lightColors.paper,
    paperDeep:        lightColors.paperDeep,
    ink:              lightColors.ink,
    inkSoft:          lightColors.inkSoft,
    rule:             lightColors.rule,
    card:             lightColors.paperDeep,   // light has no separate card token
    cardEdge:         lightColors.rule,        // light card-edge aliases to rule
    accent:           lightColors.accent,
    accent2:          lightColors.accent2,
    glassTint:        lightColors.glassTint,
    glassTintInverse: lightColors.glassTintInverse,
  },
  spacing,
  radii,
  elevation,
  textVariants,
  fontFamilies,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: {
    paper:            darkColors.paper,
    paperDeep:        darkColors.paperDeep,
    ink:              darkColors.ink,
    inkSoft:          darkColors.inkSoft,
    rule:             darkColors.rule,
    card:             darkColors.card,
    cardEdge:         darkColors.cardEdge,
    accent:           darkColors.accent,
    accent2:          darkColors.accent2,
    glassTint:        darkColors.glassTint,
    glassTintInverse: darkColors.glassTintInverse,
  },
  spacing,
  radii,
  elevation,
  textVariants,
  fontFamilies,
};

// ── Context + Provider + hook ─────────────────────────────────────────────

const COLOR_SCHEME_STORAGE_KEY = 'xroad.colorScheme';

interface ThemeContextValue {
  theme:       Theme;
  scheme:      ColorScheme;
  override:    ColorSchemeOverride;          // 'light' | 'dark' | 'system'
  setOverride: (next: ColorSchemeOverride) => void;
}

// Exported so demo screens can pin a subtree to a specific theme (light/dark
// side-by-side previews). Production code should consume via useTheme().
export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();     // 'light' | 'dark' | null
  const [override, setOverrideState] = useState<ColorSchemeOverride>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw === 'light' || raw === 'dark' || raw === 'system') {
          setOverrideState(raw);
        }
      })
      .catch(() => { /* AsyncStorage failure is non-fatal */ })
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  const setOverride = useCallback((next: ColorSchemeOverride) => {
    setOverrideState(next);
    AsyncStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next).catch(() => { /* ignore */ });
  }, []);

  const scheme: ColorScheme = override === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : override;

  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, scheme, override, setOverride }),
    [theme, scheme, override, setOverride],
  );

  // Wait for the persisted override to land before rendering — otherwise we'd
  // flash the wrong scheme for ~1 frame on cold start when a user previously
  // pinned 'dark' on a system-light device (or vice versa).
  if (!hydrated) return null;

  // createElement (not JSX) so this stays a .ts file per the design spec.
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() must be called inside <ThemeProvider>');
  }
  return ctx;
}
