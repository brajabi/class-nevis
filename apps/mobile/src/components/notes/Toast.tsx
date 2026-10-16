import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOutUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, type IconName } from '@/components/ui';
import { colors, radius, shadow } from '@/theme';

export type ToastTone = 'success' | 'error' | 'info';
interface ToastMsg {
  id: number;
  text: string;
  tone: ToastTone;
}

type Listener = (m: ToastMsg) => void;
// Stack of mounted hosts; only the most recently mounted (top-most screen) shows toasts.
const hosts: Listener[] = [];
let nextId = 1;

/** Show a short toast on the top-most mounted <ToastHost />. */
export function showToast(text: string, tone: ToastTone = 'success') {
  const host = hosts[hosts.length - 1];
  if (!host) return;
  if (tone === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  else if (tone === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  host({ id: nextId++, text, tone });
}

const toneStyle: Record<ToastTone, { icon: IconName; color: string }> = {
  success: { icon: 'checkmark-circle', color: colors.success },
  error: { icon: 'alert-circle', color: colors.danger },
  info: { icon: 'information-circle', color: colors.accent },
};

/** Render once per screen (absolutely positioned at the top). */
export function ToastHost({ offset = 8 }: { offset?: number }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const l: Listener = (m) => {
      if (timer.current) clearTimeout(timer.current);
      setMsg(m);
      timer.current = setTimeout(() => setMsg(null), 2400);
    };
    hosts.push(l);
    return () => {
      const i = hosts.indexOf(l);
      if (i >= 0) hosts.splice(i, 1);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!msg) return null;
  const t = toneStyle[msg.tone];
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + offset }]}>
      <Animated.View
        key={msg.id}
        entering={ZoomIn.springify().damping(16).stiffness(220)}
        exiting={FadeOutUp.duration(220)}
        style={[styles.toast, { borderColor: t.color + '55' }]}>
        <View style={[styles.dot, { backgroundColor: t.color + '22' }]}>
          <Ionicons name={t.icon} size={18} color={t.color} />
        </View>
        <Text variant="label" style={{ flexShrink: 1 }}>
          {msg.text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '88%',
    paddingVertical: 10,
    paddingStart: 10,
    paddingEnd: 18,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22,25,41,0.97)',
    borderWidth: 1,
    ...shadow.card,
  },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
