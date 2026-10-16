import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Badge, Button, Tap, Text } from '@/components/ui';
import { formatDate, toFa } from '@/lib/format';
import type { NoteListItemDTO } from '@/lib/types';
import { colors, gradients, radius, shadow, space } from '@/theme';

const ACCENTS = [
  ['#7C5CFF', '#4F7BFF'],
  ['#22D3EE', '#4F7BFF'],
  ['#FF4D6D', '#FF7A59'],
  ['#34D399', '#22D3EE'],
  ['#FBBF24', '#FF7A59'],
] as const;

function accentFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function NoteCard({
  note,
  index,
  onPress,
  onLongPress,
  compact,
}: {
  note: NoteListItemDTO;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
  /** grid mode: tighter card */
  compact?: boolean;
}) {
  const accent = accentFor(note.id);
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 12) * 55).springify().damping(17)}
      style={compact ? { flex: 1 } : undefined}>
      <Tap
        onPress={onPress}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onLongPress();
        }} style={compact ? { flex: 1 } : undefined}>
        <LinearGradient colors={gradients.surface} style={[styles.card, compact && styles.compact]}>
          <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.stripe} />
          <View style={styles.titleRow}>
            <LinearGradient colors={[accent[0] + '33', accent[1] + '11']} style={styles.icon}>
              <Ionicons name="document-text" size={18} color={accent[0]} />
            </LinearGradient>
            <Text variant="heading" numberOfLines={2} style={{ flex: 1 }}>
              {note.title || 'جزوه بدون عنوان'}
            </Text>
          </View>
          <Text
            variant="body"
            color={note.preview ? colors.textMuted : colors.textFaint}
            numberOfLines={3}
            style={{ fontSize: 14, lineHeight: 24, minHeight: compact ? 72 : undefined }}>
            {note.preview || 'هنوز چیزی ننوشته‌اید…'}
          </Text>
          <View style={styles.footer}>
            <View style={styles.date}>
              <Ionicons name="time-outline" size={13} color={colors.textFaint} />
              <Text variant="caption" color={colors.textFaint} numberOfLines={1} style={{ flexShrink: 1 }}>
                {formatDate(note.updatedAt)}
              </Text>
            </View>
            {note.recordingCount > 0 ? (
              <Badge tone="accent" icon="mic" label={compact ? toFa(note.recordingCount) : `${toFa(note.recordingCount)} صوت`} />
            ) : null}
          </View>
        </LinearGradient>
      </Tap>
    </Animated.View>
  );
}

/** Friendly "server unreachable" card with a retry button. */
export function ErrorCard({ message, onRetry, loading }: { message: string; onRetry: () => void; loading?: boolean }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)}>
      <LinearGradient colors={['rgba(248,113,113,0.12)', 'rgba(22,25,41,0.9)']} style={styles.error}>
        <View style={styles.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
        </View>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          اتصال برقرار نشد
        </Text>
        <Text variant="body" color={colors.textMuted} style={{ textAlign: 'center', fontSize: 14 }}>
          {message}
          {'\n'}
          اینترنت گوشی را بررسی کنید و دوباره تلاش کنید.
        </Text>
        <Button title="تلاش دوباره" icon="refresh" onPress={onRetry} loading={loading} variant="secondary" style={{ alignSelf: 'stretch' }} />
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    paddingStart: space.lg + 6,
    gap: space.sm,
    overflow: 'hidden',
    ...shadow.card,
  },
  compact: { flex: 1, padding: space.md, paddingStart: space.md + 6 },
  stripe: { position: 'absolute', start: 0, top: 0, bottom: 0, width: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: 2 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  error: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
    padding: space.xl,
    alignItems: 'center',
    gap: space.md,
    marginTop: space.xl,
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(248,113,113,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
