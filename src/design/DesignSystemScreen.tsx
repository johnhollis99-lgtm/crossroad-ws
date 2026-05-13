/**
 * Demo screen at the 'design-system' route. Renders one swatch per color and
 * one line per text variant.
 *
 * Pine is single-dark, so the side-by-side panels compare DEFAULT (cobalt
 * accent) vs CVD-SAFE (amber accent). Every other color is identical between
 * the two panels — only the `accent` token changes.
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pineTheme, pineThemeCvdSafe } from './theme';
import type { Theme } from './theme';
import type { TextVariantName } from './tokens';

interface TypeSample {
  key:    TextVariantName;
  label:  string;
  sample: string;
}

const TYPE_SAMPLES: TypeSample[] = [
  { key: 'display',      label: 'display',      sample: 'The Open Road' },
  { key: 'displaySmall', label: 'displaySmall', sample: '1h 12m · 24 mi' },
  { key: 'title',        label: 'title',        sample: 'XRoad' },
  { key: 'titleSmall',   label: 'titleSmall',   sample: 'Big Sur, California' },
  { key: 'label',        label: 'label',        sample: 'BEGIN TRIP' },
  { key: 'body',         label: 'body',         sample: 'Vasquez Rocks · 12 min visit' },
  { key: 'meta',         label: 'meta',         sample: '24 mi · 3 stops' },
  { key: 'eyebrow',      label: 'eyebrow',      sample: 'Current route' },
];

const COLOR_KEYS: Array<keyof Theme['colors']> = [
  'paper',
  'paperSoft',
  'paperWarm',
  'paperEdge',
  'ink',
  'inkSoft',
  'inkFaint',
  'line',
  'lineSoft',
  'primary',
  'primaryDeep',
  'primaryTint',
  'primaryTintEdge',
  'secondary',
  'secondaryDeep',
  'secondaryTint',
  'secondaryTintEdge',
  'accent',
];

function ThemePanel({ theme, label }: { theme: Theme; label: string }) {
  return (
    <View
      style={[
        s.panel,
        {
          backgroundColor: theme.colors.paper,
          padding:         theme.spacing.xl,
          borderRadius:    theme.radii.card,
          borderWidth:     1,
          borderColor:     theme.colors.paperEdge,
        },
      ]}
    >
      <Text style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft, marginBottom: theme.spacing.m }]}>
        {label}
      </Text>

      <Text style={[theme.textVariants.titleSmall, { color: theme.colors.ink, marginBottom: theme.spacing.s }]}>
        Colors
      </Text>
      <View style={{ marginBottom: theme.spacing['2xl'] }}>
        {COLOR_KEYS.map((key) => (
          <View
            key={key}
            style={[
              s.swatchRow,
              {
                paddingVertical:   theme.spacing.s,
                borderBottomColor: theme.colors.lineSoft,
              },
            ]}
          >
            <View
              style={[
                s.swatchChip,
                {
                  backgroundColor: theme.colors[key],
                  borderColor:     theme.colors.paperEdge,
                  borderRadius:    theme.radii.s,
                  marginRight:     theme.spacing.m,
                },
              ]}
            />
            <Text style={[theme.textVariants.body, { color: theme.colors.ink, flex: 1 }]}>{key}</Text>
            <Text style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft }]}>
              {theme.colors[key]}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[theme.textVariants.titleSmall, { color: theme.colors.ink, marginBottom: theme.spacing.s }]}>
        Type
      </Text>
      <View>
        {TYPE_SAMPLES.map(({ key, label: variantLabel, sample }) => (
          <View key={key} style={{ marginBottom: theme.spacing.l }}>
            <Text style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft, marginBottom: theme.spacing.xs }]}>
              {variantLabel}
            </Text>
            <Text style={[theme.textVariants[key], { color: theme.colors.ink }]}>
              {sample}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[theme.textVariants.titleSmall, { color: theme.colors.ink, marginTop: theme.spacing.l, marginBottom: theme.spacing.s }]}>
        Accent buttons
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
        <View
          style={{
            backgroundColor:   theme.colors.primary,
            paddingVertical:   theme.spacing.s,
            paddingHorizontal: theme.spacing.l,
            borderRadius:      theme.radii.pill,
          }}
        >
          <Text style={[theme.textVariants.label, { color: theme.colors.paperSoft }]}>Drive</Text>
        </View>
        <View
          style={{
            backgroundColor:   theme.colors.secondaryTint,
            borderColor:       theme.colors.secondaryTintEdge,
            borderWidth:       1,
            paddingVertical:   theme.spacing.s,
            paddingHorizontal: theme.spacing.l,
            borderRadius:      theme.radii.pill,
          }}
        >
          <Text style={[theme.textVariants.label, { color: theme.colors.secondary }]}>+ Add stop</Text>
        </View>
        <View
          style={{
            backgroundColor:   theme.colors.primaryTint,
            borderColor:       theme.colors.primaryTintEdge,
            borderWidth:       1,
            paddingVertical:   theme.spacing.s,
            paddingHorizontal: theme.spacing.l,
            borderRadius:      theme.radii.pill,
          }}
        >
          <Text style={[theme.textVariants.label, { color: theme.colors.primaryDeep }]}>★ 4.8</Text>
        </View>
      </View>
    </View>
  );
}

export default function DesignSystemScreen() {
  const { width } = useWindowDimensions();
  const sideBySide = width >= 720;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pineTheme.colors.paperSoft }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          padding:       pineTheme.spacing.l,
          flexDirection: sideBySide ? 'row' : 'column',
          gap:           pineTheme.spacing.l,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1 }}>
          <ThemePanel theme={pineTheme} label="Pine · default (cobalt accent)" />
        </View>
        <View style={{ flex: 1 }}>
          <ThemePanel theme={pineThemeCvdSafe} label="Pine · CVD-safe (amber accent)" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  panel: {
    overflow: 'hidden',
  },
  swatchRow: {
    flexDirection:   'row',
    alignItems:      'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatchChip: {
    width:       28,
    height:      28,
    borderWidth: 1,
  },
});
