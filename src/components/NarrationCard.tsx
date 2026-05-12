import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';
import { Card } from './Card';
import { Waveform } from './Waveform';

export interface NarrationCardProps {
  kicker:    string;
  title:     string;
  body?:     string;
  /** 0..1; when defined, renders a waveform and a percent timestamp. */
  progress?: number;
  /** Stable seed for the waveform (e.g. POI id). */
  seed?:     string;
  testID?:   string;
}

export function NarrationCard({
  kicker,
  title,
  body,
  progress,
  seed,
  testID,
}: NarrationCardProps) {
  const { theme } = useTheme();
  const hasProgress = typeof progress === 'number';
  const percent = hasProgress ? `${Math.round((progress ?? 0) * 100)}%` : null;

  return (
    <View testID={testID}>
      <Card variant="paper" radius="m" style={{ paddingLeft: theme.spacing.l }}>
        {/* Accent stripe on the left edge. Placed as an absolute child so the
            card's intrinsic border + radius stay intact. */}
        <View
          pointerEvents="none"
          style={[styles.stripe, { backgroundColor: theme.colors.accent }]}
        />
        <View style={styles.topRow}>
          <Text style={[theme.textVariants.metaSmall, { color: theme.colors.inkSoft, flex: 1 }]}>
            {kicker}
          </Text>
          {percent ? (
            <Text style={[theme.textVariants.metaSmall, { color: theme.colors.inkSoft }]}>
              {percent}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            theme.textVariants.button,
            { color: theme.colors.ink, marginTop: theme.spacing.xs },
          ]}
        >
          {title}
        </Text>
        {body ? (
          <Text
            style={[
              theme.textVariants.bodyItalic,
              { color: theme.colors.ink, marginTop: theme.spacing.s },
            ]}
          >
            {body}
          </Text>
        ) : null}
        {hasProgress ? (
          <View style={{ marginTop: theme.spacing.m }}>
            <Waveform progress={progress ?? 0} seed={seed ?? title} />
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stripe: {
    position: 'absolute',
    left:   0,
    top:    0,
    bottom: 0,
    width:  3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
});
