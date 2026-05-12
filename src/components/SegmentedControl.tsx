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
  const radius = 11;

  return (
    <View
      testID={testID}
      style={[
        styles.row,
        {
          borderRadius: radius,
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
                borderRadius:      radius - 2,
                backgroundColor:   selected ? theme.colors.ink : 'transparent',
                borderColor:       selected ? theme.colors.ink : theme.colors.rule,
                borderWidth:       1,
              },
            ]}
          >
            <Text
              style={[
                theme.textVariants.ui,
                { color: selected ? theme.colors.paper : theme.colors.ink, textAlign: 'center' },
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
