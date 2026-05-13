/**
 * Trip-screen persona pill — Pine spec section 4 left chrome.
 *
 * Single paperSoft pill, 1px paperEdge border, padding `6px 16px 6px 6px`.
 * Contains:
 *   - 28×28 transparent back button (IconArrowLeft)
 *   - 28×28 avatar circle (filled with narrator's persona color) + initials
 *   - narrator name 14/700 ink
 *
 * Tapping the back arrow triggers onBack (caller returns to Customize).
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/theme';
import { shadows } from '../design/tokens';
import { IconArrowLeft } from './Icons';

export interface PersonaPillProps {
  initials:    string;
  avatarColor: string;
  name:        string;
  onBack:      () => void;
  testID?:     string;
}

const PILL_SHADOW = Platform.OS === 'android'
  ? ({ elevation: 4 } as const)
  : shadows.control;

export function PersonaPill({
  initials,
  avatarColor,
  name,
  onBack,
  testID,
}: PersonaPillProps) {
  const { theme } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        PILL_SHADOW,
        {
          backgroundColor: theme.colors.paperSoft,
          borderColor:     theme.colors.paperEdge,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={styles.backBtn}
      >
        <IconArrowLeft size={20} color={theme.colors.ink} />
      </Pressable>

      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text
          allowFontScaling={false}
          style={[theme.textVariants.label, { color: theme.colors.paperSoft, fontSize: 12 }]}
        >
          {initials}
        </Text>
      </View>

      <Text
        allowFontScaling={false}
        style={[theme.textVariants.label, { color: theme.colors.ink }]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingTop:     6,
    paddingBottom:  6,
    paddingLeft:    6,
    paddingRight:   16,
    borderRadius:   999,
    borderWidth:    1,
    alignSelf:      'flex-start',
    maxWidth:       240,
  },
  backBtn: {
    width:           28,
    height:          28,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatar: {
    width:           28,
    height:          28,
    borderRadius:    14,
    alignItems:      'center',
    justifyContent:  'center',
  },
});
