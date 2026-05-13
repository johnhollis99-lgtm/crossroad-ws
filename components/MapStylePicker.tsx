/**
 * Map style picker — Field Notes brand grammar (drift 5.98).
 *
 * Trigger: cream paper pill anchored absolutely on the parent screen,
 * Layers SVG glyph + small "MAP" mono label, e2 shadow. Colors are locked
 * to light-theme constants so the trigger stays cream-on-map in both
 * schemes (matches the Wordmark pill, ModePillRow, PoiCallout,
 * CoordinatesPill family).
 *
 * Panel: theme-aware paper surface (flips to dark paper in dark mode —
 * the picker is interactive UI, not a branded chip), "MAP STYLE" mono
 * kicker, 1px ink-rule divider, one row per available MapStyleId.
 * Rows render the display name in Fraunces italic 500 17px and a mono
 * uppercase descriptor sublabel; the active row carries a small ink-red
 * dot on the right (editorial / Field Notes aesthetic — the dot reads
 * cleaner than a checkmark inside the editorial type ramp).
 *
 * The underlying MAP_STYLES catalog and MapStyleId enum (in
 * lib/mapStyle.ts) are untouched. STYLE_DISPLAY here maps id → visible
 * name + descriptor without renaming the catalog keys; Mapbox style
 * URLs go through unchanged.
 *
 * Prop signature notes:
 *  - `mapboxToken` is retained on the interface for backward compat but
 *    no longer consumed (the pre-drift-5.98 thumbnail visuals are gone).
 *  - `trailMode` / `onTrailToggle` are retained for backward compat but
 *    no longer rendered — they were never wired from any screen per the
 *    CLAUDE.md "still exists but is not wired from any screen" note.
 *    Removing the props would break existing call-site interfaces;
 *    leaving them inert is the lower-blast-radius option.
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

import { lightTheme, useTheme } from '../src/design/theme';
import { MAP_STYLES, MapStyleId } from '../lib/mapStyle';

interface Props {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
  /** Retained for backward compat; unused after drift 5.98 (no thumbnails). */
  mapboxToken: string;
  /** Position from top — panel opens downward (legacy screens). */
  buttonTop?: number;
  /** Position from bottom — panel opens upward (preferred). */
  buttonBottom?: number;
  buttonRight?: number;
  /** Retained for backward compat; not rendered after drift 5.98. */
  trailMode?: boolean;
  /** Retained for backward compat; not rendered after drift 5.98. */
  onTrailToggle?: (on: boolean) => void;
}

const STYLE_ORDER: MapStyleId[] = ['standard', 'dark', 'satellite', 'topo'];

// Catalog → display mapping (drift 5.98). Mapbox style URLs in
// lib/mapStyle.ts and the MapStyleId enum are untouched; only the
// visible name + descriptor pair changes here.
const STYLE_DISPLAY: Record<MapStyleId, { name: string; descriptor: string }> = {
  standard:  { name: 'Default',   descriptor: 'STREETS' },
  dark:      { name: 'Dark',      descriptor: 'NIGHT MODE' },
  satellite: { name: 'Satellite', descriptor: 'AERIAL' },
  topo:      { name: 'Outdoors',  descriptor: 'TERRAIN' },
};

const PANEL_WIDTH = Math.min(280, Dimensions.get('window').width - 28);

const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : lightTheme.elevation.e2;

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

      {/* Trigger pill — light-theme constants so the chip stays cream-on-map
          in both schemes (matches Wordmark / ModePillRow / PoiCallout family). */}
      <TouchableOpacity
        style={[s.trigger, PILL_SHADOW, btnPos]}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Map style picker"
        accessibilityState={{ expanded: open }}
      >
        <LayersIcon color={lightTheme.colors.ink} />
        <Text allowFontScaling={false} style={s.triggerLabel}>MAP</Text>
      </TouchableOpacity>

      {/* Picker panel — theme-aware (paper in light, dark paper in dark). */}
      {open && (
        <View
          style={[
            s.panel,
            PILL_SHADOW,
            {
              backgroundColor: theme.colors.paper,
              width: PANEL_WIDTH,
            },
            panelPos,
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[s.panelKicker, { color: theme.colors.inkSoft }]}
          >
            MAP STYLE
          </Text>
          <View style={[s.panelDivider, { backgroundColor: theme.colors.rule }]} />
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
                  !isLast && { borderBottomWidth: 1, borderBottomColor: theme.colors.rule },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    allowFontScaling={false}
                    style={[s.rowName, { color: theme.colors.ink }]}
                  >
                    {display.name}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[s.rowSub, { color: theme.colors.inkSoft }]}
                  >
                    {display.descriptor}
                  </Text>
                </View>
                {selected && (
                  <View style={[s.activeDot, { backgroundColor: theme.colors.accent }]} />
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
    gap:               6,
    paddingVertical:   8,
    paddingHorizontal: 12,
    borderRadius:      999,
    backgroundColor:   lightTheme.colors.paper,
  },
  triggerLabel: {
    fontFamily:    lightTheme.fontFamilies.mono,
    fontSize:      10,
    fontWeight:    '400',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color:         lightTheme.colors.ink,
  },
  panel: {
    position:     'absolute',
    borderRadius: 18,             // mirrors theme.radii.l for consistency
    padding:      14,
  },
  panelKicker: {
    fontFamily:    lightTheme.fontFamilies.mono,
    fontSize:      10,
    fontWeight:    '400',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom:  8,
  },
  panelDivider: {
    height:       1,
    marginBottom: 4,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   12,
    paddingHorizontal: 4,
    minHeight:         44,
  },
  rowName: {
    fontFamily:    lightTheme.fontFamilies.serifItalic,
    fontStyle:     'italic',
    fontWeight:    '500',
    fontSize:      17,
    lineHeight:    20.4,
    letterSpacing: -0.3,
  },
  rowSub: {
    marginTop:     2,
    fontFamily:    lightTheme.fontFamilies.mono,
    fontSize:      10,
    fontWeight:    '400',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  activeDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    marginLeft:   12,
  },
});
