import React, { useState } from 'react';
import {
  Image,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { C } from '../lib/theme';
import { MAP_STYLES, MapStyleId, buildThumbUrl } from '../lib/mapStyle';

interface Props {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
  mapboxToken: string;
  /** Position from top — panel opens downward (legacy screens) */
  buttonTop?: number;
  /** Position from bottom — panel opens upward (preferred) */
  buttonBottom?: number;
  buttonRight?: number;
  /** Optional trail mode toggle rendered inside the panel */
  trailMode?: boolean;
  onTrailToggle?: (on: boolean) => void;
}

const STYLE_ORDER: MapStyleId[] = ['dark', 'satellite', 'topo', 'standard'];

const THUMB_BG: Record<MapStyleId, string> = {
  dark:      '#1C1E2A',
  satellite: '#1A2E1A',
  topo:      '#4A6B3A',
  standard:  '#D4CEBC',
};

export function MapStylePicker({
  value,
  onChange,
  mapboxToken,
  buttonTop,
  buttonBottom,
  buttonRight = 12,
  trailMode,
  onTrailToggle,
}: Props) {
  const [open, setOpen] = useState(false);

  const useBottom = buttonBottom !== undefined;
  const btnPos = useBottom
    ? { bottom: buttonBottom, right: buttonRight }
    : { top: buttonTop ?? 12, right: buttonRight };
  const panelPos = useBottom
    ? { bottom: buttonBottom! + 48, right: buttonRight }
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

      {/* Floating pill button */}
      <TouchableOpacity
        style={[s.btn, btnPos]}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.8}
      >
        <View style={[s.btnThumbWrap, { backgroundColor: THUMB_BG[value] }]}>
          <Image
            source={{ uri: buildThumbUrl(MAP_STYLES[value].mapboxStyleSlug, mapboxToken) }}
            style={s.btnThumb}
            resizeMode="cover"
          />
        </View>
        <Text style={s.btnLabel}>{MAP_STYLES[value].label}</Text>
      </TouchableOpacity>

      {/* Picker panel */}
      {open && (
        <View style={[s.panel, panelPos]}>
          <Text style={s.panelTitle}>Map style</Text>
          <View style={s.grid}>
            {STYLE_ORDER.map(id => {
              const cfg      = MAP_STYLES[id];
              const selected = id === value;
              return (
                <TouchableOpacity
                  key={id}
                  style={[s.card, selected && s.cardSelected]}
                  onPress={() => { onChange(id); setOpen(false); }}
                  activeOpacity={0.75}
                >
                  <View style={[s.thumbWrap, { backgroundColor: THUMB_BG[id] }]}>
                    <Image
                      source={{ uri: buildThumbUrl(cfg.mapboxStyleSlug, mapboxToken) }}
                      style={s.thumb}
                      resizeMode="cover"
                    />
                    {selected && (
                      <View style={s.checkOverlay}>
                        <Text style={s.checkIcon}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.cardLabel, selected && s.cardLabelSelected]} numberOfLines={1}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {onTrailToggle !== undefined && (
            <>
              <View style={s.separator} />
              <View style={s.trailRow}>
                <Text style={s.trailIcon}>🥾</Text>
                <Text style={s.trailLabel}>Trail mode</Text>
                <Switch
                  value={trailMode ?? false}
                  onValueChange={onTrailToggle}
                  trackColor={{ false: C.BORDER_SUBTLE, true: C.ACCENT_BORDER }}
                  thumbColor={trailMode ? C.ACCENT_TEXT : C.TEXT_TERTIARY}
                />
              </View>
            </>
          )}
        </View>
      )}
    </>
  );
}


const CARD_W = 72;
const THUMB_W = 60;

const s = StyleSheet.create({
  btn: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 13, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(38,26,12,0.97)',
    borderWidth: 1.5, borderColor: C.BORDER_STRONG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  btnLabel: {
    fontSize: 12, fontWeight: '700',
    color: C.TEXT_SECONDARY,
    letterSpacing: 0.2,
  },
  btnThumbWrap: { width: 22, height: 22, borderRadius: 4, overflow: 'hidden' },
  btnThumb:     { width: 22, height: 22 },

  panel: {
    position: 'absolute',
    width: CARD_W * 2 + 8 + 24,
    backgroundColor: 'rgba(38,26,12,0.97)',
    borderRadius: 14,
    borderWidth: 1, borderColor: C.BORDER_SUBTLE,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  panelTitle: {
    fontSize: 10, fontWeight: '700', color: C.TEXT_TERTIARY,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  card: {
    width: CARD_W, borderRadius: 8,
    borderWidth: 1.5, borderColor: C.BORDER_SUBTLE,
    overflow: 'hidden', alignItems: 'center', paddingBottom: 6,
  },
  cardSelected: { borderColor: C.ACCENT_BORDER },

  thumbWrap: { width: THUMB_W, height: THUMB_W, position: 'relative' },
  thumb:     { width: THUMB_W, height: THUMB_W },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(99,153,34,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkIcon: { fontSize: 22, color: C.ACCENT_TEXT, fontWeight: '700' },

  cardLabel:         { marginTop: 4, fontSize: 10, fontWeight: '600', color: C.TEXT_TERTIARY, textAlign: 'center' },
  cardLabelSelected: { color: C.ACCENT_TEXT },

  separator: { height: 1, backgroundColor: C.BORDER_SUBTLE, marginVertical: 10 },
  trailRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trailIcon: { fontSize: 14 },
  trailLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: C.TEXT_SECONDARY },
});
