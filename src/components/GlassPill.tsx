import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../design/theme';

export interface GlassPillProps {
  /** When true, ink-tinted glass with paper-colored children; default is paper-tinted glass with ink children. */
  dark?:    boolean;
  children: React.ReactNode;
  testID?:  string;
}

// Pine is single-dark — both modes use a dark blur. The `dark` prop chooses
// between two tints over that blur. Pine-paper (#08160F) at alpha for the
// default; Pine-ink (#E8FAEF) at alpha for the inverse.
const TINT_DEFAULT = 'rgba(8,22,15,0.7)';
const TINT_INVERSE = 'rgba(232,250,239,0.6)';

export function GlassPill({ dark, children, testID }: GlassPillProps) {
  const { theme } = useTheme();
  const tintColor   = dark ? TINT_INVERSE : TINT_DEFAULT;
  const borderColor = theme.colors.paperEdge;

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
        tint="dark"
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
