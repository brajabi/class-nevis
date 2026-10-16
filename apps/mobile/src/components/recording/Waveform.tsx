import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, type SharedValue } from 'react-native-reanimated';

import { colors } from '@/theme';

import { WAVE_BARS } from './useLiveLevel';

const MAX_H = 56;
const MIN_H = 4;

function Bar({ i, history, paused }: { i: number; history: SharedValue<number[]>; paused: boolean }) {
  const style = useAnimatedStyle(() => {
    const v = history.value[i] ?? 0;
    // bars toward the center get a little boost: nicer silhouette
    const center = 1 - Math.abs(i - (WAVE_BARS - 1) / 2) / (WAVE_BARS / 2);
    const h = MIN_H + (MAX_H - MIN_H) * Math.min(1, v * (0.7 + 0.5 * center));
    return {
      height: withSpring(paused ? MIN_H : h, { damping: 16, stiffness: 260, mass: 0.6 }),
      opacity: paused ? 0.35 : 0.45 + v * 0.55,
    };
  });
  return (
    <Animated.View style={[styles.bar, style]}>
      <LinearGradient colors={[colors.record, '#FF9A7A']} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

export function Waveform({ history, paused = false }: { history: SharedValue<number[]>; paused?: boolean }) {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: WAVE_BARS }, (_, i) => (
        <Bar key={i} i={i} history={history} paused={paused} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: MAX_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  bar: { width: 4, borderRadius: 2, overflow: 'hidden' },
});
