import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../design/theme';

export interface DangerButtonProps {
  onPress:   () => void;
  label:     string;
  disabled?: boolean;
  testID?:   string;
}

export function DangerButton({ onPress, label, disabled, testID }: DangerButtonProps) {
  const { theme } = useTheme();

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
          backgroundColor:   theme.colors.accent,
          paddingVertical:   theme.spacing.m,
          paddingHorizontal: theme.spacing.l,
          borderRadius:      26,
          opacity:           disabled ? 0.5 : pressed ? 0.88 : 1,
        },
      ]}
    >
      <Text
        style={[
          theme.textVariants.buttonStrong,
          { color: theme.colors.paper, textAlign: 'center' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    justifyContent: 'center',
    alignItems:     'center',
  },
});
