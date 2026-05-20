/**
 * Option card — single-selectable card with title + sub-copy.
 *
 * Used by trip-setup pickers that have ~2 options and prose sub-copy too
 * long for a SegmentedControl/SegmentedTrio (Narrative Focus, Pace). Lean
 * sibling to NarratorCard — same selection treatment (primaryTint bg +
 * primary 2px border + primary title color), no avatar circle.
 *
 * Caller wraps 2+ in a flex row with gap; the card uses `flex: 1` so the
 * row shares width evenly.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export interface OptionCardProps {
  title:    string;
  sub:      string;
  selected: boolean;
  onSelect: () => void;
  testID?:  string;
}

export function OptionCard({
  title,
  sub,
  selected,
  onSelect,
  testID,
}: OptionCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${sub}`}
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: selected ? theme.colors.primaryTint : theme.colors.paperSoft,
          borderColor:     selected ? theme.colors.primary     : theme.colors.paperEdge,
          borderWidth:     selected ? 2 : 1,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          theme.textVariants.label,
          { color: selected ? theme.colors.primary : theme.colors.ink, fontSize: 15 },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          theme.textVariants.meta,
          { color: theme.colors.inkSoft },
        ]}
        numberOfLines={3}
      >
        {sub}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex:         1,
    padding:      14,
    borderRadius: 16,
    gap:          6,
  },
});

export default OptionCard;
