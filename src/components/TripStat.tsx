/**
 * Single-column trip stat — Pine spec section 4.
 *
 * Value 15/700 ink + eyebrow 9.5/700 tracked uppercase inkSoft. Used inside
 * the 3-column stats card on the Trip screen (Remaining / Distance / Next).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export interface TripStatProps {
  label:   string;
  value:   string;
  testID?: string;
}

export function TripStat({ label, value, testID }: TripStatProps) {
  const { theme } = useTheme();
  return (
    <View testID={testID} style={styles.col}>
      <Text
        allowFontScaling={false}
        style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft, fontSize: 9.5 }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          theme.textVariants.label,
          { color: theme.colors.ink, fontSize: 15, marginTop: 4 },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
