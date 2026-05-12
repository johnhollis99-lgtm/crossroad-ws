import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export type OfflineState = 'cached' | 'stale' | 'offline';

export interface OfflineBadgeProps {
  state:   OfflineState;
  testID?: string;
}

const LABELS: Record<OfflineState, string> = {
  cached:  'Offline · Cached',     // textTransform: uppercase applied via metaSmall
  stale:   'Offline · Stale',
  offline: 'Offline',
};

export function OfflineBadge({ state, testID }: OfflineBadgeProps) {
  const { theme } = useTheme();

  const dotColor =
    state === 'cached'  ? theme.colors.accent2 :
    state === 'stale'   ? theme.colors.inkSoft :
                          theme.colors.accent;

  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        {
          backgroundColor:   theme.colors.ink,
          paddingVertical:   theme.spacing.xs,
          paddingHorizontal: theme.spacing.s,
          borderRadius:      theme.radii.pill,
          gap:               theme.spacing.xs,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[theme.textVariants.metaSmall, { color: theme.colors.paper }]}>
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
