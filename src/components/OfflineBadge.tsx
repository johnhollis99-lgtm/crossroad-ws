import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export type OfflineState = 'cached' | 'stale' | 'offline';

export interface OfflineBadgeProps {
  state:   OfflineState;
  testID?: string;
}

const LABELS: Record<OfflineState, string> = {
  cached:  'Offline · Cached',
  stale:   'Offline · Stale',
  offline: 'Offline',
};

export function OfflineBadge({ state, testID }: OfflineBadgeProps) {
  const { theme } = useTheme();

  // cached → primary (emerald, has audio ready)
  // stale  → inkSoft (audio is old)
  // offline → secondary (cobalt, no network)
  const dotColor =
    state === 'cached' ? theme.colors.primary :
    state === 'stale'  ? theme.colors.inkSoft :
                         theme.colors.secondary;

  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        {
          backgroundColor:   theme.colors.paperWarm,
          paddingVertical:   theme.spacing.xs,
          paddingHorizontal: theme.spacing.s,
          borderRadius:      theme.radii.pill,
          borderColor:       theme.colors.paperEdge,
          borderWidth:       1,
          gap:               theme.spacing.xs,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[theme.textVariants.eyebrow, { color: theme.colors.ink }]}>
        {LABELS[state]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems:    'center',
    alignSelf:     'flex-start',
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
});
