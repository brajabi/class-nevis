import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  RecordButton,
  RecordingCard,
  RenameSheet,
  SyncBadge,
  TagPicker,
  Waveform,
  recordingBadges,
  useLiveLevel,
} from '@/components/recording';
import { Sheet } from '@/components/notes';
import { Badge, Button, Card, Header, IconButton, Screen, Tap, Text, inputStyle } from '@/components/ui';
import { formatDuration, toFa } from '@/lib/format';
import {
  defaultRecordingTitle,
  recordingDurationMs,
  setLocalRecordingTags,
  useAllTags,
  useClassRecorder,
  useLocalRecordings,
} from '@/lib/recorder';
import { colors, fonts, radius, space } from '@/theme';

function LiveDot({ on }: { on: boolean }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = on ? withRepeat(withSequence(withTiming(0.2, { duration: 600 }), withTiming(1, { duration: 600 })), -1) : withTiming(1);
  }, [on, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.liveDot, style, !on && { backgroundColor: colors.warning }]} />;
}

function Timer({ ms, paused }: { ms: number; paused: boolean }) {
  const blink = useSharedValue(1);
  const bump = useSharedValue(1);
  const seconds = Math.floor(ms / 1000);
  useEffect(() => {
    blink.value = paused ? withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1) : withTiming(1);
  }, [paused, blink]);
  useEffect(() => {
    if (paused) return;
    bump.value = withSequence(withTiming(1.025, { duration: 90 }), withTiming(1, { duration: 260 }));
  }, [seconds, paused, bump]);
  const style = useAnimatedStyle(() => ({ opacity: blink.value, transform: [{ scale: bump.value }] }));
  return (
    <Animated.View style={style}>
      <Text style={styles.timer}>{formatDuration(ms)}</Text>
    </Animated.View>
  );
}

const TIPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'phone-portrait-outline', text: 'گوشی را تا جای ممکن نزدیک استاد یا بلندگوی کلاس بگذارید.' },
  { icon: 'save-outline', text: 'صدا هر دو دقیقه یک‌بار به‌صورت جداگانه روی گوشی ذخیره می‌شود؛ حتی اگر برنامه بسته شود چیزی از دست نمی‌رود.' },
  { icon: 'cloud-upload-outline', text: 'نیازی به اینترنت دائمی نیست؛ هر وقت وصل شوید، بخش‌ها خودکار آپلود و رونویسی می‌شوند.' },
];

export default function RecordScreen() {
  const rec = useClassRecorder();
  const recordings = useLocalRecordings();
  const [draftTitle, setDraftTitle] = useState('');
  // sticky between recordings: consecutive classes are usually the same course
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const allTags = useAllTags();
  const [renaming, setRenaming] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const { level, history } = useLiveLevel(rec.phase === 'recording');

  const active = rec.isActive;
  const paused = rec.phase === 'paused';
  const recent = recordings.filter((r) => r.id !== rec.recordingId).slice(0, 3);
  const activeLocal = recordings.find((r) => r.id === rec.recordingId);

  useEffect(() => {
    if (rec.error) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [rec.error]);

  const onMainPress = async () => {
    if (rec.phase === 'idle') {
      setJustSaved(null);
      const ok = await rec.start(draftTitle, draftTags);
      if (ok) setDraftTitle('');
    } else if (rec.phase === 'recording') await rec.pause();
    else if (rec.phase === 'paused') await rec.resume();
  };

  const onStop = () => {
    Alert.alert('پایان ضبط؟', 'ضبط تمام می‌شود و همه بخش‌ها روی گوشی ذخیره و برای رونویسی آپلود می‌شوند.', [
      { text: 'ادامه ضبط', style: 'cancel' },
      {
        text: 'پایان و ذخیره',
        style: 'destructive',
        onPress: async () => {
          const id = await rec.stop();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (id) setJustSaved(id);
        },
      },
    ]);
  };

  const statusLine =
    rec.phase === 'starting'
      ? 'در حال آماده‌سازی میکروفون...'
      : rec.phase === 'stopping'
        ? 'در حال ذخیره آخرین بخش...'
        : paused
          ? 'ضبط موقتاً متوقف شده است'
          : active
            ? 'در حال ضبط صدای کلاس'
            : 'برای شروع، دکمه را لمس کنید';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Header
          title="ضبط کلاس"
          subtitle="صدای کلاس را ضبط کنید، جزوه تحویل بگیرید"
          right={<IconButton icon="information-circle-outline" onPress={() => setInfoOpen(true)} />}
        />

        {/* title */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.section}>
          {active ? (
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color={colors.textFaint}>
                  عنوان ضبط
                </Text>
                <Text variant="heading" numberOfLines={1}>
                  {rec.title}
                </Text>
              </View>
              <IconButton icon="create-outline" onPress={() => setRenaming(true)} />
            </View>
          ) : (
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder={defaultRecordingTitle()}
              placeholderTextColor={colors.textFaint}
              style={inputStyle}
              maxLength={120}
              returnKeyType="done"
            />
          )}
        </Animated.View>

        {/* tags: for a new recording, or the one being recorded */}
        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
          <TagPicker
            selected={active ? (activeLocal?.tags ?? []) : draftTags}
            allTags={allTags}
            onChange={(tags) => {
              if (active && rec.recordingId) void setLocalRecordingTags(rec.recordingId, tags);
              else setDraftTags(tags);
            }}
          />
        </Animated.View>

        {/* main control */}
        <View style={styles.stage}>
          <RecordButton phase={rec.phase} level={level} onPress={onMainPress} />
          <View style={styles.statusPill}>
            {active ? <LiveDot on={!paused} /> : null}
            <Text variant="label" color={active ? colors.text : colors.textMuted}>
              {statusLine}
            </Text>
          </View>
          <Timer ms={rec.elapsedMs} paused={paused || !active} />
          <View style={{ height: 60, justifyContent: 'center' }}>
            {active ? (
              <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)}>
                <Waveform history={history} paused={paused} />
              </Animated.View>
            ) : null}
          </View>
        </View>

        {active ? (
          <Animated.View entering={FadeInUp.springify().damping(18)} exiting={FadeOut} layout={LinearTransition} style={styles.controls}>
            <Button
              title={paused ? 'ادامه' : 'توقف موقت'}
              icon={paused ? 'play' : 'pause'}
              variant="secondary"
              size="lg"
              onPress={paused ? rec.resume : rec.pause}
              disabled={rec.phase === 'starting' || rec.phase === 'stopping'}
              style={{ flex: 1 }}
            />
            <Button title="پایان و ذخیره" icon="stop" variant="record" size="lg" onPress={onStop} disabled={rec.phase === 'stopping'} style={{ flex: 1 }} />
          </Animated.View>
        ) : null}

        {/* compact status: details live in the info sheet */}
        <Animated.View entering={FadeInDown.delay(160).duration(450)} layout={LinearTransition}>
          <Tap onPress={() => setInfoOpen(true)} style={styles.chips}>
            <SyncBadge />
            {active ? (
              <Badge
                label={rec.savedSegments > 0 ? `بخش ${toFa(rec.savedSegments)} ذخیره شد` : 'بخش اول در حال ضبط'}
                tone="primary"
                icon="save-outline"
              />
            ) : null}
            {active && !rec.backgroundRecording ? <Badge label="برنامه را باز نگه دارید" tone="warning" icon="alert-circle-outline" /> : null}
          </Tap>
        </Animated.View>

        {rec.error ? (
          <Animated.View entering={FadeInDown} exiting={FadeOut} style={styles.errorBox}>
            <Ionicons name="warning" size={18} color={colors.warning} />
            <Text variant="label" color={colors.warning} style={{ flex: 1 }}>
              {rec.error}
            </Text>
            <IconButton icon="close" size={30} onPress={rec.clearError} />
          </Animated.View>
        ) : null}

        {justSaved && !active ? (
          <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut} style={styles.h}>
            <Card style={styles.savedCard}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text variant="heading" style={{ fontSize: 15 }}>
                  ضبط ذخیره شد
                </Text>
                <Text variant="caption" color={colors.textMuted}>
                  بخش‌ها در حال آپلود و رونویسی هستند.
                </Text>
              </View>
              <Button title="مشاهده" size="sm" onPress={() => router.push(`/recording/${justSaved}`)} />
            </Card>
          </Animated.View>
        ) : null}

        {!active ? (
          <>
            {recent.length > 0 ? (
              <View style={[styles.h, { gap: space.md }]}>
                <View style={styles.sectionHead}>
                  <Text variant="heading" numberOfLines={1}>
                    ضبط‌های اخیر
                  </Text>
                  <Button title="همه" size="sm" variant="ghost" onPress={() => router.push('/recordings')} />
                </View>
                {recent.map((r, i) => (
                  <RecordingCard
                    key={r.id}
                    index={i}
                    title={r.title}
                    tags={r.tags}
                    startedAt={r.startedAt}
                    durationMs={recordingDurationMs(r)}
                    badges={recordingBadges(r, undefined, false)}
                    onPress={() => router.push(`/recording/${r.id}`)}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={infoOpen} onClose={() => setInfoOpen(false)} title="راهنمای ضبط" subtitle="صداهای شما چطور امن می‌مانند" scroll>
        <View style={styles.infoBlock}>
          <View style={styles.statusRow}>
            <View style={styles.statusIcon}>
              <Ionicons name="shield-checkmark" size={20} color={colors.success} />
            </View>
            <Text variant="heading" style={{ flex: 1, fontSize: 15 }}>
              صدای شما روی همین گوشی امن است
            </Text>
          </View>
          <Text variant="caption" color={colors.textMuted} style={{ lineHeight: 21 }}>
            صدا لحظه‌به‌لحظه روی حافظه گوشی نوشته می‌شود و هر ضبط تا وقتی خودتان پاکش نکنید روی گوشی می‌ماند. قطع اینترنت، بسته شدن
            برنامه یا تمام شدن شارژ باعث از دست رفتن بخش‌های ذخیره‌شده نمی‌شود.
          </Text>
          <SyncBadge />
          {active ? (
            <Text variant="caption" color={colors.textFaint}>
              {`در حال ضبط بخش ${toFa(rec.segmentIndex + 1)} · هر بخش حداکثر ۲ دقیقه`}
              {activeLocal ? ` · ${toFa(activeLocal.segments.filter((s) => s.uploaded).length)} بخش به سرور رسیده` : ''}
            </Text>
          ) : null}
          {active && !rec.backgroundRecording ? (
            <View style={styles.warnInline}>
              <Ionicons name="information-circle" size={16} color={colors.warning} />
              <Text variant="caption" color={colors.warning} style={{ flex: 1 }}>
                ضبط در پس‌زمینه در این نسخه در دسترس نیست؛ لطفاً برنامه را باز نگه دارید.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.statusRow}>
            <Ionicons name="bulb" size={18} color={colors.accent} />
            <Text variant="heading" style={{ fontSize: 15 }}>
              چند نکته برای ضبط بهتر
            </Text>
          </View>
          {TIPS.map((t) => (
            <View key={t.text} style={styles.tip}>
              <Ionicons name={t.icon} size={16} color={colors.textMuted} style={{ marginTop: 3 }} />
              <Text variant="caption" color={colors.textMuted} style={{ flex: 1, lineHeight: 20 }}>
                {t.text}
              </Text>
            </View>
          ))}
        </View>
      </Sheet>

      <RenameSheet visible={renaming} initial={rec.title} onClose={() => setRenaming(false)} onSave={(t) => rec.rename(t)} title="عنوان این ضبط" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120, gap: space.lg },
  section: { paddingHorizontal: space.xl },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  stage: { alignItems: 'center', marginTop: -space.md },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: -space.lg,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.record },
  timer: {
    fontFamily: fonts.black,
    fontSize: 54,
    lineHeight: 72,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: space.sm,
  },
  controls: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.xl,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  statusIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  warnInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tip: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { marginHorizontal: space.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.xl },
  infoBlock: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
