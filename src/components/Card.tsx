import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from '../design/theme';
import type { RadiusName } from '../design/tokens';

export type CardVariant = 'paper' | 'paperWarm' | 'ink' | 'outlined';
export type CardRadius = Extract<RadiusName, 'control' | 'button' | 'card' | 'sheet'>;

export interface CardProps {
  variant?: CardVariant;
  radius?:  CardRadius;
  style?:   ViewStyle;
  children: React.ReactNode;
  testID?:  string;
}

export function Card({
  variant = 'paper',
  radius  = 'card',
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
        borderColor:     theme.colors.paperEdge,
        borderWidth:     1,
      };
    }
    if (variant === 'paperWarm') {
      return {
        backgroundColor: theme.colors.paperWarm,
        borderColor:     theme.colors.paperEdge,
        borderWidth:     1,
      };
    }
    return {
      backgroundColor: theme.colors.paper,
      borderColor:     theme.colors.paperEdge,
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
