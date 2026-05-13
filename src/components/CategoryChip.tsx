/**
 * Toggle chip for category filters. Pine palette + DM Sans label.
 *
 *   Active   → emerald (primary) fill + paperSoft text + primaryDeep border
 *   Inactive → paperSoft fill + ink text + paperEdge border
 *
 * Optional `icon` slot renders before the label (Pine chip rail spec section 3).
 * The caller supplies the icon node — typically a duotone SVG with stroke
 * 1.8 in `theme.colors.ink` and accent shapes in `theme.colors.accent`.
 */

import React from 'react';
import { Pressable, StyleSheet, View, Text } from 'react-native';
import { useTheme } from '../design/theme';

export interface CategoryChipProps {
  label:    string;
  active:   boolean;
  onToggle: () => void;
  /** Optional leading icon (typically a 14×14 duotone SVG). */
  icon?:    React.ReactNode;
  testID?:  string;
}

export function CategoryChip({ label, active, onToggle, icon, testID }: CategoryChipProps) {
  const { theme } = useTheme();

  const fg = active ? theme.colors.paperSoft : theme.colors.ink;
  const bg = active ? theme.colors.primary   : theme.colors.paperSoft;
  const bd = active ? theme.colors.primaryDeep : theme.colors.paperEdge;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderColor:     bd,
        },
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text
        allowFontScaling={false}
        style={[theme.textVariants.body, { color: fg }]}
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
    gap:               6,
    paddingVertical:   6,
    paddingHorizontal: 12,
    borderRadius:      999,
    borderWidth:       1,
  },
  icon: {
    width:  14,
    height: 14,
  },
});
