/**
 * Narrator picker card — Pine spec section 3.
 *
 * Padding 14, radius 16, column layout with gap 10.
 *
 *   Selected   → primaryTint bg, primary border (2px), primary name color
 *   Unselected → paperSoft bg, paperEdge border, ink name color
 *
 * Avatar circle (34×34) renders with the narrator's avatarColor — caller
 * passes a Pine-coherent hue (emerald / lilac / cobalt / amber per spec's
 * Avatar accent palette).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export interface NarratorCardProps {
  initials:    string;
  avatarColor: string;
  name:        string;
  subtitle:    string;
  selected:    boolean;
  onSelect:    () => void;
  testID?:     string;
}

export function NarratorCard({
  initials,
  avatarColor,
  name,
  subtitle,
  selected,
  onSelect,
  testID,
}: NarratorCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}, ${subtitle}`}
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
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text
          allowFontScaling={false}
          style={[theme.textVariants.label, { color: theme.colors.paperSoft }]}
        >
          {initials}
        </Text>
      </View>
      <Text
        allowFontScaling={false}
        style={[
          theme.textVariants.label,
          { color: selected ? theme.colors.primary : theme.colors.ink, fontSize: 15 },
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          theme.textVariants.meta,
          { color: theme.colors.inkSoft, fontSize: 11.5 },
        ]}
        numberOfLines={1}
      >
        {subtitle}
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
  avatar: {
    width:           34,
    height:          34,
    borderRadius:    17,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    4,
  },
});
