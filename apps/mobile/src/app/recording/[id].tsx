import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  NotePickerSheet,
  PlayerBar,
  RenameSheet,
  TagPicker,
  TranscriptList,
  WritingOverlay,
  recordingBadges,
  type AttachMode,
  type PlayerTrack,
} from '@/components/recording';
import { Badge, Button, Card, IconButton, Screen, Tap, Text } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBytes, formatDate, formatDuration, toFa } from '@/lib/format';
import {
  allowRecordingInSync,
  deleteLocalRecording,
  forgetRecordingInSync,
  recordingDurationMs,
  recordingSizeBytes,
  renameLocalRecording,
  requestSync,
  setLocalRecordingTags,
  useAllTags,
  useClassRecorder,
  useLocalRecording,
  useSyncStatus,
} from '@/lib/recorder';
import type { RecordingDetailDTO } from '@/lib/types';
import { colors, radius, space } from '@/theme';

type LoadState = 'loading' | 'ok' | 'notFound' | 'offline';

const confirm = (title: string, message: string, ok: string, destructive = false) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'انصراف', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );

export default function RecordingDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? '');
  const local = useLocalRecording(id);
  const recorder = useClassRecorder(1000);
  const sync = useSyncStatus();
  const [detail, setDetail] = useState<RecordingDetailDTO | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [writing, setWriting] = useState<null | 'note' | 'ai' | 'raw'>(null);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isActive = recorder.isActive && recorder.recordingId === id;

  const load = useCallback(async () => {
    try {
      const d = await api.getRecording(id);
      setDetail(d);
      setLoadState('ok');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setLoadState('notFound');
      else setLoadState((s) => (s === 'ok' ? 'ok' : 'offline'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const localPending = local ? local.segments.filter((s) => !s.uploaded).length : 0;
  const transcribing = !!detail?.segments.some((s) => s.transcriptStatus === 'PENDING' || s.transcriptStatus === 'PROCESSING');
  const needsPoll = transcribing || localPending > 0 || isActive || (loadState === 'notFound' && !!local);

  // poll every 5s while something is still moving
  useEffect(() => {
    if (!needsPoll) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [needsPoll, load]);

  const title = local?.title ?? detail?.title ?? 'ضبط';
  const startedAt = local?.startedAt ?? detail?.startedAt;
  const durationMs = isActive ? recorder.elapsedMs : Math.max(local ? recordingDurationMs(local) : 0, detail?.durationMs ?? 0);
  const segmentCount = Math.max(local?.segments.length ?? 0, detail?.segmentCount ?? 0);

  // tracks: local file first, server copy as fallback
  const trackMap = new Map<number, PlayerTrack>();
  for (const s of detail?.segments ?? []) trackMap.set(s.index, { index: s.index, uri: api.segmentAudioUrl(id, s.index), durationMs: s.durationMs, local: false });
  for (const s of local?.segments ?? []) if (!s.pendingMove) trackMap.set(s.index, { index: s.index, uri: s.uri, durationMs: s.durationMs, local: true });
  const tracks = [...trackMap.values()].sort((a, b) => a.index - b.index);

  const tags = local?.tags ?? detail?.tags ?? [];
  const allTags = useAllTags();

  // ---------- actions ----------
  const setTags = async (next: string[]) => {
    if (local) {
      await setLocalRecordingTags(id, next);
      requestSync();
    }
    if (detail) {
      setDetail({ ...detail, tags: next });
      if (!local) {
        try {
          await api.patchRecording(id, { tags: next });
        } catch (e) {
          Alert.alert('خطا', e instanceof Error ? e.message : 'ذخیره برچسب‌ها ممکن نشد');
        }
      }
    }
  };

  const rename = async (t: string) => {
    if (local) {
      await renameLocalRecording(id, t);
      requestSync();
    }
    if (detail) {
      setDetail({ ...detail, title: t });
      if (!local) {
        try {
          await api.patchRecording(id, { title: t });
        } catch (e) {
          Alert.alert('خطا', e instanceof Error ? e.message : 'تغییر عنوان ممکن نشد');
        }
      }
    }
  };

  const preflight = async (): Promise<boolean> => {
    if (isActive) {
      Alert.alert('ضبط هنوز ادامه دارد', 'برای ساختن جزوه، اول ضبط را از تب «ضبط» تمام کنید.');
      return false;
    }
    if (loadState !== 'ok' && !detail) {
      Alert.alert('سرور در دسترس نیست', 'این ضبط هنوز به سرور نرسیده یا اتصال برقرار نیست. بعد از آپلود دوباره امتحان کنید.');
      requestSync({ resetBackoff: true });
      return false;
    }
    if (localPending > 0) {
      return confirm(
        'بخشی از صدا هنوز آپلود نشده',
        `${toFa(localPending)} بخش هنوز فقط روی گوشی است و در جزوه نخواهد آمد. بهتر است صبر کنید تا آپلود تمام شود. باز هم ادامه می‌دهید؟`,
        'ادامه',
      );
    }
    return true;
  };

  const handleAiError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) {
      const pending = Number(e.body?.pending ?? 0);
      Alert.alert(
        'رونویسی هنوز تمام نشده',
        pending > 0
          ? `${toFa(pending)} بخش هنوز در حال رونویسی است. چند لحظه دیگر دوباره امتحان کنید.`
          : 'رونویسی همه بخش‌ها هنوز تمام نشده است. چند لحظه دیگر دوباره امتحان کنید.',
      );
    } else {
      Alert.alert('خطا', e instanceof Error ? e.message : 'خطای نامشخص');
    }
  };

  const makeNote = async () => {
    if (!(await preflight())) return;
    setWriting('note');
    try {
      const note = await api.recordingToNote(id, title);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setWriting(null);
      router.push(`/note/${note.id}`);
    } catch (e) {
      setWriting(null);
      handleAiError(e);
    }
  };

  const attach = async (noteId: string, mode: AttachMode) => {
    setPicking(false);
    if (!(await preflight())) return;
    setWriting(mode);
    try {
      const note = await api.attachRecording(noteId, id, mode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setWriting(null);
      router.push(`/note/${note.id}`);
    } catch (e) {
      setWriting(null);
      handleAiError(e);
    }
  };

  const shareText = async () => {
    const text = detail?.transcript?.trim();
    if (!text) {
      Alert.alert('متنی برای اشتراک نیست', 'هنوز هیچ بخشی رونویسی نشده است.');
      return;
    }
    try {
      await Share.share({ title, message: `${title}\n\n${text}` });
    } catch {}
  };

  const retry = async () => {
    setRetrying(true);
    try {
      setDetail(await api.retranscribe(id));
    } catch (e) {
      Alert.alert('خطا', e instanceof Error ? e.message : 'تلاش دوباره ممکن نشد');
    } finally {
      setRetrying(false);
    }
  };

  const remove = async () => {
    if (isActive) {
      Alert.alert('در حال ضبط', 'ضبطی که در جریان است را نمی‌توان حذف کرد. اول آن را تمام کنید.');
      return;
    }
    const msg =
      localPending > 0
        ? `هشدار: ${toFa(localPending)} بخش از صدای این کلاس هنوز آپلود نشده و فقط روی همین گوشی وجود دارد. با حذف، این صدا برای همیشه از بین می‌رود و قابل بازگشت نیست.`
        : local
          ? 'این ضبط و متن آن از گوشی و سرور برای همیشه حذف می‌شود. این کار قابل بازگشت نیست.'
          : 'نسخه سرور این ضبط و متن آن برای همیشه حذف می‌شود. این کار قابل بازگشت نیست.';
    const ok = await confirm(localPending > 0 ? 'صدا برای همیشه پاک می‌شود!' : 'حذف ضبط؟', msg, localPending > 0 ? 'حذف برای همیشه' : 'حذف', true);
    if (!ok) return;
    if (localPending > 0) {
      const sure = await confirm('مطمئن هستید؟', 'این آخرین فرصت است. صدای آپلودنشده بازیابی نخواهد شد.', 'بله، حذف شود', true);
      if (!sure) return;
    }
    setDeleting(true);
    forgetRecordingInSync(id); // stop the queue from re-creating it on the server
    try {
      if (detail || local?.serverCreated) {
        try {
          await api.deleteRecording(id);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) {
            if (!local) throw e;
            const onlyLocal = await confirm(
              'سرور در دسترس نیست',
              'نسخه سرور فعلاً حذف نشد. فقط از گوشی حذف شود؟ (نسخه سرور باقی می‌ماند و بعداً می‌توانید آن را از همین صفحه حذف کنید.)',
              'فقط از گوشی',
              true,
            );
            if (!onlyLocal) {
              allowRecordingInSync(id);
              return;
            }
          }
        }
      }
      if (local) await deleteLocalRecording(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      goBack();
    } catch (e) {
      allowRecordingInSync(id);
      Alert.alert('حذف ممکن نشد', e instanceof Error ? e.message : 'خطای نامشخص');
    } finally {
      setDeleting(false);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/recordings'));

  // ---------- render ----------
  const badges = recordingBadges(local, detail ?? undefined, isActive);
  const uploaded = local ? local.segments.length - localPending : 0;
  const exists = !!local || !!detail;

  if (!exists && loadState === 'loading') {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!exists) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        <View style={styles.center}>
          <Ionicons name={loadState === 'offline' ? 'cloud-offline-outline' : 'help-circle-outline'} size={48} color={colors.textFaint} />
          <Text variant="heading" style={{ textAlign: 'center' }}>
            {loadState === 'offline' ? 'اتصال به سرور برقرار نشد' : 'این ضبط پیدا نشد'}
          </Text>
          <Button title="تلاش دوباره" icon="refresh" variant="secondary" onPress={load} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar onBack={goBack} onRename={() => setRenaming(true)} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space.sm }}>
          <Text variant="title">{title}</Text>
          <View style={styles.metaRow}>
            {startedAt ? <Meta icon="calendar-outline" text={formatDate(startedAt)} /> : null}
            <Meta icon="time-outline" text={formatDuration(durationMs)} />
            <Meta icon="layers-outline" text={`${toFa(segmentCount)} بخش`} />
            {local ? <Meta icon="phone-portrait-outline" text={formatBytes(recordingSizeBytes(local))} /> : null}
          </View>
          <TagPicker selected={tags} allTags={allTags} onChange={setTags} inset={0} />
          {badges.length ? (
            <View style={styles.badges}>
              {badges.map((b) => (
                <Badge key={b.label} label={b.label} tone={b.tone} icon={b.icon} />
              ))}
            </View>
          ) : null}
        </Animated.View>

        {/* where the audio is */}
        {local ? (
          <Animated.View entering={FadeInDown.delay(60).duration(400)}>
            <Card style={styles.safeCard}>
              <Ionicons name={localPending ? 'cloud-upload-outline' : 'shield-checkmark'} size={22} color={localPending ? colors.warning : colors.success} />
              <View style={{ flex: 1 }}>
                <Text variant="label">
                  {localPending
                    ? `${toFa(uploaded)} از ${toFa(local.segments.length)} بخش آپلود شده`
                    : 'همه بخش‌ها روی گوشی و سرور ذخیره شده‌اند'}
                </Text>
                <Text variant="caption" color={colors.textMuted}>
                  {localPending
                    ? sync.online
                      ? 'آپلود به‌صورت خودکار ادامه دارد. صدا روی گوشی امن است.'
                      : 'اینترنت قطع است؛ با وصل شدن، آپلود خودکار ادامه پیدا می‌کند.'
                    : 'نسخه اصلی صدا روی گوشی می‌ماند تا وقتی خودتان حذفش کنید.'}
                </Text>
              </View>
              {localPending ? <IconButton icon="refresh" size={36} onPress={() => requestSync({ resetBackoff: true })} /> : null}
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
          <PlayerBar tracks={tracks} disabledReason={recorder.isActive ? 'هنگام ضبط، پخش صدا غیرفعال است.' : undefined} />
        </Animated.View>

        {/* actions */}
        <Animated.View entering={FadeInDown.delay(180).duration(400)} style={{ gap: space.md }}>
          <Button title="تبدیل به جزوه" icon="sparkles" size="lg" onPress={makeNote} disabled={isActive} />
          <View style={styles.actionsRow}>
            <Button title="افزودن به جزوه موجود" icon="add-circle-outline" variant="secondary" onPress={() => setPicking(true)} disabled={isActive} style={{ flex: 1 }} />
            <Button title="اشتراک متن" icon="share-outline" variant="secondary" onPress={shareText} style={{ flex: 0.7 }} />
          </View>
          {detail?.noteIds.length ? (
            <View style={styles.badges}>
              {detail.noteIds.map((nid, i) => (
                <Tap key={nid} onPress={() => router.push(`/note/${nid}`)}>
                  <View style={styles.noteChip}>
                    <Ionicons name="document-text" size={14} color={colors.primary} />
                    <Text variant="label" color={colors.text}>
                      مشاهده جزوه {detail.noteIds.length > 1 ? toFa(i + 1) : ''}
                    </Text>
                  </View>
                </Tap>
              ))}
            </View>
          ) : null}
        </Animated.View>

        {/* transcript */}
        <Animated.View entering={FadeInDown.delay(240).duration(400)}>
          {detail && detail.segments.length > 0 ? (
            <TranscriptList segments={detail.segments} onRetry={retry} retrying={retrying} />
          ) : (
            <Card style={{ gap: space.sm, alignItems: 'center' }}>
              <Ionicons name={loadState === 'offline' ? 'cloud-offline-outline' : 'hourglass-outline'} size={28} color={colors.textFaint} />
              <Text variant="label" color={colors.textMuted} style={{ textAlign: 'center' }}>
                {loadState === 'offline'
                  ? 'اتصال به سرور برقرار نیست؛ متن کلاس بعد از اتصال نمایش داده می‌شود.'
                  : 'متن کلاس بعد از آپلود اولین بخش، اینجا ظاهر می‌شود.'}
              </Text>
            </Card>
          )}
        </Animated.View>

        <Button title="حذف ضبط" icon="trash-outline" variant="danger" onPress={remove} loading={deleting} disabled={isActive} />
      </ScrollView>

      <RenameSheet visible={renaming} initial={title} onClose={() => setRenaming(false)} onSave={rename} />
      <NotePickerSheet visible={picking} onClose={() => setPicking(false)} onPick={attach} />
      <WritingOverlay
        visible={writing !== null}
        lines={writing === 'raw' ? ['در حال افزودن متن به جزوه...', 'مرتب کردن پاراگراف‌ها...'] : undefined}
        hint={writing === 'raw' ? 'متن رونویسی‌شده زیر یک تیتر جدید به جزوه اضافه می‌شود.' : undefined}
      />
    </Screen>
  );
}

function TopBar({ onBack, onRename }: { onBack: () => void; onRename?: () => void }) {
  return (
    <View style={styles.topBar}>
      {/* RTL: "back" points to the right */}
      <IconButton icon="arrow-forward" onPress={onBack} />
      <View style={{ flex: 1 }} />
      {onRename ? <IconButton icon="create-outline" onPress={onRename} /> : null}
    </View>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={colors.textFaint} />
      <Text variant="caption" color={colors.textMuted}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm },
  content: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: 60, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  safeCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actionsRow: { flexDirection: 'row', gap: space.md },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.4)',
  },
});
