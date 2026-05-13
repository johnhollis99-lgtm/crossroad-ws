/**
 * 3-button segmented control with optional sub-labels.
 *
 *   Selected   → primaryTint bg, primary border, primary label (700)
 *   Unselected → paperWarm bg, paperEdge border, ink label / inkSoft sub
 *
 * Used twice on Customize: Narration depth (with sub-labels) and Density
 * (without). Layout is always 3 equal columns with gap 8.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export interface SegmentedTrioOption<T extends string = string> {
  value: T;
  label: string;
  sub?:  string;
}

export interface SegmentedTrioProps<T extends string = string> {
  options:  ReadonlyArray<SegmentedTrioOption<T>>;
  value:    T;
  onChange: (next: T) => void;
  testID?:  string;
}

export function SegmentedTrio<T extends string = string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedTrioProps<T>) {
  const { theme } = useTheme();

  return (
    <View testID={testID} style={styles.row}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const fg = selected ? theme.colors.primary : theme.colors.ink;
        const sub = selected ? theme.colors.primary : theme.colors.inkSoft;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-${opt.value}` : undefined}
            style={[
              styles.seg,
              {
                paddingVertical:   opt.sub ? 10 : 12,
                borderRadius:      theme.radii.button,
                backgroundColor:   selected ? theme.colors.primaryTint : theme.colors.paperWarm,
                borderColor:       selected ? theme.colors.primary     : theme.colors.paperEdge,
                borderWidth:       selected ? 2                        : 1,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[
                selected ? theme.textVariants.label : theme.textVariants.body,
                { color: fg, textAlign: 'center' },
              ]}
            >
              {opt.label}
            </Text>
            {opt.sub ? (
              <Text
                allowFontScaling={false}
                style={[
                  theme.textVariants.meta,
                  { color: sub, marginTop: 2, textAlign: 'center', fontSize: 11 },
                ]}
              >
                {opt.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap:           8,
  },
  seg: {
    flex:              1,
    minHeight:         48,
    paddingHorizontal: 6,
    alignItems:        'center',
    justifyContent:    'center',
  },
});
