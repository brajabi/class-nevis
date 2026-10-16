import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { RecorderPhase } from '@/lib/recorder';
import { colors, gradients } from '@/theme';

const SIZE = 176;

function Ring({ delay, active }: { delay: number; active: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (active) {
      p.value = 0;
      p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false));
    } else {
      cancelAnimation(p);
      p.value = withTiming(0, { duration: 300 });
    }
  }, [active, delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.15, 1], [0, 0.55, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [1, 1.68]) }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

export function RecordButton({
  phase,
  level,
  onPress,
}: {
  phase: RecorderPhase;
  level: SharedValue<number>;
  onPress: () => void;
}) {
  const recording = phase === 'recording';
  const busy = phase === 'starting' || phase === 'stopping';
  const breathe = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    if (recording) {
      breathe.value = withRepeat(
        withSequence(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) })),
        -1,
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(0, { duration: 400 });
    }
  }, [recording, breathe]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value * (1 + breathe.value * 0.035) }],
  }));
  // glow follows the voice
  const glowStyle = useAnimatedStyle(() => ({
    opacity: recording ? 0.35 + level.value * 0.5 : 0.18,
    transform: [{ scale: 1.08 + (recording ? level.value * 0.28 + breathe.value * 0.04 : 0) }],
  }));

  const icon = phase === 'idle' ? 'mic' : recording ? 'pause' : 'mic';
  const label = phase === 'idle' ? 'شروع ضبط' : recording ? 'توقف موقت' : 'ادامه ضبط';

  return (
    <View style={styles.wrap}>
      <Ring delay={0} active={recording} />
      <Ring delay={800} active={recording} />
      <Ring delay={1600} active={recording} />
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
        <LinearGradient colors={['rgba(255,77,109,0.55)', 'rgba(255,122,89,0)']} style={styles.glowFill} />
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPressIn={() => (press.value = withSpring(0.93, { damping: 15, stiffness: 400 }))}
        onPressOut={() => (press.value = withSpring(1, { damping: 12, stiffness: 260 }))}
        onPress={() => {
          Haptics.impactAsync(phase === 'idle' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}>
        <Animated.View style={[styles.button, buttonStyle]}>
          <LinearGradient colors={phase === 'paused' ? ['#3A3F5C', '#262A40'] : gradients.record} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fill}>
            <View style={styles.innerRing} />
            {busy ? <ActivityIndicator color="#fff" size="large" /> : <Ionicons name={icon} size={62} color="#fff" />}
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE * 1.75, height: SIZE * 1.75, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: colors.record,
  },
  glow: { position: 'absolute', width: SIZE * 1.3, height: SIZE * 1.3, borderRadius: SIZE * 0.65, overflow: 'hidden' },
  glowFill: { flex: 1, borderRadius: SIZE * 0.65 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    shadowColor: colors.record,
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  fill: { flex: 1, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  innerRing: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
