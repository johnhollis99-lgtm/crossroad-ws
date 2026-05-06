import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

interface Props {
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const TEAL = '#2EC4B6';
const CREAM = '#F5F0E8';

export function XRoadLogo({ size = 'md', style }: Props) {
  const sz = size === 'sm' ? 11 : 15;
  const textX = size === 'sm' ? 15 : 21;
  const textR = size === 'sm' ? 14 : 19;

  return (
    <View style={[s.row, style]}>
      {/* Road-intersection icon: two crossing bars + teal center dot */}
      <View style={{ width: sz, height: sz, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: '100%', height: 2, backgroundColor: `${TEAL}44`, borderRadius: 1 }} />
        <View style={{ position: 'absolute', width: 2, height: '100%', backgroundColor: `${TEAL}44`, borderRadius: 1 }} />
        <View style={{ width: sz * 0.36, height: sz * 0.36, borderRadius: sz * 0.18, backgroundColor: TEAL }} />
      </View>

      {/* Wordmark */}
      <Text style={s.wordmark} allowFontScaling={false}>
        <Text style={[s.x, { fontSize: textX }]}>X</Text>
        <Text style={[s.road, { fontSize: textR }]}>Road</Text>
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  wordmark: { letterSpacing: -0.3 },
  x:        { color: TEAL,  fontWeight: '800' },
  road:     { color: CREAM, fontWeight: '700' },
});
