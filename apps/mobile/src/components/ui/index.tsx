import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  ModalProps,
  Pressable,
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, gradients, radius, shadow, space, type } from '@/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * The app is always right-to-left, independent of the phone's language. We don't rely on
 * native I18nManager RTL (it differs between Expo Go, dev builds and device locales);
 * instead the root view and every Modal get `direction: 'rtl'`, which Yoga applies to the
 * whole subtree.
 */
export const rtl: ViewStyle = { direction: 'rtl' };

/** Modals render in a separate native window, so they need their own RTL root. */
export function RtlModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      <View style={[{ flex: 1 }, rtl]}>{children}</View>
    </Modal>
  );
}

type TextVariant = keyof typeof type;
export function Text({
  variant = 'body',
  color = colors.text,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; color?: string }) {
  // 'simple' line breaking avoids Android under-measuring Vazirmatn in RTL, which wrapped
  // and clipped the last word of single-line labels.
  return <RNText textBreakStrategy="simple" {...rest} style={[type[variant], { color, writingDirection: 'rtl' }, style]} />;
}

/** Full-screen background with a subtle gradient glow. */
export function Screen({
  children,
  edges = ['top'],
  style,
}: {
  children: ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={gradients.backdrop} style={StyleSheet.absoluteFill} locations={[0, 0.45, 1]} />
      <SafeAreaView edges={edges} style={[{ flex: 1 }, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text variant="display">{title}</Text>
        {subtitle ? (
          <Text variant="label" color={colors.textMuted}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that springs down on press and fires a light haptic. */
export function Tap({
  onPress,
  children,
  style,
  disabled,
  haptic = true,
  onLongPress,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: boolean;
}) {
  const scale = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => (scale.value = withSpring(0.96, { damping: 18, stiffness: 400 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      onPress={() => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[a, style, disabled && { opacity: 0.5 }]}>
      {children}
    </AnimatedPressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'record';
export function Button({
  title,
  icon,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  size = 'md',
}: {
  title: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const h = size === 'sm' ? 38 : size === 'lg' ? 58 : 48;
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.text : '#fff';
  const content = (
    <View style={[styles.btnInner, { height: h, paddingHorizontal: size === 'sm' ? 14 : 20 }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={fg} /> : null}
          <Text variant={size === 'sm' ? 'label' : 'heading'} color={fg} numberOfLines={1} style={{ fontSize: size === 'sm' ? 13 : 15 }}>
            {title}
          </Text>
        </>
      )}
    </View>
  );
  const grad = variant === 'primary' ? gradients.primary : variant === 'record' ? gradients.record : null;
  return (
    <Tap onPress={onPress} disabled={disabled || loading} style={style}>
      {grad ? (
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.btn, variant === 'primary' && shadow.glow]}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.btn,
            variant === 'secondary' && { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
            variant === 'danger' && { backgroundColor: 'rgba(248,113,113,0.16)' },
          ]}>
          {variant === 'danger' ? (
            <View style={[styles.btnInner, { height: h, paddingHorizontal: 20 }]}>
              {icon ? <Ionicons name={icon} size={20} color={colors.danger} /> : null}
              <Text variant="heading" color={colors.danger} numberOfLines={1} style={{ fontSize: 15 }}>
                {title}
              </Text>
            </View>
          ) : (
            content
          )}
        </View>
      )}
    </Tap>
  );
}

export function IconButton({
  icon,
  onPress,
  color = colors.text,
  bg = colors.surfaceHigh,
  size = 42,
  active,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  active?: boolean;
}) {
  return (
    <Tap onPress={onPress}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2.6,
          backgroundColor: active ? colors.primarySoft : bg,
          borderWidth: 1,
          borderColor: active ? colors.primary : colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={icon} size={size * 0.48} color={active ? colors.primary : color} />
      </View>
    </Tap>
  );
}

export function Card({
  children,
  style,
  index = 0,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** list position, used for staggered entering animation */
  index?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 50).springify().damping(18)}>
      <LinearGradient colors={gradients.surface} style={[styles.card, style]}>
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'record';
const toneMap: Record<BadgeTone, [string, string]> = {
  neutral: [colors.surfaceHigh, colors.textMuted],
  primary: [colors.primarySoft, colors.primary],
  accent: [colors.accentSoft, colors.accent],
  success: [colors.successSoft, colors.success],
  warning: [colors.warningSoft, colors.warning],
  danger: ['rgba(248,113,113,0.14)', colors.danger],
  record: [colors.recordSoft, colors.record],
};
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: IconName }) {
  const [bg, fg] = toneMap[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text variant="caption" color={fg} numberOfLines={1} style={{ fontFamily: fonts.medium }}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({ icon, title, subtitle, action }: { icon: IconName; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.empty}>
      <LinearGradient colors={[colors.primarySoft, 'transparent']} style={styles.emptyIcon}>
        <Ionicons name={icon} size={40} color={colors.primary} />
      </LinearGradient>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
      {action}
    </Animated.View>
  );
}

export const inputStyle: TextStyle = {
  ...type.body,
  color: colors.text,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  paddingHorizontal: space.lg,
  paddingVertical: space.md,
  textAlign: 'right',
  writingDirection: 'rtl',
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  btn: { borderRadius: radius.lg, overflow: 'hidden' },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadow.card },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md, marginTop: 60 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
