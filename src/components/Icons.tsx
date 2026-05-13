/**
 * XRoad icon library (Pine Phase 2 additions).
 *
 * All icons share a consistent API:
 *   size    — square pixel size (default 24)
 *   color   — primary stroke / mono fill color
 *   accent  — accent fill color (the "duotone" half, per Pine spec section 5)
 *
 * Callers pass theme.colors.ink for color and theme.colors.accent for accent
 * (the CVD-aware token). When `accent` is omitted it falls back to `color`,
 * yielding a mono icon — same fallback pattern as the spec's CSS
 * `var(--ax, currentColor)`.
 *
 * Geometry: 24×24 viewBox, stroke 1.7, round caps + joins per spec.
 */

import React from 'react';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';

export interface IconProps {
  size?:   number;
  color?:  string;
  accent?: string;
}

const STROKE = 1.7;

function ax(color: string | undefined, accent: string | undefined): string {
  // Match spec's `fill: var(--ax, currentColor)` fallback — when no accent
  // is passed, the accent shape paints with the mono color.
  return accent ?? color ?? '#000';
}

export function IconArrowLeft({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 6l-6 6 6 6"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1={8} y1={12} x2={20} y2={12}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconPlay({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="8,5 19,12 8,19"
        fill={ax(color, accent)}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconPause({ size = 24, color = '#000', accent }: IconProps) {
  const fillColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 5h3v14H7zM14 5h3v14h-3z"
        fill={fillColor}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconSkipBack({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="18,5 9,12 18,19"
        fill={ax(color, accent)}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Line
        x1={6.5} y1={5} x2={6.5} y2={19}
        stroke={color}
        strokeWidth={STROKE + 0.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconSkipFwd({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="6,5 15,12 6,19"
        fill={ax(color, accent)}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Line
        x1={17.5} y1={5} x2={17.5} y2={19}
        stroke={color}
        strokeWidth={STROKE + 0.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconVolume({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* speaker body (accent fill) */}
      <Path
        d="M4 9h3l5-4v14l-5-4H4z"
        fill={ax(color, accent)}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* sound waves */}
      <Path
        d="M16 8c1.5 1.2 1.5 6.8 0 8M19 5c3 3 3 11 0 14"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export function IconVolumeOff({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9h3l5-4v14l-5-4H4z"
        fill={ax(color, accent)}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* slash through the speaker */}
      <Line
        x1={16} y1={9} x2={22} y2={15}
        stroke={color}
        strokeWidth={STROKE + 0.3}
        strokeLinecap="round"
      />
      <Line
        x1={22} y1={9} x2={16} y2={15}
        stroke={color}
        strokeWidth={STROKE + 0.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconMic({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* mic capsule (accent fill) */}
      <Path
        d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"
        fill={ax(color, accent)}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* stand / wave */}
      <Path
        d="M5 11a7 7 0 0014 0M12 18v3"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export function IconCar({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12l2-5a2 2 0 012-2h10a2 2 0 012 2l2 5v6H3v-6z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M6 12h12" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* Accent: wheels filled */}
      <Circle cx={7.5}  cy={15.5} r={1.6} fill={accentColor} stroke={color} strokeWidth={STROKE} />
      <Circle cx={16.5} cy={15.5} r={1.6} fill={accentColor} stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function IconHike({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={13} cy={4} r={1.5} stroke={color} strokeWidth={STROKE} fill={accentColor} />
      <Path
        d="M11 22l2-6 -3-3 1-5 -3 2v3"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M14 10l2 2 4-1"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M10 16l-3 6"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

// ── Category icons (chip rail) ───────────────────────────────────────────
// Duotone: primary stroke is `color`; the small filled detail uses `accent`.
// All 24×24 viewBox, stroke 1.7, round caps/joins per Pine spec section 5.

export function IconHistory({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={STROKE} fill="none" />
      <Path d="M12 7v5l3 2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={18.5} cy={5.5} r={1.5} fill={ax(color, accent)} />
    </Svg>
  );
}

export function IconNature({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 19c2-11 9-15 16-15-1 9-6 14-13 14"
        fill={accentColor}
        fillOpacity={0.32}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path d="M5 19c4-7 8-9 13-11" stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <Circle cx={17} cy={6} r={1.4} fill={accentColor} />
    </Svg>
  );
}

export function IconArchitecture({ size = 24, color = '#000', accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 21V9l8-4 8 4v12" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
      <Path d="M4 21h16" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* Accent: doorway fill */}
      <Path d="M10 21v-5a2 2 0 014 0v5" fill={ax(color, accent)} stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
    </Svg>
  );
}

export function IconFood({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* fork */}
      <Path d="M7 3v8a2 2 0 002 2v8" stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <Path d="M5 3v6M9 3v6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* knife */}
      <Path d="M17 3c-2 4-2 8 0 12v6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Accent: dot at fork tip */}
      <Circle cx={7} cy={3} r={1.4} fill={accentColor} />
    </Svg>
  );
}

export function IconMusic({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18V5l11-2v13" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M9 8l11-2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* Both note heads filled */}
      <Circle cx={6.5}  cy={18} r={2.5} fill={accentColor} stroke={color} strokeWidth={STROKE} />
      <Circle cx={17.5} cy={16} r={2.5} fill={accentColor} stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function IconArt({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3c-5 0-9 4-9 9 0 3 2 6 5 6 1.5 0 2-1 2-2 0-1.5 1-2 2-2h3a4 4 0 004-4c0-4-3-7-7-7z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
      />
      {/* Three paint blobs */}
      <Circle cx={8}  cy={9}  r={1.3} fill={accentColor} />
      <Circle cx={13} cy={6}  r={1.3} fill={accentColor} />
      <Circle cx={17} cy={10} r={1.3} fill={accentColor} />
    </Svg>
  );
}

export function IconWeird({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Saucer body */}
      <Path
        d="M4 14c0-2 4-4 8-4s8 2 8 4-4 4-8 4-8-2-8-4z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
      />
      {/* Dome */}
      <Path d="M9 10c0-3 2-5 3-5s3 2 3 5" stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill={accentColor} />
      {/* Beam */}
      <Path d="M12 18v3M9 18l-2 3M15 18l2 3" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function IconRoadside({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21V5" stroke={color} strokeWidth={STROKE + 0.3} strokeLinecap="round" />
      {/* Sign plate */}
      <Path d="M5 6h11l3 3-3 3H5z" fill={accentColor} stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
    </Svg>
  );
}

export function IconFilm({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16v14H4z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
      {/* sprocket holes */}
      <Circle cx={6.5}  cy={8}  r={0.9} fill={accentColor} />
      <Circle cx={6.5}  cy={12} r={0.9} fill={accentColor} />
      <Circle cx={6.5}  cy={16} r={0.9} fill={accentColor} />
      <Circle cx={17.5} cy={8}  r={0.9} fill={accentColor} />
      <Circle cx={17.5} cy={12} r={0.9} fill={accentColor} />
      <Circle cx={17.5} cy={16} r={0.9} fill={accentColor} />
      <Path d="M9 5v14M15 5v14" stroke={color} strokeWidth={STROKE * 0.8} />
    </Svg>
  );
}

export function IconScience({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* flask neck */}
      <Path d="M10 3h4M11 3v5l-5 11a2 2 0 002 3h8a2 2 0 002-3l-5-11V3" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
      {/* liquid */}
      <Path d="M7.5 15h9l2.5 4.5a1 1 0 01-1 1.5H6a1 1 0 01-1-1.5z" fill={accentColor} stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
    </Svg>
  );
}

export function IconClose({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={6} y1={6} x2={18} y2={18} stroke={color} strokeWidth={STROKE + 0.3} strokeLinecap="round" />
      <Line x1={18} y1={6} x2={6} y2={18} stroke={color} strokeWidth={STROKE + 0.3} strokeLinecap="round" />
    </Svg>
  );
}

export function IconSparkle({ size = 24, color = '#000', accent }: IconProps) {
  const accentColor = ax(color, accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* main 4-point star (mono outline) */}
      <Path
        d="M12 4l1.6 5.4 5.4 1.6-5.4 1.6L12 18l-1.6-5.4L5 11l5.4-1.6z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
      />
      {/* accent dot, top-right */}
      <Circle cx={19} cy={6} r={1.6} fill={accentColor} />
      {/* secondary dot, bottom-left */}
      <Circle cx={5}  cy={18} r={1} fill={accentColor} />
    </Svg>
  );
}
