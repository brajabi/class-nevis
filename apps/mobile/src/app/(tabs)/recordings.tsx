import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { RecordingCard, SyncBadge, recordingBadges } from '@/components/recording';
import { Button, EmptyState, Header, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { toFa } from '@/lib/format';
import { recordingDurationMs, requestSync, useClassRecorder, useLocalRecordings, type LocalRecording } from '@/lib/recorder';
import type { RecordingDTO } from '@/lib/types';
import { colors, radius, space } from '@/theme';

interface Item {
  id: string;
  title: string;
  startedAt: string;
  durationMs: number;
  local?: LocalRecording;
  server?: RecordingDTO;
}

/** Local manifest is the source of truth for audio; the server adds transcription state. */
function merge(local: LocalRecording[], server: RecordingDTO[] | null): Item[] {
  const map = new Map<string, Item>();
  for (const r of local) {
    map.set(r.id, { id: r.id, title: r.title, startedAt: r.startedAt, durationMs: recordingDurationMs(r), local: r });
  }
  for (const s of server ?? []) {
    const it = map.get(s.id);
    if (it) {
      it.server = s;
      it.durationMs = Math.max(it.durationMs, s.durationMs);
    } else map.set(s.id, { id: s.id, title: s.title, startedAt: s.startedAt, durationMs: s.durationMs, server: s });
  }
  return [...map.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export default function RecordingsScreen() {
  const local = useLocalRecordings();
  const recorder = useClassRecorder(1000);
  const [server, setServer] = useState<RecordingDTO[] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listRecordings();
      setServer(list);
      setServerError(null);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'خطا در اتصال به سرور');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(load, 10_000);
      return () => clearInterval(t);
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    requestSync({ resetBackoff: true });
    await load();
    setRefreshing(false);
  };

  const items = merge(local, server);

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Header title="ضبط‌ها" subtitle={items.length ? `${toFa(items.length)} ضبط` : undefined} />
            <View style={styles.h}>
              <SyncBadge />
            </View>
            {serverError ? (
              <Animated.View entering={FadeInDown} style={[styles.h, styles.offline]}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
                <Text variant="caption" color={colors.warning} style={{ flex: 1 }}>
                  سرور در دسترس نیست؛ ضبط‌های روی گوشی نمایش داده می‌شوند و بعداً خودکار آپلود می‌شوند.
                </Text>
              </Animated.View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item, index }) => {
          const isActive = recorder.recordingId === item.id && recorder.isActive;
          return (
            <View style={styles.h}>
              <RecordingCard
                index={index}
                live={isActive}
                title={item.local?.title ?? item.title}
                startedAt={item.startedAt}
                durationMs={isActive ? recorder.elapsedMs : item.durationMs}
                badges={recordingBadges(item.local, item.server, isActive)}
                onPress={() => router.push(`/recording/${item.id}`)}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="mic-outline"
            title="هنوز ضبطی ندارید"
            subtitle="از تب «ضبط» اولین کلاس را ضبط کنید؛ همه‌چیز اینجا جمع می‌شود."
            action={<Button title="شروع ضبط" icon="mic" variant="record" onPress={() => router.push('/')} />}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120 },
  h: { marginHorizontal: space.xl },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
});
