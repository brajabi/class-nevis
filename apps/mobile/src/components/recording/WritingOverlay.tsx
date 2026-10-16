import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text, RtlModal } from '@/components/ui';
import { colors, gradients } from '@/theme';

const DEFAULT_LINES = ['در حال خواندن متن کلاس...', 'در حال نوشتن جزوه...', 'مرتب کردن نکته‌های مهم...', 'ساختن تیترها و فهرست‌ها...', 'تقریباً تمام است...'];

/** Full-screen "AI is writing" overlay with an animated orb and rotating status lines. */
export function WritingOverlay({ visible, lines = DEFAULT_LINES, hint }: { visible: boolean; lines?: string[]; hint?: string }) {
  return (
    <RtlModal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      {visible ? <Body lines={lines} hint={hint} /> : null}
    </RtlModal>
  );
}

function Body({ lines, hint }: { lines: string[]; hint?: string }) {
  const [i, setI] = useState(0);
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1);
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), 2600);
    return () => clearInterval(t);
  }, [lines.length, spin, pulse]);

  const orb = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }, { scale: 1 + pulse.value * 0.08 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.35, transform: [{ scale: 1.2 + pulse.value * 0.25 }] }));

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.backdrop}>
      <View style={styles.center}>
        <Animated.View style={[styles.halo, halo]} />
        <Animated.View style={[styles.orb, orb]}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orbFill} />
        </Animated.View>
        <View style={styles.icon}>
          <Ionicons name="sparkles" size={40} color="#fff" />
        </View>
      </View>
      <View style={{ height: 34, marginTop: 36, alignItems: 'center' }}>
        <Animated.View key={i} entering={FadeInDown.duration(350)} exiting={FadeOutUp.duration(250)}>
          <Text variant="title" style={{ textAlign: 'center' }}>
            {lines[i]}
          </Text>
        </Animated.View>
      </View>
      <Text variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: 12, paddingHorizontal: 40 }}>
        {hint ?? 'هوش مصنوعی در حال تبدیل صحبت‌های کلاس به یک جزوه مرتب است. این کار ممکن است یکی دو دقیقه طول بکشد.'}
      </Text>
    </Animated.View>
  );
}

const ORB = 120;
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7,8,16,0.94)', alignItems: 'center', justifyContent: 'center' },
  center: { width: ORB * 2, height: ORB * 2, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: ORB, height: ORB, borderRadius: ORB / 2, backgroundColor: colors.primary },
  orb: { width: ORB, height: ORB, borderRadius: ORB / 2, overflow: 'hidden' },
  orbFill: { flex: 1 },
  icon: { position: 'absolute' },
});
