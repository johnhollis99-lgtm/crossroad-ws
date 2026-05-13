/**
 * XRoad font loading — Pine type stack.
 *
 *   Instrument Serif  — 400, 400 italic     (display / title)
 *   DM Sans           — 400, 500, 600, 700  (body / label / meta / eyebrow)
 *   JetBrains Mono    — 400, 500            (coords readout in CoordinatesPill)
 *
 * FONT_MAP keys match the family-name strings in tokens.ts.fontFamilies.
 * App.tsx fail-fast gates the navigator until useAppFonts() resolves.
 */

import { useFonts } from 'expo-font';

import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

// Font-family keys aligned with tokens.ts -> fontFamilies. Exposed here so a
// future settings screen (or debug overlay) can introspect what should be
// loaded without re-deriving from textVariants.
export const FONT_KEYS = {
  instrument_serif:        'Instrument Serif',
  instrument_serif_italic: 'Instrument Serif-Italic',
  dm_sans:                 'DM Sans',
  jetbrains_mono:          'JetBrains Mono',
} as const;

const FONT_MAP = {
  'Instrument Serif':         InstrumentSerif_400Regular,
  'Instrument Serif-Italic':  InstrumentSerif_400Regular_Italic,
  'DM Sans':                  DMSans_400Regular,
  'DM Sans-500':              DMSans_500Medium,
  'DM Sans-600':              DMSans_600SemiBold,
  'DM Sans-700':              DMSans_700Bold,
  'JetBrains Mono':           JetBrainsMono_400Regular,
  'JetBrains Mono-500':       JetBrainsMono_500Medium,
};

/**
 * Returns [fontsLoaded, fontError] from expo-font's useFonts(). Call once
 * from App.tsx and gate the render until fontsLoaded is true.
 */
export function useAppFonts(): readonly [boolean, Error | null] {
  return useFonts(FONT_MAP);
}
