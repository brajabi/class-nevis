import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';

import { RichEditor, type RichEditorHandle } from '@/components/editor';
import {
  AiWritingOverlay,
  AttachRecordingSheet,
  ErrorCard,
  Sheet,
  SheetAction,
  showToast,
  ToastHost,
  type AttachMode,
} from '@/components/notes';
import { IconButton, Screen, Tap, Text, type IconName } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  canSaveToFolder,
  copyNoteText,
  createNotePdf,
  savePdfToFolder,
  sharePdf,
  shareNoteText,
  type PdfResult,
} from '@/lib/export';
import { toFa } from '@/lib/format';
import type { NoteDTO, RecordingDTO } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

interface Draft {
  title: string;
  html: string;
  /** device time of the last local edit */
  savedAt: number;
  /** server updatedAt the edits were based on */
  baseUpdatedAt: string | null;
}

const draftKey = (id: string) => `note-draft:${id}`;
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'خطای ناشناخته');
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const UNTITLED = 'جزوه بدون عنوان';

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const editor = useRef<RichEditorHandle>(null);

  const [note, setNote] = useState<NoteDTO | null>(null);
  const [initialHtml, setInitialHtml] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [recTitles, setRecTitles] = useState<Record<string, string>>({});

  const [attachOpen, setAttachOpen] = useState(false);
  const [busy, setBusy] = useState<AttachMode | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pdf, setPdf] = useState<PdfResult | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  // ---------- autosave engine (refs so callbacks never see stale values) ----------
  const cur = useRef({ title: '', html: '' });
  const dirty = useRef<{ title?: boolean; html?: boolean }>({});
  const serverUpdatedAt = useRef<string | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(3000);
  const mounted = useRef(true);

  const isDirty = () => !!(dirty.current.title || dirty.current.html);

  const writeDraft = () => {
    const d: Draft = {
      title: cur.current.title,
      html: cur.current.html,
      savedAt: Date.now(),
      baseUpdatedAt: serverUpdatedAt.current,
    };
    AsyncStorage.setItem(draftKey(id), JSON.stringify(d)).catch(() => {});
  };

  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      saveNow();
    }, ms);
  };

  const saveNow = (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Serialize saves: wait for the in-flight one, then save whatever is newer.
    if (inflight.current) return inflight.current.then(() => saveNow());
    if (!isDirty()) return Promise.resolve(true);

    const body: { title?: string; contentHtml?: string } = {};
    if (dirty.current.title) body.title = cur.current.title.trim() || UNTITLED;
    if (dirty.current.html) body.contentHtml = cur.current.html;
    dirty.current = {};
    if (mounted.current) setStatus('saving');

    const p = api
      .updateNote(id, body)
      .then(
        (res) => {
          retryDelay.current = 3000;
          serverUpdatedAt.current = res.updatedAt;
          if (mounted.current)
            setNote((n) => (n ? { ...n, title: res.title, updatedAt: res.updatedAt, recordingIds: res.recordingIds } : res));
          if (isDirty()) {
            schedule(300);
          } else {
            AsyncStorage.removeItem(draftKey(id)).catch(() => {});
            if (mounted.current) setStatus('saved');
          }
          return true;
        },
        () => {
          // Put the fields back; the local draft still holds them.
          if (body.title !== undefined) dirty.current.title = true;
          if (body.contentHtml !== undefined) dirty.current.html = true;
          if (mounted.current) {
            setStatus('error');
            schedule(retryDelay.current);
            retryDelay.current = Math.min(retryDelay.current * 2, 30000);
          }
          return false;
        },
      )
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = p;
    return p;
  };

  const markChanged = (field: 'title' | 'html', delay: number) => {
    dirty.current[field] = true;
    setStatus((s) => (s === 'saving' ? s : 'pending'));
    writeDraft();
    schedule(delay);
  };

  /** Pull any not-yet-sent edits out of the WebView, then save. */
  const flush = async (): Promise<boolean> => {
    try {
      const h = await editor.current?.getHtml();
      if (h !== undefined && h !== cur.current.html) {
        cur.current.html = h;
        dirty.current.html = true;
        writeDraft();
      }
    } catch {}
    return saveNow();
  };

  // ---------- loading ----------
  const load = async () => {
    setLoading(true);
    setLoadError(null);
    let draft: Draft | null = null;
    try {
      const raw = await AsyncStorage.getItem(draftKey(id));
      if (raw) draft = JSON.parse(raw);
    } catch {}
    try {
      const n = await api.getNote(id);
      serverUpdatedAt.current = n.updatedAt;
      let html = n.contentHtml;
      let t = n.title;
      let restored = false;
      if (draft) {
        const newer = draft.baseUpdatedAt === n.updatedAt || draft.savedAt > Date.parse(n.updatedAt);
        const differs = draft.html !== n.contentHtml || draft.title !== n.title;
        if (newer && differs) {
          html = draft.html;
          t = draft.title;
          dirty.current = { title: draft.title !== n.title, html: draft.html !== n.contentHtml };
          restored = true;
        } else {
          AsyncStorage.removeItem(draftKey(id)).catch(() => {});
        }
      }
      cur.current = { title: t, html };
      setNote(n);
      setTitle(t);
      setInitialHtml(html);
      if (restored) {
        setStatus('pending');
        schedule(800);
        showToast('تغییرات ذخیره‌نشدهٔ قبلی بازیابی شد', 'info');
      } else setStatus('saved');
      if (n.recordingIds.length) loadRecordingTitles();
    } catch (e) {
      if (draft) {
        // Offline but we have local edits: open them and keep retrying.
        cur.current = { title: draft.title, html: draft.html };
        dirty.current = { title: true, html: true };
        serverUpdatedAt.current = draft.baseUpdatedAt;
        setNote({
          id,
          title: draft.title,
          contentHtml: draft.html,
          createdAt: '',
          updatedAt: new Date(draft.savedAt).toISOString(),
          recordingIds: [],
        });
        setTitle(draft.title);
        setInitialHtml(draft.html);
        setStatus('error');
        schedule(retryDelay.current);
        showToast('اتصال برقرار نیست؛ پیش‌نویس محلی باز شد', 'info');
      } else {
        setLoadError(errMsg(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRecordingTitles = async () => {
    try {
      const list = await api.listRecordings();
      const map: Record<string, string> = {};
      list.forEach((r) => (map[r.id] = r.title));
      if (mounted.current) setRecTitles(map);
    } catch {}
  };

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      // Best effort final save; the local draft covers failures.
      if (isDirty()) saveNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Save when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') flush();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaving = useRef(false);
  const goBack = async () => {
    if (leaving.current) return;
    leaving.current = true;
    editor.current?.blur();
    await Promise.race([flush(), wait(2500)]);
    if (router.canGoBack()) router.back();
    else router.replace('/notes');
  };

  // Android hardware back: flush edits first.
  useEffect(() => {
    // Leaving while the AI writes is fine: the server appends the section on its own.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- actions ----------
  const attach = async (rec: RecordingDTO, mode: AttachMode) => {
    setAttachOpen(false);
    editor.current?.blur();
    setBusy(mode);
    // The server appends to its stored content, so local edits must land first.
    const saved = await flush();
    if (!saved) {
      setBusy(null);
      showToast('ابتدا باید تغییرات ذخیره شوند؛ اتصال اینترنت را بررسی کنید', 'error');
      return;
    }
    try {
      const n = await api.attachRecording(id, rec.id, mode);
      cur.current.html = n.contentHtml;
      serverUpdatedAt.current = n.updatedAt;
      editor.current?.setHtml(n.contentHtml);
      setNote(n);
      setRecTitles((m) => ({ ...m, [rec.id]: rec.title }));
      AsyncStorage.removeItem(draftKey(id)).catch(() => {});
      setStatus('saved');
      showToast(mode === 'ai' ? 'بخش تازهٔ جزوه نوشته شد' : 'متن صوت به جزوه اضافه شد');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) showToast('رونویسی این صوت هنوز کامل نشده است', 'error');
      else showToast(`افزودن صوت ناموفق بود: ${errMsg(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const snapshot = async () => {
    try {
      const h = await editor.current?.getHtml();
      if (h !== undefined) cur.current.html = h;
    } catch {}
    return {
      title: cur.current.title.trim() || UNTITLED,
      contentHtml: cur.current.html,
      updatedAt: note?.updatedAt || new Date().toISOString(),
    };
  };

  const makePdf = async (): Promise<PdfResult | null> => {
    setPdfBusy(true);
    try {
      return await createNotePdf(await snapshot());
    } catch (e) {
      showToast('ساخت فایل PDF ناموفق بود', 'error');
      console.warn('pdf failed', e);
      return null;
    } finally {
      setPdfBusy(false);
    }
  };

  const onPdf = async () => {
    editor.current?.blur();
    const p = await makePdf();
    if (p) setPdf(p);
  };

  const onCopy = async () => {
    try {
      await copyNoteText(await snapshot());
      showToast('متن جزوه کپی شد');
    } catch {
      showToast('کپی ناموفق بود', 'error');
    }
  };

  const doSharePdf = async (p: PdfResult) => {
    try {
      await sharePdf(p);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'اشتراک‌گذاری ناموفق بود', 'error');
    }
  };

  const doSaveToFolder = async (p: PdfResult) => {
    setSavingFile(true);
    try {
      const ok = await savePdfToFolder(p);
      if (ok) {
        setPdf(null);
        showToast('فایل PDF در پوشهٔ انتخابی ذخیره شد');
      }
    } catch (e) {
      console.warn('save to folder failed', e);
      showToast('ذخیره در پوشه ناموفق بود', 'error');
    } finally {
      setSavingFile(false);
    }
  };

  // ---------- render ----------
  if (loading || loadError || !note || initialHtml === null) {
    return (
      <Screen>
        <View style={styles.topBar}>
          <IconButton icon="arrow-forward" onPress={() => (router.canGoBack() ? router.back() : router.replace('/notes'))} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: 80 }}>
          {loadError ? (
            <ErrorCard message={loadError} onRetry={load} loading={loading} />
          ) : (
            <Animated.View entering={FadeIn.delay(150)} style={{ alignItems: 'center', gap: space.md }}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text variant="label" color={colors.textMuted}>
                در حال باز کردن جزوه…
              </Text>
            </Animated.View>
          )}
        </View>
        <ToastHost />
      </Screen>
    );
  }

  const actions: { key: string; icon: IconName; label: string; onPress: () => void; loading?: boolean; primary?: boolean }[] = [
    { key: 'audio', icon: 'mic', label: 'افزودن صوت', onPress: () => setAttachOpen(true), primary: true },
    { key: 'pdf', icon: 'document-outline', label: 'خروجی PDF / ذخیره فایل', onPress: onPdf, loading: pdfBusy },
    { key: 'copy', icon: 'copy-outline', label: 'کپی متن', onPress: onCopy },
    { key: 'share', icon: 'share-social-outline', label: 'اشتراک‌گذاری', onPress: () => setShareOpen(true) },
  ];

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(350)} style={styles.topBar}>
        <IconButton icon="arrow-forward" onPress={goBack} />
        <View style={{ flex: 1 }}>
          <TextInput
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              cur.current.title = t;
              markChanged('title', 900);
            }}
            onBlur={() => saveNow()}
            placeholder={UNTITLED}
            placeholderTextColor={colors.textFaint}
            style={styles.title}
            maxLength={120}
            returnKeyType="done"
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            editable={!busy}
          />
          <SaveIndicator status={status} onRetry={() => saveNow()} />
        </View>
      </Animated.View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actions}
        style={{ flexGrow: 0 }}
        keyboardShouldPersistTaps="always">
        {actions.map((a, i) => (
          <Animated.View key={a.key} entering={FadeInDown.delay(60 + i * 50).springify().damping(18)}>
            <Tap onPress={a.onPress} disabled={a.loading || !!busy}>
              {a.primary ? (
                <LinearGradient
                  colors={['rgba(124,92,255,0.35)', 'rgba(34,211,238,0.22)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.chip, { borderColor: 'rgba(124,92,255,0.6)' }]}>
                  <Ionicons name={a.icon} size={16} color={colors.text} />
                  <Text variant="label" style={styles.chipText}>
                    {a.label}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.chip}>
                  {a.loading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name={a.icon} size={16} color={colors.textMuted} />
                  )}
                  <Text variant="label" style={styles.chipText}>
                    {a.label}
                  </Text>
                </View>
              )}
            </Tap>
          </Animated.View>
        ))}
      </ScrollView>

      {note.recordingIds.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.actions, { paddingTop: 0 }]}
          style={{ flexGrow: 0 }}>
          {note.recordingIds.map((rid, i) => (
            <Animated.View key={rid} entering={FadeInUp.delay(i * 40)}>
              <Tap onPress={() => router.push(`/recording/${rid}`)}>
                <View style={styles.recChip}>
                  <Ionicons name="musical-notes" size={13} color={colors.accent} />
                  <Text variant="caption" color={colors.accent} numberOfLines={1} style={{ fontFamily: fonts.medium, maxWidth: 160 }}>
                    {recTitles[rid] || `صوت ${toFa(i + 1)}`}
                  </Text>
                </View>
              </Tap>
            </Animated.View>
          ))}
        </ScrollView>
      ) : null}

      <RichEditor
        ref={editor}
        initialHtml={initialHtml}
        editable={!busy}
        onDirty={() => setStatus((s) => (s === 'saving' ? s : 'pending'))}
        onChange={(html) => {
          cur.current.html = html;
          markChanged('html', 400);
        }}
        onHint={(t) => showToast(t, 'info')}
      />

      <AiWritingOverlay visible={!!busy} mode={busy ?? 'ai'} />

      <AttachRecordingSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        linkedIds={note.recordingIds}
        onPick={attach}
      />

      <Sheet visible={shareOpen} onClose={() => setShareOpen(false)} title="اشتراک‌گذاری جزوه" subtitle="قالب مورد نظر را انتخاب کنید">
        <SheetAction
          index={0}
          icon="document-attach-outline"
          tone="primary"
          title="فایل PDF"
          description="یک فایل مرتب A4 با عنوان و تاریخ"
          loading={pdfBusy}
          onPress={async () => {
            const p = await makePdf();
            setShareOpen(false);
            if (p) doSharePdf(p);
          }}
        />
        <SheetAction
          index={1}
          icon="text-outline"
          tone="accent"
          title="متن ساده"
          description="برای پیام‌رسان‌ها و یادداشت‌ها"
          onPress={async () => {
            setShareOpen(false);
            try {
              await shareNoteText(await snapshot());
            } catch {
              showToast('اشتراک‌گذاری ناموفق بود', 'error');
            }
          }}
        />
      </Sheet>

      <Sheet visible={!!pdf} onClose={() => setPdf(null)} title="فایل PDF آماده است">
        {pdf ? (
          <>
            <Animated.View entering={FadeIn} style={styles.pdfCard}>
              <LinearGradient colors={['#FF4D6D', '#FF7A59']} style={styles.pdfIcon}>
                <Text variant="label" color="#fff" style={{ fontFamily: fonts.black, fontSize: 12 }}>
                  PDF
                </Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text variant="heading" numberOfLines={2} style={{ fontSize: 15 }}>
                  {pdf.fileName}
                </Text>
                <Text variant="caption" color={colors.textMuted}>
                  {toFa(pdf.numberOfPages)} صفحه · A4
                </Text>
              </View>
            </Animated.View>
            {canSaveToFolder ? (
              <SheetAction
                index={0}
                icon="folder-open-outline"
                tone="primary"
                title="ذخیره در پوشه"
                description="یک پوشه در حافظهٔ گوشی انتخاب کنید"
                loading={savingFile}
                onPress={() => doSaveToFolder(pdf)}
              />
            ) : null}
            <SheetAction
              index={1}
              icon="share-outline"
              tone="accent"
              title={canSaveToFolder ? 'اشتراک‌گذاری' : 'اشتراک‌گذاری / ذخیره در فایل‌ها'}
              description="ارسال به برنامه‌های دیگر"
              onPress={() => {
                const p = pdf;
                setPdf(null);
                doSharePdf(p);
              }}
            />
          </>
        ) : null}
      </Sheet>

      <ToastHost />
    </Screen>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <Tap onPress={onRetry} style={styles.status}>
        <Animated.View key="e" entering={FadeIn} style={styles.statusInner}>
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text variant="caption" color={colors.danger} style={{ fontFamily: fonts.medium }}>
            ذخیره نشد — تلاش دوباره
          </Text>
        </Animated.View>
      </Tap>
    );
  }
  const saving = status === 'saving' || status === 'pending';
  return (
    <View style={styles.status}>
      <Animated.View key={saving ? 's' : 'ok'} entering={FadeIn.duration(200)} style={styles.statusInner}>
        {saving ? (
          <ActivityIndicator size={11} color={colors.textMuted} />
        ) : (
          <Ionicons name="cloud-done-outline" size={13} color={colors.success} />
        )}
        <Text variant="caption" color={saving ? colors.textMuted : colors.success}>
          {saving ? 'در حال ذخیره...' : 'ذخیره شد'}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  status: { alignSelf: 'flex-start' },
  statusInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actions: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 13 },
  recChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.25)',
  },
  pdfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.xs,
  },
  pdfIcon: { width: 46, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
