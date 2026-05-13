/**
 * Toggle chip for category filters. Single-chip primitive; the row layout
 * (horizontal scroll, flex-wrap, etc.) is the caller's responsibility.
 *
 * Active chip fills with theme-aware ink-red and shows always-cream italic
 * text. Inactive chip is a theme-aware taupe (paperDeep) chip with an ink
 * outline + ink label — visibly distinct from the paper page background so
 * the OFF state reads as a button rather than blank space. Active text uses
 * lightTheme.colors.paper directly so it stays legible on the accent fill
 * regardless of system theme.
 *
 * No shadow — chips sit on paper screens, not over the map.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { lightTheme, useTheme } from '../design/theme';

export interface CategoryChipProps {
  label:    string;
  active:   boolean;
  onToggle: () => void;
  testID?:  string;
}

export function CategoryChip({ label, active, onToggle, testID }: CategoryChipProps) {
  const { theme } = useTheme();

  const activeFg   = lightTheme.colors.paper;
  const activeBg   = theme.colors.accent;
  const inactiveFg = theme.colors.ink;
  const inactiveBg = theme.colors.paperDeep;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={[
        styles.chip,
        active
          ? { backgroundColor: activeBg,   borderWidth: 0 }
          : { backgroundColor: inactiveBg, borderWidth: 1, borderColor: inactiveFg },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.label,
          {
            color:      active ? activeFg : inactiveFg,
            fontFamily: theme.fontFamilies.serifItalic,
            fontWeight: active ? '600' : '500',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderRadius:      999,
  },
  label: {
    fontSize:  14,
    fontStyle: 'italic',
  },
});
