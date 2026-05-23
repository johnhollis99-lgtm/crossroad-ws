/**
 * Demo screen at route 'components-demo'. Renders every component from the
 * library with all variants.
 *
 * Pine is single-dark, so this is a single-panel screen (no side-by-side).
 * A toggle at the top flips the CVD-safe flag so reviewers can see icon
 * accent swap (cobalt → amber) without leaving the screen.
 */

import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, pineTheme } from '../design/theme';

import {
  Card,
  CategoryChip,
  DangerButton,
  FieldNotesDivider,
  GlassPill,
  Kicker,
  ModePillRow,
  NarrationCard,
  NarratorMark,
  OfflineBadge,
  PrimaryButton,
  SegmentedControl,
  Waveform,
  Wordmark,
} from './index';
import type { SegmentOption } from './SegmentedControl';
import type { ModePillValue } from './ModePillRow';

type Depth = 'glance' | 'ride' | 'deep';
const DEPTH_OPTIONS: ReadonlyArray<SegmentOption<Depth>> = [
  { value: 'glance', label: 'Glance' },
  { value: 'ride',   label: 'Ride along' },
  { value: 'deep',   label: 'Deep dive' },
];

function CvdToggle() {
  const { cvdSafe, setCvdSafe, theme } = useTheme();
  return (
    <Pressable
      onPress={() => setCvdSafe(!cvdSafe)}
      accessibilityRole="switch"
      accessibilityState={{ checked: cvdSafe }}
      style={{
        flexDirection:     'row',
        alignItems:        'center',
        gap:               8,
        paddingVertical:   8,
        paddingHorizontal: 14,
        borderRadius:      999,
        backgroundColor:   theme.colors.paperWarm,
        borderColor:       theme.colors.paperEdge,
        borderWidth:       1,
        alignSelf:         'flex-start',
        marginBottom:      theme.spacing.l,
      }}
    >
      <View
        style={{
          width:        10,
          height:       10,
          borderRadius: 5,
          backgroundColor: theme.colors.accent,
        }}
      />
      <Text style={[theme.textVariants.label, { color: theme.colors.ink }]}>
        CVD-safe: {cvdSafe ? 'ON' : 'OFF'}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  children,
}: {
  title:    string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: theme.spacing.l }}>
      <Text style={[theme.textVariants.titleSmall, { color: theme.colors.ink, marginBottom: theme.spacing.s }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Panel() {
  const { theme } = useTheme();
  const [depth, setDepth]       = useState<Depth>('ride');
  const [mode, setMode]         = useState<ModePillValue>('driving');
  const [progress, setProgress] = useState(0.42);
  const [cat1, setCat1]         = useState(true);
  const [cat2, setCat2]         = useState(false);
  const [cat3, setCat3]         = useState(false);

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.colors.paper,
          borderRadius:    theme.radii.card,
          padding:         theme.spacing.l,
          borderWidth:     1,
          borderColor:     theme.colors.paperEdge,
        },
      ]}
    >
      <CvdToggle />

      <Section title="Wordmark">
        <View style={{ alignItems: 'flex-start', gap: theme.spacing.l }}>
          <Wordmark size="m"  tone="ink" />
          <Wordmark size="l"  tone="ink" />
          <Wordmark size="xl" tone="ink" />
        </View>
        <View
          style={{
            marginTop: theme.spacing.m,
            padding:   theme.spacing.m,
            backgroundColor: theme.colors.primary,
            borderRadius: theme.radii.card,
            alignItems: 'flex-start',
          }}
        >
          <Wordmark size="l" tone="paper" />
        </View>
        <View
          style={{
            marginTop:    theme.spacing.m,
            alignItems:   'flex-start',
            gap:          theme.spacing.s,
          }}
        >
          <Wordmark size="m"  background="pill" />
          <Wordmark size="l"  background="pill" />
        </View>
      </Section>

      <Section title="Kicker / Eyebrow">
        <Kicker>Now playing · Mile 38</Kicker>
      </Section>

      <Section title="ModePillRow">
        <ModePillRow value={mode} onChange={setMode} />
      </Section>

      <Section title="CategoryChip">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <CategoryChip label="History"      active={cat1} onToggle={() => setCat1(!cat1)} />
          <CategoryChip label="Nature"       active={cat2} onToggle={() => setCat2(!cat2)} />
          <CategoryChip label="Architecture" active={cat3} onToggle={() => setCat3(!cat3)} />
        </View>
      </Section>

      <Section title="Card">
        <View style={{ gap: theme.spacing.s }}>
          <Card variant="paper" radius="card">
            <Text style={[theme.textVariants.body, { color: theme.colors.ink }]}>
              Paper card · radius card
            </Text>
          </Card>
          <Card variant="paperWarm" radius="card">
            <Text style={[theme.textVariants.body, { color: theme.colors.ink }]}>
              PaperWarm card
            </Text>
          </Card>
          <Card variant="outlined" radius="control">
            <Text style={[theme.textVariants.body, { color: theme.colors.ink }]}>
              Outlined card
            </Text>
          </Card>
        </View>
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl options={DEPTH_OPTIONS} value={depth} onChange={setDepth} testID="demo-segments" />
      </Section>

      <Section title="PrimaryButton">
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

      <Section title="DangerButton">
        <DangerButton label="End trip" onPress={() => { /* demo */ }} testID="demo-danger" />
      </Section>

      <Section title="NarratorMark">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.m }}>
          <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
            <NarratorMark type="narrator_a" />
            <Kicker>Window Seat</Kicker>
          </View>
          <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
            <NarratorMark type="narrator_b" />
            <Kicker>Shotgun</Kicker>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.m, marginTop: theme.spacing.m }}>
          <NarratorMark type="narrator_a" size={56} bg />
          <NarratorMark type="narrator_b" size={56} bg />
        </View>
      </Section>

      <Section title="GlassPill">
        <View style={{ gap: theme.spacing.s, alignItems: 'flex-start' }}>
          <GlassPill>
            <Text style={[theme.textVariants.label, { color: theme.colors.ink }]}>
              Paper-tinted glass
            </Text>
          </GlassPill>
          <GlassPill dark>
            <Text style={[theme.textVariants.label, { color: theme.colors.paper }]}>
              Ink-tinted glass
            </Text>
          </GlassPill>
        </View>
      </Section>

      <Section title="OfflineBadge">
        <View style={{ gap: theme.spacing.s, alignItems: 'flex-start' }}>
          <OfflineBadge state="cached" />
          <OfflineBadge state="stale" />
          <OfflineBadge state="offline" />
        </View>
      </Section>

      <Section title="NarrationCard">
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
        <View style={{ marginTop: theme.spacing.s }}>
          <PrimaryButton
            label="Advance progress"
            onPress={() => setProgress((p) => (p >= 0.95 ? 0 : p + 0.1))}
          />
        </View>
      </Section>

      <Section title="Waveform">
        <View style={{ gap: theme.spacing.s }}>
          <Waveform progress={0.0}  seed="wf-1" />
          <Waveform progress={0.33} seed="wf-1" />
          <Waveform progress={0.66} seed="wf-1" />
          <Waveform progress={1.0}  seed="wf-1" />
        </View>
      </Section>

      <Section title="FieldNotesDivider">
        <Text style={[theme.textVariants.body, { color: theme.colors.ink }]}>Above</Text>
        <FieldNotesDivider />
        <Text style={[theme.textVariants.body, { color: theme.colors.ink }]}>Below</Text>
      </Section>
    </View>
  );
}

export default function ComponentsDemoScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pineTheme.colors.paperSoft }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: pineTheme.spacing.l }}
        showsVerticalScrollIndicator={false}
      >
        <Panel />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
  },
});
