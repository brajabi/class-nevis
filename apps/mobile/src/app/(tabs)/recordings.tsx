import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { RecordingCard, SyncBadge, TagFilter, recordingBadges } from '@/components/recording';
import { Button, EmptyState, Header, IconButton, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { toFa } from '@/lib/format';
import { recordingDurationMs, requestSync, useClassRecorder, useLocalRecordings, type LocalRecording } from '@/lib/recorder';
import type { RecordingDTO } from '@/lib/types';
import { colors, radius, space, type } from '@/theme';

interface Item {
  id: string;
  title: string;
  tags: string[];
  startedAt: string;
  durationMs: number;
  local?: LocalRecording;
  server?: RecordingDTO;
}

/** Local manifest is the source of truth for audio; the server adds transcription state. */
function merge(local: LocalRecording[], server: RecordingDTO[] | null): Item[] {
  const map = new Map<string, Item>();
  for (const r of local) {
    map.set(r.id, { id: r.id, title: r.title, tags: r.tags ?? [], startedAt: r.startedAt, durationMs: recordingDurationMs(r), local: r });
  }
  for (const s of server ?? []) {
    const it = map.get(s.id);
    if (it) {
      it.server = s;
      it.durationMs = Math.max(it.durationMs, s.durationMs);
      // recordings made before tags existed locally: fall back to the server's copy
      if (!it.local?.tags && s.tags?.length) it.tags = s.tags;
    } else map.set(s.id, { id: s.id, title: s.title, tags: s.tags ?? [], startedAt: s.startedAt, durationMs: s.durationMs, server: s });
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

  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const all = useMemo(() => merge(local, server), [local, server]);
  const allTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const it of all) for (const t of it.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [all]);
  const q = query.trim();
  const items = all.filter((it) => (!tag || it.tags.includes(tag)) && (!q || it.title.includes(q) || it.tags.some((t) => t.includes(q))));
  const filtering = !!q || !!tag;

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Header title="ضبط‌ها" subtitle={all.length ? `${toFa(all.length)} ضبط` : undefined} />
            {all.length ? (
              <View style={[styles.h, styles.search]}>
                <Ionicons name="search" size={18} color={colors.textFaint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="جستجو در نام و برچسب ضبط‌ها"
                  placeholderTextColor={colors.textFaint}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {query ? <IconButton icon="close" size={30} onPress={() => setQuery('')} /> : null}
              </View>
            ) : null}
            <TagFilter tags={allTags} value={tag} onChange={setTag} />
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
                tags={item.tags}
                startedAt={item.startedAt}
                durationMs={isActive ? recorder.elapsedMs : item.durationMs}
                badges={recordingBadges(item.local, item.server, isActive)}
                onPress={() => router.push(`/recording/${item.id}`)}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          filtering ? (
            <EmptyState
              icon="search-outline"
              title="ضبطی پیدا نشد"
              subtitle="نام یا برچسب دیگری را امتحان کنید."
              action={<Button title="پاک کردن فیلترها" variant="secondary" size="sm" onPress={() => { setQuery(''); setTag(null); }} />}
            />
          ) : (
          <EmptyState
            icon="mic-outline"
            title="هنوز ضبطی ندارید"
            subtitle="از تب «ضبط» اولین کلاس را ضبط کنید؛ همه‌چیز اینجا جمع می‌شود."
            action={<Button title="شروع ضبط" icon="mic" variant="record" onPress={() => router.push('/')} />}
          />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120 },
  h: { marginHorizontal: space.xl },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 50,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { ...type.body, flex: 1, color: colors.text, textAlign: 'right', writingDirection: 'rtl', paddingVertical: 0 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
});
