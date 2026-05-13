import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
} from 'react-native-svg';
import { useTheme } from '../design/theme';

export type AudienceMarkType = 'family' | 'kids' | 'unfiltered' | 'local';
export type AudienceMarkSize = 48 | 56;
export type AudienceMarkTone = 'ink' | 'paper';

export interface AudienceMarkProps {
  type:    AudienceMarkType;
  size?:   AudienceMarkSize;
  tone?:   AudienceMarkTone;
  /** When true, wrap the glyph in a circle of paperWarm. */
  bg?:     boolean;
  testID?: string;
}

const STROKE = 1.5;
const VIEW = 48;

/* ------------------------------------------------------------------ glyphs */
/* All stubs live in a 48×48 viewBox. Simple line-art primitives only —
 * final artwork swaps in later. */

function FamilyGlyph({ stroke }: { stroke: string }) {
  return (
    <>
      <Path d="M 8 22 L 24 10 L 40 22" stroke={stroke} strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <Rect x={12} y={22} width={24} height={16} stroke={stroke} strokeWidth={STROKE} fill="none" />
      <Rect x={21} y={28} width={6}  height={10} stroke={stroke} strokeWidth={STROKE} fill="none" />
      <Path d="M 32 17 L 32 12 L 36 12 L 36 19" stroke={stroke} strokeWidth={STROKE} fill="none" strokeLinejoin="round" />
      <Path d="M 34 9 Q 38 7 36 4" stroke={stroke} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
      <Path d="M 37 11 Q 42 8 40 5" stroke={stroke} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
    </>
  );
}

function KidsGlyph({ stroke }: { stroke: string }) {
  return (
    <>
      <Path
        d="M 8 38 Q 14 18 32 14 Q 26 32 8 38 Z"
        stroke={stroke}
        strokeWidth={STROKE}
        fill="none"
        strokeLinejoin="round"
      />
      <Path d="M 10 36 L 28 18" stroke={stroke} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
      <Circle cx={32} cy={20} r={10} stroke={stroke} strokeWidth={STROKE} fill="none" />
      <Line x1={40} y1={28} x2={44} y2={32} stroke={stroke} strokeWidth={STROKE + 0.5} strokeLinecap="round" />
    </>
  );
}

function UnfilteredGlyph({ stroke }: { stroke: string }) {
  return (
    <>
      <Line x1={4} y1={26} x2={44} y2={26} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={14} cy={22} r={5} stroke={stroke} strokeWidth={STROKE} fill="none" />
      <Path d="M 10 44 L 22 27"  stroke={stroke} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
      <Path d="M 38 44 L 26 27" stroke={stroke} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
      <Line x1={24} y1={30} x2={24} y2={32} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={24} y1={36} x2={24} y2={38} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={40} y1={22} x2={40} y2={32} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
      <Rect x={34} y={14} width={12} height={8} stroke={stroke} strokeWidth={STROKE} fill="none" />
    </>
  );
}

function LocalGlyph({ stroke }: { stroke: string }) {
  return (
    <>
      <Path
        d="M 6 22 Q 16 18 24 22 Q 32 18 42 22 L 42 38 Q 32 34 24 38 Q 16 34 6 38 Z"
        stroke={stroke}
        strokeWidth={STROKE}
        fill="none"
        strokeLinejoin="round"
      />
      <Line x1={24} y1={22} x2={24} y2={38} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={16} cy={14} r={3.5} stroke={stroke} strokeWidth={STROKE} fill="none" />
      <Circle cx={28} cy={14} r={3.5} stroke={stroke} strokeWidth={STROKE} fill="none" />
      <Line  x1={19.5} y1={14} x2={24.5} y2={14} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
      <Line  x1={13} y1={12.5} x2={11} y2={11} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
      <Line  x1={31} y1={12.5} x2={33} y2={11} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  );
}

/* --------------------------------------------------------------- component */

export function AudienceMark({
  type,
  size = 48,
  tone = 'ink',
  bg,
  testID,
}: AudienceMarkProps) {
  const { theme } = useTheme();
  const stroke  = tone === 'ink' ? theme.colors.ink : theme.colors.paper;
  const bgColor = theme.colors.paperWarm;

  const glyph = (() => {
    switch (type) {
      case 'family':     return <FamilyGlyph     stroke={stroke} />;
      case 'kids':       return <KidsGlyph       stroke={stroke} />;
      case 'unfiltered': return <UnfilteredGlyph stroke={stroke} />;
      case 'local':      return <LocalGlyph      stroke={stroke} />;
    }
  })();

  const wrapStyle = bg
    ? {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      }
    : { width: size, height: size };

  return (
    <View testID={testID} style={[styles.wrap, wrapStyle]}>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        {glyph}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
