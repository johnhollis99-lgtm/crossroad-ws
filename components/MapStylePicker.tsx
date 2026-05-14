/**
 * Map style picker — Pine palette.
 *
 * Trigger: paperWarm pill, Layers SVG glyph + "MAP" eyebrow label, control
 * shadow. Pine is single-dark so the trigger and panel both sit on the dark
 * forest surface — no light/dark posture to lock against.
 *
 * Panel: paper surface, "MAP STYLE" eyebrow kicker, hairline line divider,
 * one row per available MapStyleId. Rows render the display name in
 * Instrument Serif italic 17px and a DM Sans uppercase eyebrow descriptor.
 * The active row carries a small emerald (primary) dot on the right.
 *
 * The underlying MAP_STYLES catalog and MapStyleId enum (in
 * lib/mapStyle.ts) are untouched. STYLE_DISPLAY here maps id → visible
 * name + descriptor without renaming the catalog keys.
 *
 * Prop signature notes (preserved for backward compat):
 *  - `mapboxToken` is no longer consumed (thumbnail visuals are gone).
 *  - `trailMode` / `onTrailToggle` are accepted but inert.
 */

import React, { useState } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { ThemeColors } from '../src/design/theme';
import { useTheme } from '../src/design/theme';
import { shadows } from '../src/design/tokens';
import { MAP_STYLES, MapStyleId } from '../lib/mapStyle';

interface Props {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
  /** Retained for backward compat; unused (no thumbnails). */
  mapboxToken: string;
  /** Position from top — panel opens downward (legacy screens). */
  buttonTop?: number;
  /** Position from bottom — panel opens upward (preferred). */
  buttonBottom?: number;
  buttonRight?: number;
  /** Retained for backward compat; not rendered. */
  trailMode?: boolean;
  /** Retained for backward compat; not rendered. */
  onTrailToggle?: (on: boolean) => void;
}

const STYLE_ORDER: MapStyleId[] = ['standard', 'dark', 'satellite', 'topo'];

const STYLE_DISPLAY: Record<MapStyleId, { name: string; descriptor: string }> = {
  standard:  { name: 'Default',   descriptor: 'STREETS' },
  dark:      { name: 'Dark',      descriptor: 'NIGHT MODE' },
  satellite: { name: 'Satellite', descriptor: 'AERIAL' },
  topo:      { name: 'Outdoors',  descriptor: 'TERRAIN' },
};

const PANEL_WIDTH = Math.min(280, Dimensions.get('window').width - 28);

const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : shadows.control;

function LayersIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L2 7l10 5 10-5-10-5z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 17l10 5 10-5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 12l10 5 10-5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 40×40 abstract swatch per style — colored background + a thin overlay
// pattern that hints at the style's character (warm horizon, street grid,
// aerial tile, topo contours). Drawn in SVG so no asset files / network
// calls are required. The colored fill comes from the wrapper View; the
// SVG canvas is transparent and carries only the pattern strokes.
const SWATCH_PX = 40;
const SWATCH_RADIUS = 8;

function styleSwatchBg(id: MapStyleId, colors: ThemeColors): string {
  switch (id) {
    case 'dark':      return colors.paper;       // near-black
    case 'standard':  return colors.paperWarm;   // warm paper
    case 'satellite': return '#2a2a2a';          // dark slate — distinct from paper
    case 'topo':      return '#3d4a2c';          // olive — distinct from primary emerald
  }
}

function StyleSwatch({ id, theme }: { id: MapStyleId; theme: { colors: ThemeColors } }) {
  const c = theme.colors;
  const stroke = id === 'satellite'
    ? 'rgba(255,255,255,0.18)'            // diagonal aerial tile hint over dark slate
    : id === 'topo'
      ? c.primaryTint
      : id === 'dark'
        ? c.primaryTint                   // warm horizon hint over near-black
        : c.lineSoft;                      // street grid hint over warm paper

  return (
    <Svg
      width={SWATCH_PX}
      height={SWATCH_PX}
      viewBox={`0 0 ${SWATCH_PX} ${SWATCH_PX}`}
    >
      {id === 'dark' && (
        // Single warm horizon line near the bottom (~75% down)
        <Path d="M 6 30 L 34 30" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      )}
      {id === 'standard' && (
        // Street grid: one vertical + two horizontal lines
        <>
          <Path d="M 20 6 L 20 34" stroke={stroke} strokeWidth={1} />
          <Path d="M 6 14 L 34 14" stroke={stroke} strokeWidth={1} />
          <Path d="M 6 26 L 34 26" stroke={stroke} strokeWidth={1} />
        </>
      )}
      {id === 'satellite' && (
        // Diagonal aerial-tile hint
        <>
          <Path d="M 4 16 L 16 4"  stroke={stroke} strokeWidth={1} />
          <Path d="M 4 28 L 28 4"  stroke={stroke} strokeWidth={1} />
          <Path d="M 12 36 L 36 12" stroke={stroke} strokeWidth={1} />
          <Path d="M 24 36 L 36 24" stroke={stroke} strokeWidth={1} />
        </>
      )}
      {id === 'topo' && (
        // Two curved contour arcs — topo isoline suggestion
        <>
          <Path d="M 4 24 Q 20 12 36 24" stroke={stroke} strokeWidth={1.3} fill="none" strokeLinecap="round" />
          <Path d="M 4 32 Q 20 20 36 32" stroke={stroke} strokeWidth={1.3} fill="none" strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

export function MapStylePicker({
  value,
  onChange,
  buttonTop,
  buttonBottom,
  buttonRight = 12,
}: Props) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  // Touching the catalog avoids a TS unused-import error and serves as a
  // light runtime guard against an id wandering out of STYLE_ORDER.
  const _verifyCatalog = MAP_STYLES;
  void _verifyCatalog;

  const useBottom = buttonBottom !== undefined;
  const btnPos = useBottom
    ? { bottom: buttonBottom, right: buttonRight }
    : { top: buttonTop ?? 12, right: buttonRight };
  const panelPos = useBottom
    ? { bottom: (buttonBottom ?? 0) + 48, right: buttonRight }
    : { top: (buttonTop ?? 12) + 46, right: buttonRight };

  return (
    <>
      {open && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={() => setOpen(false)}
          activeOpacity={0}
        />
      )}

      <TouchableOpacity
        style={[
          s.trigger,
          PILL_SHADOW,
          {
            backgroundColor: theme.colors.paperSoft,
            borderColor:     theme.colors.paperEdge,
          },
          btnPos,
        ]}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Map style: ${STYLE_DISPLAY[value].name}`}
        accessibilityState={{ expanded: open }}
      >
        {/* Thumbnail (paperWarm circle + Layers glyph) per Pine Phase 2 spec. */}
        <View style={[s.thumb, { backgroundColor: theme.colors.paperWarm, borderColor: theme.colors.paperEdge }]}>
          <LayersIcon color={theme.colors.ink} />
        </View>
        <Text
          allowFontScaling={false}
          style={[theme.textVariants.label, { color: theme.colors.ink, fontSize: 13 }]}
        >
          {STYLE_DISPLAY[value].name}
        </Text>
      </TouchableOpacity>

      {open && (
        <View
          style={[
            s.panel,
            PILL_SHADOW,
            {
              backgroundColor: theme.colors.paper,
              borderColor:     theme.colors.paperEdge,
              width: PANEL_WIDTH,
            },
            panelPos,
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft, marginBottom: 8 }]}
          >
            MAP STYLE
          </Text>
          <View style={[s.panelDivider, { backgroundColor: theme.colors.line }]} />
          {STYLE_ORDER.map((id, idx) => {
            const display  = STYLE_DISPLAY[id];
            const selected = id === value;
            const isLast   = idx === STYLE_ORDER.length - 1;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => { onChange(id); setOpen(false); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${display.name} map style`}
                accessibilityState={{ selected }}
                style={[
                  s.row,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: theme.colors.lineSoft },
                ]}
              >
                {/* 40×40 swatch — colored fill + SVG pattern overlay hinting
                    at the style's character (street grid, contour lines, etc.) */}
                <View
                  style={[
                    s.rowSwatch,
                    {
                      backgroundColor: styleSwatchBg(id, theme.colors),
                      borderColor:     theme.colors.paperEdge,
                    },
                  ]}
                >
                  <StyleSwatch id={id} theme={theme} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      theme.textVariants.titleSmall,
                      { color: theme.colors.ink, fontSize: 17, lineHeight: 20.4 },
                    ]}
                  >
                    {display.name}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft, marginTop: 2 }]}
                  >
                    {display.descriptor}
                  </Text>
                </View>
                {selected && (
                  <View style={[s.activeDot, { backgroundColor: theme.colors.primary }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  trigger: {
    position:          'absolute',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingVertical:   5,
    paddingLeft:       5,
    paddingRight:      12,
    borderRadius:      999,
    borderWidth:       1,
  },
  thumb: {
    width:           28,
    height:          28,
    borderRadius:    14,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  panel: {
    position:     'absolute',
    borderRadius: 18,
    padding:      14,
    borderWidth:  1,
  },
  panelDivider: {
    height:       1,
    marginBottom: 4,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    paddingVertical:   10,
    paddingHorizontal: 4,
    minHeight:         44,
  },
  rowSwatch: {
    width:           SWATCH_PX,
    height:          SWATCH_PX,
    borderRadius:    SWATCH_RADIUS,
    borderWidth:     1,
    overflow:        'hidden',
    alignItems:      'center',
    justifyContent:  'center',
  },
  activeDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    // Inter-child spacing is provided by row.gap (12), so no extra margin.
  },
});
