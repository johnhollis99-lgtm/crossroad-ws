import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value:    T;
  onChange: (next: T) => void;
  testID?:  string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const { theme } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.row,
        {
          borderRadius: theme.radii.control,
          padding:      2,
          backgroundColor: 'transparent',
        },
      ]}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-${opt.value}` : undefined}
            style={[
              styles.segment,
              {
                paddingVertical:   theme.spacing.s,
                paddingHorizontal: theme.spacing.m,
                borderRadius:      theme.radii.control - 2,
                backgroundColor:   selected ? theme.colors.paperWarm : 'transparent',
                borderColor:       selected ? theme.colors.paperEdge : theme.colors.line,
                borderWidth:       1,
              },
            ]}
          >
            <Text
              style={[
                selected ? theme.textVariants.label : theme.textVariants.body,
                { color: selected ? theme.colors.ink : theme.colors.inkSoft, textAlign: 'center' },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'stretch',
    gap:           4,
  },
  segment: {
    flex: 1,
    justifyContent: 'center',
    alignItems:     'center',
  },
});
