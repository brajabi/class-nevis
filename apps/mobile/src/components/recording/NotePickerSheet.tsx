import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';

import { Button, Tap, Text, RtlModal } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { NoteListItemDTO } from '@/lib/types';
import { colors, radius, space } from '@/theme';

export type AttachMode = 'ai' | 'raw';

/** Bottom sheet: pick an existing note and how to add this recording to it. */
export function NotePickerSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (noteId: string, mode: AttachMode) => void;
}) {
  return (
    <RtlModal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? <Body onClose={onClose} onPick={onPick} /> : null}
    </RtlModal>
  );
}

function Body({ onClose, onPick }: { onClose: () => void; onPick: (noteId: string, mode: AttachMode) => void }) {
  const [mode, setMode] = useState<AttachMode>('ai');
  const [notes, setNotes] = useState<NoteListItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .listNotes()
      .then((n) => alive && setNotes(n))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'خطا در دریافت جزوه‌ها'));
    return () => {
      alive = false;
    };
  }, [reload]);

  return (
    <View style={{ flex: 1 }}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(20)} style={styles.sheet}>
        <View style={styles.handle} />
        <Text variant="title">افزودن به جزوه موجود</Text>
        <Text variant="caption" color={colors.textMuted}>
          متن این ضبط به انتهای جزوه‌ای که انتخاب می‌کنید اضافه می‌شود.
        </Text>

        <View style={styles.segmented}>
          {(
            [
              { key: 'ai', label: 'نوشتن با هوش مصنوعی', icon: 'sparkles' },
              { key: 'raw', label: 'افزودن متن خام', icon: 'text' },
            ] as const
          ).map((o) => {
            const on = mode === o.key;
            return (
              <Tap key={o.key} onPress={() => setMode(o.key)} style={{ flex: 1 }}>
                <View style={[styles.segment, on && styles.segmentOn]}>
                  <Ionicons name={o.icon} size={16} color={on ? colors.text : colors.textMuted} />
                  <Text variant="label" color={on ? colors.text : colors.textMuted}>
                    {o.label}
                  </Text>
                </View>
              </Tap>
            );
          })}
        </View>
        <Text variant="caption" color={colors.textFaint}>
          {mode === 'ai'
            ? 'هوش مصنوعی با توجه به محتوای فعلی جزوه، یک بخش جدید و بدون تکرار می‌نویسد.'
            : 'رونویسی کامل همین ضبط، بدون تغییر، زیر یک تیتر به جزوه اضافه می‌شود.'}
        </Text>

        <View style={{ maxHeight: 340, minHeight: 120 }}>
          {error ? (
            <View style={styles.center}>
              <Text variant="body" color={colors.danger} style={{ textAlign: 'center' }}>
                {error}
              </Text>
              <Button title="تلاش دوباره" size="sm" variant="secondary" icon="refresh" onPress={() => setReload((x) => x + 1)} />
            </View>
          ) : !notes ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : notes.length === 0 ? (
            <View style={styles.center}>
              <Text variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
                هنوز جزوه‌ای ندارید. اول با «تبدیل به جزوه» یک جزوه بسازید.
              </Text>
            </View>
          ) : (
            <FlatList
              data={notes}
              keyExtractor={(n) => n.id}
              contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40)}>
                  <Tap onPress={() => onPick(item.id, mode)}>
                    <View style={styles.note}>
                      <View style={styles.noteIcon}>
                        <Ionicons name="document-text" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="heading" numberOfLines={1} style={{ fontSize: 15 }}>
                          {item.title}
                        </Text>
                        <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
                          {formatDate(item.updatedAt)}
                          {item.preview ? ` · ${item.preview}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={colors.accent} />
                    </View>
                  </Tap>
                </Animated.View>
              )}
            />
          )}
        </View>
        <Button title="بستن" variant="ghost" onPress={onClose} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,6,12,0.7)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  segmented: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: 4 },
  segment: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: 'rgba(124,92,255,0.5)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
