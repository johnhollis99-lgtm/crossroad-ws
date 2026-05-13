/**
 * Trip-screen stories badge — Pine spec section 4 right chrome.
 *
 * Pill with paperSoft bg, paperEdge border, padding `6px 14px`.
 * Italic-serif numeral 22/400 primary on top, "STORIES" eyebrow 10/700
 * tracked uppercase inkSoft below.
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';
import { shadows } from '../design/tokens';

export interface StoriesBadgeProps {
  count:   number | null | undefined;
  testID?: string;
}

const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : shadows.control;

export function StoriesBadge({ count, testID }: StoriesBadgeProps) {
  const { theme } = useTheme();
  const label = count == null ? '—' : String(count);

  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        PILL_SHADOW,
        {
          backgroundColor: theme.colors.paperSoft,
          borderColor:     theme.colors.paperEdge,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          theme.textVariants.title,
          { color: theme.colors.primary, fontSize: 22, lineHeight: 24, textAlign: 'center' },
        ]}
      >
        {label}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          theme.textVariants.eyebrow,
          { color: theme.colors.inkSoft, marginTop: 1, letterSpacing: 1.6 },
        ]}
      >
        STORIES
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical:   6,
    paddingHorizontal: 14,
    borderRadius:      999,
    borderWidth:       1,
    alignItems:        'center',
    alignSelf:         'flex-end',
  },
});
