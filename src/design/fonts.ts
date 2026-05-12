/**
 * Xroad font loading — wires expo-font's useFonts() against the three
 * @expo-google-fonts asset packages used by the type ramp:
 *
 *   Fraunces        — 400, 400 italic, 500, 500 italic, 600
 *   Inter Tight     — 400, 500, 600
 *   JetBrains Mono  — 400, 500
 *
 * FONT_MAP keys match the family names referenced in src/design/tokens.ts so
 * `fontFamily: 'Fraunces'` etc. resolve to the registered face. On iOS, the
 * family-only keys ('Fraunces', 'Inter Tight', 'JetBrains Mono') resolve via
 * fontWeight against the per-weight keys; on Android, RN may need the
 * per-weight keys referenced directly from textVariants — adjust tokens.ts
 * if Android renders the wrong weight.
 */

import { useFonts } from 'expo-font';

import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
} from '@expo-google-fonts/inter-tight';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

// Font-family keys aligned with tokens.ts -> fontFamilies. Exposed here so a
// future settings screen (or a debug overlay) can introspect what should be
// loaded without re-deriving from textVariants.
export const FONT_KEYS = {
  fraunces:        'Fraunces',
  fraunces_italic: 'Fraunces-Italic',
  inter_tight:     'Inter Tight',
  jetbrains_mono:  'JetBrains Mono',
} as const;

const FONT_MAP = {
  'Fraunces':              Fraunces_400Regular,
  'Fraunces-Italic':       Fraunces_400Regular_Italic,
  'Fraunces-500':          Fraunces_500Medium,
  'Fraunces-500i':         Fraunces_500Medium_Italic,
  'Fraunces-600':          Fraunces_600SemiBold,
  'Inter Tight':           InterTight_400Regular,
  'Inter Tight-500':       InterTight_500Medium,
  'Inter Tight-600':       InterTight_600SemiBold,
  'JetBrains Mono':        JetBrainsMono_400Regular,
  'JetBrains Mono-500':    JetBrainsMono_500Medium,
};

/**
 * Returns [fontsLoaded, fontError] from expo-font's useFonts(). Call once
 * from App.tsx and gate the render until fontsLoaded is true.
 */
export function useAppFonts(): readonly [boolean, Error | null] {
  return useFonts(FONT_MAP);
}
