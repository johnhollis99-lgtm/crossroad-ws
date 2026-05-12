import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export interface PrimaryButtonProps {
  onPress:   () => void;
  label:     string;
  sublabel?: string;
  /** Right-aligned glyph rendered as text — defaults to '↗' when icon is true. */
  icon?:     boolean | string;
  disabled?: boolean;
  testID?:   string;
}

export function PrimaryButton({
  onPress,
  label,
  sublabel,
  icon,
  disabled,
  testID,
}: PrimaryButtonProps) {
  const { theme } = useTheme();
  const iconGlyph = typeof icon === 'string' ? icon : icon ? '↗' : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor:   theme.colors.ink,
          paddingVertical:   14,
          paddingHorizontal: 16,
          borderRadius:      24,
          opacity:           disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.labels}>
          <Text style={[theme.textVariants.button, { color: theme.colors.paper }]}>
            {label}
          </Text>
          {sublabel ? (
            <Text
              style={[
                theme.textVariants.metaSmall,
                { color: theme.colors.paper, opacity: 0.6, marginTop: 2 },
              ]}
            >
              {sublabel}
            </Text>
          ) : null}
        </View>
        {iconGlyph ? (
          <Text
            style={[
              theme.textVariants.button,
              { color: theme.colors.accent, marginLeft: theme.spacing.s },
            ]}
          >
            {iconGlyph}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  labels: {
    flex: 1,
  },
});
