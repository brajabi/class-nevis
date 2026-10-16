import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, type IconName } from '@/components/ui';
import { colors, fonts, gradients, radius } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'ضبط', icon: 'mic-outline', iconActive: 'mic' },
  recordings: { label: 'ضبط‌ها', icon: 'albums-outline', iconActive: 'albums' },
  notes: { label: 'جزوه‌های من', icon: 'document-text-outline', iconActive: 'document-text' },
  settings: { label: 'تنظیمات', icon: 'options-outline', iconActive: 'options' },
};

function TabItem({ focused, name, onPress }: { focused: boolean; name: string; onPress: () => void }) {
  const t = TABS[name];
  const p = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(focused ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [focused, p]);
  const pill = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.6 + p.value * 0.4 }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -p.value * 2 }, { scale: 1 + p.value * 0.08 }] }));
  if (!t) return null;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.pillWrap, pill]}>
        <LinearGradient colors={[colors.primarySoft, 'rgba(34,211,238,0.10)']} style={styles.pill} />
      </Animated.View>
      <Animated.View style={icon}>
        <Ionicons name={focused ? t.iconActive : t.icon} size={22} color={focused ? colors.text : colors.textFaint} />
      </Animated.View>
      <Text
        variant="caption"
        color={focused ? colors.text : colors.textFaint}
        style={{ fontFamily: focused ? fonts.bold : fonts.medium, fontSize: 11, marginTop: 2 }}
        numberOfLines={1}>
        {t.label}
      </Text>
    </Pressable>
  );
}

function FloatingTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <LinearGradient colors={['rgba(30,34,54,0.96)', 'rgba(17,19,31,0.98)']} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topLine} />
        {state.routes.map((route, i) => (
          <TabItem
            key={route.key}
            name={route.name}
            focused={state.index === i}
            onPress={() => {
              if (state.index !== i) navigateToTab(route.key);
            }}
          />
        ))}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="recordings" />
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    height: 68,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  topLine: { position: 'absolute', top: 0, left: 24, right: 24, height: 1, opacity: 0.6 },
  item: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  pillWrap: { alignItems: 'center', justifyContent: 'center' },
  pill: { width: '92%', height: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(124,92,255,0.35)' },
});
