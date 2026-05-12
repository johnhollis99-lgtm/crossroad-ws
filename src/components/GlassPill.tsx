import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../design/theme';

export interface GlassPillProps {
  /** When true, ink-translucent fill with paper children; default is paper-translucent with ink children. */
  dark?:    boolean;
  children: React.ReactNode;
  testID?:  string;
}

export function GlassPill({ dark, children, testID }: GlassPillProps) {
  const { theme } = useTheme();
  const tintColor   = dark ? theme.colors.glassTintInverse : theme.colors.glassTint;
  const borderColor = dark ? theme.colors.cardEdge         : theme.colors.rule;
  const blurTint    = dark ? 'dark' as const               : 'light' as const;

  return (
    <View
      testID={testID}
      style={[
        styles.wrap,
        { borderRadius: theme.radii.pill, borderColor },
      ]}
    >
      <BlurView
        intensity={30}
        tint={blurTint}
        style={[StyleSheet.absoluteFillObject, { borderRadius: theme.radii.pill }]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: tintColor, borderRadius: theme.radii.pill },
        ]}
      />
      <View
        style={[
          styles.inner,
          {
            paddingVertical:   theme.spacing.s,
            paddingHorizontal: theme.spacing.l,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf:    'flex-start',
    overflow:     'hidden',
    borderWidth:  1,
  },
  inner: {
    flexDirection: 'row',
    alignItems:    'center',
  },
});
