/**
 * Demo screen at route 'components-demo'. Renders every component from the
 * library with all variants, in light and dark side-by-side.
 *
 * Each panel pins its subtree to a specific theme via ThemeContext.Provider
 * so components that call useTheme() internally still resolve correctly.
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeContext, lightTheme, darkTheme } from '../design/theme';
import type { Theme } from '../design/theme';

import {
  AudienceMark,
  Card,
  DangerButton,
  FieldNotesDivider,
  GlassPill,
  Kicker,
  NarrationCard,
  OfflineBadge,
  PrimaryButton,
  SegmentedControl,
  Waveform,
  Wordmark,
} from './index';
import type { SegmentOption } from './SegmentedControl';

type Depth = 'glance' | 'ride' | 'deep';
const DEPTH_OPTIONS: ReadonlyArray<SegmentOption<Depth>> = [
  { value: 'glance', label: 'Glance' },
  { value: 'ride',   label: 'Ride along' },
  { value: 'deep',   label: 'Deep dive' },
];

/* ----------------------------------------- one panel, pinned to one theme */

function Panel({ theme }: { theme: Theme }) {
  const [depth, setDepth] = useState<Depth>('ride');
  const [progress, setProgress] = useState(0.42);

  // Pinned ThemeContext value — override + setOverride are noops because no
  // user interaction in this view changes the scheme; the panel itself is
  // hard-locked to its theme for the side-by-side comparison.
  const ctxValue = useMemo(
    () => ({
      theme,
      scheme: theme.scheme,
      override: theme.scheme,
      setOverride: () => { /* pinned panel */ },
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={ctxValue}>
      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.colors.paper,
            borderRadius:    theme.radii.l,
            padding:         theme.spacing.l,
            borderWidth:     theme.scheme === 'dark' ? 1 : 0,
            borderColor:     theme.colors.cardEdge,
          },
          theme.scheme === 'light' ? theme.elevation.e2 : null,
        ]}
      >
        <Kicker>{theme.scheme === 'light' ? 'Light mode' : 'Dark mode'}</Kicker>

        <Section title="Wordmark" theme={theme}>
          <View style={{ alignItems: 'center', gap: theme.spacing.l }}>
            <Wordmark size="m" tone="ink" />
            <Wordmark size="l" tone="ink" />
            <Wordmark size="xl" tone="ink" />
          </View>
          <View
            style={{
              marginTop: theme.spacing.m,
              padding:   theme.spacing.m,
              backgroundColor: theme.colors.ink,
              borderRadius: theme.radii.m,
              alignItems: 'center',
            }}
          >
            <Wordmark size="l" tone="paper" />
          </View>
          {/* Paper-pill variant — branded chip for map overlays. Pill stays
              cream + ink-red regardless of system theme so it reads against
              any map style. */}
          <View
            style={{
              marginTop: theme.spacing.m,
              padding:   theme.spacing.m,
              alignItems: 'center',
              gap:        theme.spacing.l,
            }}
          >
            <Wordmark size="m"  background="pill" />
            <Wordmark size="l"  background="pill" />
            <Wordmark size="xl" background="pill" />
          </View>
        </Section>

        <Section title="Kicker" theme={theme}>
          <Kicker>Now playing · Mile 38</Kicker>
        </Section>

        <Section title="Card" theme={theme}>
          <View style={{ gap: theme.spacing.s }}>
            <Card variant="paper" radius="m">
              <Text style={[theme.textVariants.body, { color: theme.colors.ink }]}>
                Paper card · radius m
              </Text>
            </Card>
            <Card variant="ink" radius="l">
              <Text style={[theme.textVariants.body, { color: theme.colors.paper }]}>
                Ink card · radius l
              </Text>
            </Card>
            <Card variant="outlined" radius="m">
              <Text style={[theme.textVariants.body, { color: theme.colors.ink }]}>
                Outlined card
              </Text>
            </Card>
          </View>
        </Section>

        <Section title="SegmentedControl" theme={theme}>
          <SegmentedControl options={DEPTH_OPTIONS} value={depth} onChange={setDepth} testID="demo-segments" />
        </Section>

        <Section title="PrimaryButton" theme={theme}>
          <View style={{ gap: theme.spacing.s }}>
            <PrimaryButton
              label="Begin trip"
              onPress={() => { /* demo */ }}
              testID="demo-primary"
            />
            <PrimaryButton
              label="Begin trip"
              sublabel="Pacific Coast Highway · 6h 12m"
              icon
              onPress={() => { /* demo */ }}
            />
          </View>
        </Section>

        <Section title="DangerButton" theme={theme}>
          <DangerButton label="End trip" onPress={() => { /* demo */ }} testID="demo-danger" />
        </Section>

        <Section title="AudienceMark" theme={theme}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.m }}>
            <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <AudienceMark type="family" />
              <Kicker>Family</Kicker>
            </View>
            <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <AudienceMark type="kids" />
              <Kicker>Kids</Kicker>
            </View>
            <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <AudienceMark type="unfiltered" />
              <Kicker>Unfiltered</Kicker>
            </View>
            <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <AudienceMark type="local" />
              <Kicker>Local</Kicker>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.m, marginTop: theme.spacing.m }}>
            <AudienceMark type="family"     size={56} bg />
            <AudienceMark type="kids"       size={56} bg />
            <AudienceMark type="unfiltered" size={56} bg />
            <AudienceMark type="local"      size={56} bg />
          </View>
        </Section>

        <Section title="GlassPill" theme={theme}>
          <View style={{ gap: theme.spacing.s, alignItems: 'flex-start' }}>
            <GlassPill>
              <Text style={[theme.textVariants.ui, { color: theme.colors.ink }]}>
                Paper-translucent
              </Text>
            </GlassPill>
            <GlassPill dark>
              <Text style={[theme.textVariants.ui, { color: theme.colors.paper }]}>
                Ink-translucent
              </Text>
            </GlassPill>
          </View>
        </Section>

        <Section title="OfflineBadge" theme={theme}>
          <View style={{ gap: theme.spacing.s, alignItems: 'flex-start' }}>
            <OfflineBadge state="cached" />
            <OfflineBadge state="stale" />
            <OfflineBadge state="offline" />
          </View>
        </Section>

        <Section title="NarrationCard" theme={theme}>
          <View style={{ gap: theme.spacing.s }}>
            <NarrationCard
              kicker="Up next · Mile 39"
              title="Hearst Castle, built on a hill above the sea."
            />
            <NarrationCard
              kicker="Now playing"
              title="Half a mile up the road, the old Mission begins."
              body="William Randolph Hearst broke ground in 1919 and never quite stopped building."
              progress={progress}
              seed="demo-poi-1234"
            />
          </View>
          <PrimaryButton
            label="Advance progress"
            onPress={() => setProgress((p) => (p >= 0.95 ? 0 : p + 0.1))}
          />
        </Section>

        <Section title="Waveform" theme={theme}>
          <View style={{ gap: theme.spacing.s }}>
            <Waveform progress={0.0}  seed="wf-1" />
            <Waveform progress={0.33} seed="wf-1" />
            <Waveform progress={0.66} seed="wf-1" />
            <Waveform progress={1.0}  seed="wf-1" />
          </View>
        </Section>

        <Section title="FieldNotesDivider" theme={theme}>
          <Text style={[theme.textVariants.ui, { color: theme.colors.ink }]}>Above</Text>
          <FieldNotesDivider />
          <Text style={[theme.textVariants.ui, { color: theme.colors.ink }]}>Below</Text>
        </Section>
      </View>
    </ThemeContext.Provider>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title:    string;
  theme:    Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: theme.spacing.l }}>
      <Text style={[theme.textVariants.h3, { color: theme.colors.ink, marginBottom: theme.spacing.s }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/* ---------------------------------------------------------------- screen */

export default function ComponentsDemoScreen() {
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
          <Panel theme={lightTheme} />
        </View>
        <View style={{ flex: 1 }}>
          <Panel theme={darkTheme} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
  },
});
