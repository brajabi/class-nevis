import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { colors, gradients, radius, shadow, space } from '@/theme';

const AI_STEPS = ['در حال خواندن متن کلاس…', 'در حال پیدا کردن نکات مهم…', 'در حال نوشتن جزوه…', 'در حال مرتب‌سازی تیترها…'];
const RAW_STEPS = ['در حال آماده‌سازی متن خام…', 'در حال افزودن به جزوه…'];

function ShimmerLine({ width, delay }: { width: `${number}%`; delay: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1400 + delay, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [x, delay]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 260 }] }));
  return (
    <View style={[styles.line, { width }]}>
      <Animated.View style={[StyleSheet.absoluteFill, s]}>
        <LinearGradient
          colors={['transparent', 'rgba(124,92,255,0.55)', 'rgba(34,211,238,0.45)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: 160, height: '100%' }}
        />
      </Animated.View>
    </View>
  );
}

/** Full-screen overlay shown while the AI (or raw import) writes into the note. */
export function AiWritingOverlay({ visible, mode }: { visible: boolean; mode: 'ai' | 'raw' }) {
  const [step, setStep] = useState(0);
  const pulse = useSharedValue(1);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => s + 1), 2600);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.12, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
    spin.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
  }, [pulse, spin]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  if (!visible) return null;
  const steps = mode === 'ai' ? AI_STEPS : RAW_STEPS;
  const label = steps[step % steps.length];

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(250)} style={styles.overlay}>
      <Animated.View entering={ZoomIn.springify().damping(15)} style={styles.card}>
        <LinearGradient colors={['#1D1A3A', '#11131F']} style={StyleSheet.absoluteFill} />
        <View style={styles.iconWrap}>
          <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
            <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring} />
          </Animated.View>
          <View style={styles.iconInner}>
            <Animated.View style={pulseStyle}>
              <Ionicons name={mode === 'ai' ? 'sparkles' : 'document-text'} size={30} color={colors.text} />
            </Animated.View>
          </View>
        </View>
        <Text variant="title" style={{ textAlign: 'center', fontSize: 19 }}>
          {mode === 'ai' ? 'هوش مصنوعی در حال نوشتن...' : 'در حال افزودن متن خام...'}
        </Text>
        <Animated.View key={label} entering={FadeIn.duration(300)}>
          <Text variant="label" color={colors.textMuted} style={{ textAlign: 'center' }}>
            {label}
          </Text>
        </Animated.View>
        <View style={styles.paper}>
          <ShimmerLine width="92%" delay={0} />
          <ShimmerLine width="78%" delay={120} />
          <ShimmerLine width="86%" delay={240} />
          <ShimmerLine width="54%" delay={360} />
        </View>
        <Text variant="caption" color={colors.textFaint} style={{ textAlign: 'center' }}>
          {mode === 'ai' ? 'این کار ممکن است تا یک دقیقه طول بکشد. لطفاً صفحه را نبندید.' : 'چند لحظه صبر کنید.'}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(5,6,12,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    zIndex: 500,
    elevation: 500,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
    padding: space.xl,
    gap: space.md,
    alignItems: 'center',
    ...shadow.glow,
  },
  iconWrap: { width: 76, height: 76, borderRadius: 38, padding: 3, marginBottom: space.xs },
  ring: { flex: 1, borderRadius: 38 },
  iconInner: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    margin: 3,
    borderRadius: 35,
    backgroundColor: '#17152E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paper: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md,
    padding: space.lg,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  line: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
});
