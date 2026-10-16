import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Badge, Button, Tap, Text, type BadgeTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDuration, toFa } from '@/lib/format';
import type { RecordingDTO } from '@/lib/types';
import { colors, gradients, radius, space } from '@/theme';

import { Sheet, SheetAction } from './Sheet';

export type AttachMode = 'ai' | 'raw';

interface Readiness {
  ready: boolean;
  label: string;
  tone: BadgeTone;
  reason?: string;
}

export function recordingReadiness(r: RecordingDTO): Readiness {
  if (r.status === 'RECORDING')
    return { ready: false, label: 'در حال ضبط', tone: 'record', reason: 'ضبط هنوز تمام نشده است.' };
  if (r.segmentCount === 0) return { ready: false, label: 'بدون صدا', tone: 'neutral', reason: 'هنوز هیچ بخشی از این ضبط به سرور نرسیده.' };
  if (r.failedCount > 0)
    return {
      ready: false,
      label: 'خطا در رونویسی',
      tone: 'danger',
      reason: `رونویسی ${toFa(r.failedCount)} بخش ناموفق بود؛ از صفحهٔ ضبط دوباره تلاش کنید.`,
    };
  if (r.transcribedCount < r.segmentCount)
    return {
      ready: false,
      label: `رونویسی ${toFa(r.transcribedCount)} از ${toFa(r.segmentCount)}`,
      tone: 'warning',
      reason: 'رونویسی هنوز کامل نشده؛ کمی بعد دوباره امتحان کنید.',
    };
  return { ready: true, label: 'آماده', tone: 'success' };
}

/** Two-step sheet: pick a fully transcribed recording, then choose how to add it. */
export function AttachRecordingSheet({
  visible,
  onClose,
  linkedIds,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  linkedIds: string[];
  onPick: (recording: RecordingDTO, mode: AttachMode) => void;
}) {
  const [items, setItems] = useState<RecordingDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<RecordingDTO | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.listRecordings());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'خطا در دریافت فهرست ضبط‌ها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setChosen(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      scroll
      title={chosen ? 'چطور اضافه شود؟' : 'افزودن صوت به جزوه'}
      subtitle={chosen ? chosen.title : 'یک ضبط رونویسی‌شده را انتخاب کنید'}>
      {chosen ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.sm }}>
          <Tap onPress={() => onPick(chosen, 'ai')}>
            <LinearGradient colors={['rgba(124,92,255,0.28)', 'rgba(34,211,238,0.12)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mode}>
              <LinearGradient colors={gradients.primary} style={styles.modeIcon}>
                <Ionicons name="sparkles" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">نوشتن با هوش مصنوعی</Text>
                <Text variant="caption" color={colors.textMuted}>
                  از متن کلاس یک بخش جزوهٔ مرتب با تیتر و نکات کلیدی نوشته و به انتهای جزوه اضافه می‌شود.
                </Text>
              </View>
            </LinearGradient>
          </Tap>
          <SheetAction
            index={1}
            icon="document-text-outline"
            tone="accent"
            title="افزودن متن خام"
            description="متن رونویسی‌شده همان‌طور که هست زیر یک تیتر اضافه می‌شود."
            onPress={() => onPick(chosen, 'raw')}
          />
          <Button title="انتخاب صوت دیگر" variant="ghost" icon="arrow-forward" size="sm" onPress={() => setChosen(null)} />
        </Animated.View>
      ) : loading && !items ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text variant="label" color={colors.textMuted}>
            در حال دریافت ضبط‌ها…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
          <Text variant="label" color={colors.textMuted} style={{ textAlign: 'center' }}>
            {error}
          </Text>
          <Button title="تلاش دوباره" icon="refresh" variant="secondary" size="sm" onPress={load} />
        </View>
      ) : items && items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="mic-off-outline" size={30} color={colors.textFaint} />
          <Text variant="label" color={colors.textMuted} style={{ textAlign: 'center' }}>
            هنوز ضبطی ندارید. از زبانهٔ «ضبط» یک کلاس را ضبط کنید.
          </Text>
        </View>
      ) : (
        (items ?? []).map((r, i) => {
          const st = recordingReadiness(r);
          const linked = linkedIds.includes(r.id);
          return (
            <Animated.View key={r.id} entering={FadeInDown.delay(Math.min(i, 10) * 40).springify().damping(18)}>
              <Tap onPress={() => st.ready && setChosen(r)} disabled={!st.ready} haptic={st.ready}>
                <View style={[styles.rec, !st.ready && { opacity: 0.6 }]}>
                  <View style={[styles.recIcon, { backgroundColor: st.ready ? colors.primarySoft : colors.surfaceHigh }]}>
                    <Ionicons name={st.ready ? 'mic' : 'hourglass-outline'} size={20} color={st.ready ? colors.primary : colors.textFaint} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="heading" numberOfLines={1} style={{ fontSize: 15, lineHeight: 24 }}>
                      {r.title || 'ضبط بدون عنوان'}
                    </Text>
                    <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
                      {formatDate(r.startedAt)} · {formatDuration(r.durationMs)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <Badge label={st.label} tone={st.tone} />
                      {linked ? <Badge label="قبلاً اضافه شده" tone="primary" icon="link" /> : null}
                    </View>
                    {st.reason ? (
                      <Text variant="caption" color={colors.textMuted}>
                        {st.reason}
                      </Text>
                    ) : null}
                  </View>
                  {st.ready ? <Ionicons name="chevron-back" size={18} color={colors.textFaint} /> : null}
                </View>
              </Tap>
            </Animated.View>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  rec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  recIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.45)',
  },
  modeIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
