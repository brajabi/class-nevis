import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap, Text, type IconName, RtlModal } from '@/components/ui';
import { colors, gradients, radius, space } from '@/theme';

/** Bottom sheet built on Modal with a spring slide-in. */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  scroll,
  maxHeight = '82%',
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
  maxHeight?: `${number}%` | number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <RtlModal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.backdropWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={styles.backdrop} />
        </Pressable>
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(190)}
          style={[styles.sheet, { paddingBottom: insets.bottom + space.lg, maxHeight }]}>
          <LinearGradient colors={['#1B1E33', '#11131F']} style={StyleSheet.absoluteFill} />
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.head}>
              <Text variant="title" style={{ fontSize: 19 }}>
                {title}
              </Text>
              {subtitle ? (
                <Text variant="caption" color={colors.textMuted}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
          {scroll ? (
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : (
            <View style={styles.body}>{children}</View>
          )}
        </Animated.View>
      </View>
    </RtlModal>
  );
}

export type SheetActionTone = 'default' | 'primary' | 'accent' | 'danger';
const toneColor: Record<SheetActionTone, [string, string]> = {
  default: [colors.surfaceHigh, colors.text],
  primary: [colors.primarySoft, colors.primary],
  accent: [colors.accentSoft, colors.accent],
  danger: ['rgba(248,113,113,0.14)', colors.danger],
};

/** A large tappable row for sheets (icon, title, optional description). */
export function SheetAction({
  icon,
  title,
  description,
  onPress,
  tone = 'default',
  index = 0,
  loading,
  disabled,
  right,
}: {
  icon: IconName;
  title: string;
  description?: string;
  onPress?: () => void;
  tone?: SheetActionTone;
  index?: number;
  loading?: boolean;
  disabled?: boolean;
  right?: ReactNode;
}) {
  const [bg, fg] = toneColor[tone];
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 45).springify().damping(18)}>
      <Tap onPress={onPress} disabled={disabled || loading} style={styles.action}>
        <View style={[styles.actionIcon, { backgroundColor: bg }]}>
          {loading ? <ActivityIndicator color={fg} size="small" /> : <Ionicons name={icon} size={21} color={fg} />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="heading" style={{ fontSize: 15, lineHeight: 24 }} color={tone === 'danger' ? colors.danger : colors.text}>
            {title}
          </Text>
          {description ? (
            <Text variant="caption" color={colors.textMuted}>
              {description}
            </Text>
          ) : null}
        </View>
        {right ?? <Ionicons name="chevron-back" size={18} color={colors.textFaint} />}
      </Tap>
    </Animated.View>
  );
}

/** Centered dialog (for text input, confirmations) — stays clear of the keyboard. */
export function Dialog({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <RtlModal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.dialogWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View entering={FadeIn} style={styles.backdrop} />
        </Pressable>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.dialog}>
          <LinearGradient colors={gradients.surface} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dialogLine} />
          {children}
        </Animated.View>
      </View>
    </RtlModal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(3,4,10,0.66)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginTop: 10 },
  head: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, gap: 2 },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogWrap: { flex: 1, justifyContent: 'flex-start', paddingTop: '28%', paddingHorizontal: space.xl },
  dialog: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.xl,
    gap: space.md,
  },
  dialogLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
});
