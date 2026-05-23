import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

/**
 * NarratorMark — two-narrator monogram component.
 *
 * Migration Batch 2 (Track C, 2026-05-22): replaces the prior `AudienceMark`
 * (4-glyph family/kids/unfiltered/local) per addendum §5 collapse to two
 * narrators (`narrator_a` = "W" Window Seat, `narrator_b` = "S" Shotgun).
 * Default treatment is a simple letter monogram (Instrument-Serif italic
 * cap, ink-on-paper or paper-on-ink per tone) so the component composes
 * cleanly into the J1b two-card picker without forcing premature visual
 * direction. Richer iconography (engraved-glyph treatment from drift 5.39's
 * deferred spec) lands in a Batch 3 polish task once Window Seat / Shotgun
 * branding is firm.
 */

export type NarratorMarkType = 'narrator_a' | 'narrator_b';
export type NarratorMarkSize = 48 | 56;
export type NarratorMarkTone = 'ink' | 'paper';

export interface NarratorMarkProps {
  type:    NarratorMarkType;
  size?:   NarratorMarkSize;
  tone?:   NarratorMarkTone;
  /** When true, wrap the glyph in a circle of paperWarm. */
  bg?:     boolean;
  testID?: string;
}

const MONOGRAM: Record<NarratorMarkType, string> = {
  narrator_a: 'W', // Window Seat
  narrator_b: 'S', // Shotgun
};

export function NarratorMark({
  type,
  size = 48,
  tone = 'ink',
  bg,
  testID,
}: NarratorMarkProps) {
  const { theme } = useTheme();
  const fg      = tone === 'ink' ? theme.colors.ink : theme.colors.paper;
  const bgColor = theme.colors.paperWarm;
  // Match the cap-height proportions used by Wordmark sizes m/l/xl (size 48
  // ≈ 30pt, 56 ≈ 36pt). Instrument Serif italic carries the same brand
  // posture as the Wordmark; ramp value reused so weights and metrics agree.
  const fontSize = Math.round(size * 0.62);

  const wrapStyle = bg
    ? {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      }
    : {
        width: size,
        height: size,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      };

  return (
    <View testID={testID} style={[styles.wrap, wrapStyle]}>
      <Text
        style={{
          color: fg,
          fontFamily: theme.fontFamilies.serifItalic,
          fontSize,
          // Cap-height nudge so the letter sits centered in the circle on
          // both iOS and Android — Instrument Serif's metrics put the
          // visual baseline a touch above the geometric center.
          lineHeight: Math.round(size * 0.78),
          textAlign: 'center',
          includeFontPadding: false,
        }}
        accessibilityLabel={type === 'narrator_a' ? 'Narrator A — Window Seat' : 'Narrator B — Shotgun'}
      >
        {MONOGRAM[type]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
