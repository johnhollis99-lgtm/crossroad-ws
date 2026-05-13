import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../design/theme';

export interface FieldNotesDividerProps {
  testID?: string;
}

export function FieldNotesDivider({ testID }: FieldNotesDividerProps) {
  const { theme } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.line, { backgroundColor: theme.colors.line }]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    height: 1,
    width: '100%',
  },
});
