import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../design/theme';

export interface KickerProps {
  children: React.ReactNode;
  testID?: string;
}

export function Kicker({ children, testID }: KickerProps) {
  const { theme } = useTheme();
  return (
    <Text
      testID={testID}
      style={[theme.textVariants.eyebrow, { color: theme.colors.inkSoft }]}
    >
      {children}
    </Text>
  );
}
