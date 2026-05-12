import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from '../design/theme';
import type { RadiusName } from '../design/tokens';

export type CardVariant = 'paper' | 'ink' | 'outlined';
export type CardRadius = Extract<RadiusName, 'm' | 'l'>;

export interface CardProps {
  variant?: CardVariant;
  radius?:  CardRadius;
  style?:   ViewStyle;
  children: React.ReactNode;
  testID?:  string;
}

export function Card({
  variant = 'paper',
  radius  = 'm',
  style,
  children,
  testID,
}: CardProps) {
  const { theme } = useTheme();

  const variantStyle: ViewStyle = (() => {
    if (variant === 'ink') {
      return { backgroundColor: theme.colors.ink };
    }
    if (variant === 'outlined') {
      return {
        backgroundColor: 'transparent',
        borderColor:     theme.colors.rule,
        borderWidth:     1,
      };
    }
    return {
      backgroundColor: theme.scheme === 'dark' ? theme.colors.card : theme.colors.paper,
      borderColor:     theme.colors.rule,
      borderWidth:     1,
    };
  })();

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        { padding: theme.spacing.l, borderRadius: theme.radii[radius] },
        variantStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
