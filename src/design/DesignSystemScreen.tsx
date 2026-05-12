/**
 * Demo screen at the 'design-system' route. Renders one swatch per color and
 * one line per text variant, in both light and dark, side by side. Bypasses
 * useTheme() on purpose so each panel is locked to its theme regardless of
 * the system scheme — that's the comparison view the design check needs.
 *
 * All text on this screen pulls from theme.textVariants. The only inline
 * sizes are the swatch chips and panel padding (structural, not text).
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

import { lightTheme, darkTheme } from './theme';
import type { Theme } from './theme';
import type { TextVariantName } from './tokens';

interface TypeSample {
  key:    TextVariantName;
  label:  string;
  sample: string;
}

const TYPE_SAMPLES: TypeSample[] = [
  { key: 'display',    label: 'display',    sample: 'The Open Road' },
  { key: 'h1',         label: 'h1',         sample: 'Pacific Coast Highway' },
  { key: 'h2',         label: 'h2',         sample: 'Big Sur, California' },
  { key: 'h3',         label: 'h3',         sample: 'Today’s Story' },
  { key: 'body',       label: 'body',       sample: 'Half a mile up the road, the old Mission begins to rise from the dust.' },
  { key: 'bodyItalic', label: 'bodyItalic', sample: 'Approaching Hearst Castle — three minutes out.' },
  { key: 'ui',         label: 'ui',         sample: 'Begin trip' },
  { key: 'uiSmall',    label: 'uiSmall',    sample: 'Next stop in 1.4 mi' },
  { key: 'meta',       label: 'meta',       sample: 'Now playing — 02:14' },
  { key: 'metaSmall',  label: 'metaSmall',  sample: 'Mile 38 · Driving' },
];

const COLOR_KEYS: Array<keyof Theme['colors']> = [
  'paper',
  'paperDeep',
  'ink',
  'inkSoft',
  'rule',
  'card',
  'cardEdge',
  'accent',
  'accent2',
];

function ThemePanel({ theme }: { theme: Theme }) {
  const isLight = theme.scheme === 'light';
  return (
    <View
      style={[
        s.panel,
        {
          backgroundColor: theme.colors.paper,
          padding:         theme.spacing.xl,
          borderRadius:    theme.radii.l,
          borderWidth:     isLight ? 0 : 1,
          borderColor:     theme.colors.cardEdge,
        },
        isLight ? theme.elevation.e2 : null,
      ]}
    >
      <Text style={[theme.textVariants.meta, { color: theme.colors.inkSoft, marginBottom: theme.spacing.m }]}>
        {theme.scheme === 'light' ? 'Light mode' : 'Dark mode'}
      </Text>

      <Text style={[theme.textVariants.h3, { color: theme.colors.ink, marginBottom: theme.spacing.s }]}>
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
                borderBottomColor: theme.colors.rule,
              },
            ]}
          >
            <View
              style={[
                s.swatchChip,
                {
                  backgroundColor: theme.colors[key],
                  borderColor:     theme.colors.rule,
                  borderRadius:    theme.radii.s,
                  marginRight:     theme.spacing.m,
                },
              ]}
            />
            <Text style={[theme.textVariants.ui, { color: theme.colors.ink, flex: 1 }]}>{key}</Text>
            <Text style={[theme.textVariants.metaSmall, { color: theme.colors.inkSoft }]}>
              {theme.colors[key]}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[theme.textVariants.h3, { color: theme.colors.ink, marginBottom: theme.spacing.s }]}>
        Type
      </Text>
      <View>
        {TYPE_SAMPLES.map(({ key, label, sample }) => (
          <View key={key} style={{ marginBottom: theme.spacing.l }}>
            <Text style={[theme.textVariants.metaSmall, { color: theme.colors.inkSoft, marginBottom: theme.spacing.xs }]}>
              {label}
            </Text>
            <Text style={[theme.textVariants[key], { color: theme.colors.ink }]}>
              {sample}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[theme.textVariants.h3, { color: theme.colors.ink, marginTop: theme.spacing.l, marginBottom: theme.spacing.s }]}>
        Accent
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.s }}>
        <View
          style={{
            backgroundColor: theme.colors.accent,
            paddingVertical:   theme.spacing.s,
            paddingHorizontal: theme.spacing.l,
            borderRadius:      theme.radii.pill,
          }}
        >
          <Text style={[theme.textVariants.ui, { color: theme.colors.paper }]}>Begin trip</Text>
        </View>
        <View
          style={{
            backgroundColor: theme.colors.accent2,
            paddingVertical:   theme.spacing.s,
            paddingHorizontal: theme.spacing.l,
            borderRadius:      theme.radii.pill,
          }}
        >
          <Text style={[theme.textVariants.ui, { color: theme.colors.paper }]}>Offline</Text>
        </View>
      </View>
    </View>
  );
}

export default function DesignSystemScreen() {
  const { width } = useWindowDimensions();
  const sideBySide = width >= 720;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: lightTheme.colors.paperDeep }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          padding:       lightTheme.spacing.l,
          flexDirection: sideBySide ? 'row' : 'column',
          gap:           lightTheme.spacing.l,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1 }}>
          <ThemePanel theme={lightTheme} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemePanel theme={darkTheme} />
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
