/**
 * Recording engine. Lives at module level (not in a component), so navigating around the app
 * can never stop or lose a recording.
 *
 * Segmented recording: audio is recorded in SEGMENT_MS chunks. Rotation order is chosen to
 * minimise the gap AND to always have a durable trail on disk:
 *   1. stop current segment
 *   2. register the finished file in the manifest + persist the next segment's index/fileName
 *   3. prepare + record the next segment
 *   4. move the finished file to recordings/<id>/ and kick the upload queue
 * If anything crashes in between, boot recovery finds the files by their deterministic names.
 */
import {
  AudioModule,
  getRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingStatus as NativeRecordingStatus,
} from 'expo-audio';
import { Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';

import { formatJalaliDate, formatTime } from '@/lib/format';

import { estimateDurationMs, MIN_FREE_BYTES, recordingOptions, SEGMENT_MS } from './constants';
import { baseName, fileStat, listFiles, moveToFinal, recorderFileName, recorderTempDirs } from './paths';
import {
  createLocalRecording,
  normalizeTags,
  getActiveSession,
  getLocalRecording,
  patchActiveSession,
  recordingDurationMs,
  renameLocalRecording,
  setActiveSession,
  updateRecordingMeta,
  updateSegment,
  upsertSegment,
  deleteLocalRecording,
} from './store';
import { requestSync } from './sync';

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping';

export interface RecorderState {
  phase: RecorderPhase;
  recordingId: string | null;
  title: string;
  startedAt: string | null;
  /** index of the segment currently being recorded */
  segmentIndex: number;
  /** number of segments safely saved on the phone for this recording */
  savedSegments: number;
  /** epoch ms of the last saved segment, for "بخش X ذخیره شد" */
  lastSavedAt: number | null;
  /** sum of durations of finished segments */
  completedMs: number;
  /** user-facing problem (recording keeps whatever is saved) */
  error: string | null;
  /** false when the OS-level background service could not be used (e.g. Expo Go) */
  backgroundRecording: boolean;
}

const idleState: RecorderState = {
  phase: 'idle',
  recordingId: null,
  title: '',
  startedAt: null,
  segmentIndex: 0,
  savedSegments: 0,
  lastSavedAt: null,
  completedMs: 0,
  error: null,
  backgroundRecording: true,
};

let state: RecorderState = idleState;
const listeners = new Set<() => void>();
function setState(patch: Partial<RecorderState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const getRecorderState = () => state;
export function subscribeRecorder(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ---------- native recorder (created once, never released) ----------
let recorder: AudioRecorder | null = null;
/** a native segment is prepared/recording (false after a failed restart) */
let segmentLive = false;
let lastOwnStopAt = 0;
let useBackground = true;

function getRecorder(): AudioRecorder {
  if (!recorder) {
    const o = recordingOptions('init');
    // The native constructor wants platform-flattened options (mirrors expo-audio's internal
    // createRecordingOptions used by useAudioRecorder). prepareToRecordAsync gets full options
    // on every segment anyway, so these only matter as defaults.
    const flat = {
      extension: o.extension,
      sampleRate: o.sampleRate,
      numberOfChannels: o.numberOfChannels,
      bitRate: o.bitRate,
      isMeteringEnabled: o.isMeteringEnabled ?? false,
      directory: o.directory,
      fileName: o.fileName,
      ...(Platform.OS === 'ios' ? o.ios : o.android),
    } as unknown as ConstructorParameters<typeof AudioModule.AudioRecorder>[0];
    recorder = new AudioModule.AudioRecorder(flat);
    recorder.addListener('recordingStatusUpdate', onNativeStatus);
  }
  return recorder;
}

function safeStatus() {
  try {
    return recorder ? recorder.getStatus() : null;
  } catch {
    return null;
  }
}

// ---------- serialisation of all recorder operations ----------
let opChain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = opChain.then(fn, fn);
  opChain = p.catch(() => {});
  return p;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function applyAudioMode(recording: boolean) {
  try {
    await setAudioModeAsync({
      allowsRecording: recording,
      playsInSilentMode: true,
      allowsBackgroundRecording: recording && useBackground,
      interruptionMode: recording ? 'doNotMix' : 'mixWithOthers',
      shouldPlayInBackground: false,
    });
  } catch (e) {
    console.warn('[recorder] setAudioMode failed', e);
  }
}

/** Stops whatever the native recorder holds and resets it; never throws. */
async function hardStop() {
  lastOwnStopAt = Date.now();
  try {
    await recorder?.stop();
  } catch {}
  lastOwnStopAt = Date.now();
}

/**
 * Prepare + record one segment with retries. When the Android foreground service is not
 * available (Expo Go / plugin not configured), falls back to foreground-only recording.
 */
async function startNativeSegment(fileName: string) {
  const rec = getRecorder();
  const delays = [0, 300, 1000, 2500];
  let lastErr: unknown = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await sleep(delays[i]);
    try {
      await rec.prepareToRecordAsync(recordingOptions(fileName));
      rec.record();
      if (!rec.isRecording && !safeStatus()?.isRecording) throw new Error('recorder did not start');
      segmentLive = true;
      return rec.uri || null;
    } catch (e) {
      lastErr = e;
      console.warn('[recorder] start attempt failed', i, e);
      await hardStop();
      // Most likely cause: the background-recording foreground service is unavailable
      // (Expo Go / config plugin missing) → retry without it.
      const msg = String((e as Error)?.message ?? e);
      if (useBackground && (/service/i.test(msg) || i >= 1)) {
        useBackground = false;
        setState({ backgroundRecording: false });
        await applyAudioMode(true);
      }
    }
  }
  segmentLive = false;
  throw lastErr ?? new Error('start failed');
}

/** Begins segment `index` of the active recording. State is persisted BEFORE the mic starts. */
async function beginSegment(recordingId: string, wantedIndex: number) {
  // Never reuse an index that already has audio (registered or lying in a temp dir):
  // preparing the recorder with an existing fileName would overwrite that file.
  let index = wantedIndex;
  while (indexTaken(recordingId, index)) index++;
  const fileName = recorderFileName(recordingId, index);
  await setActiveSession({ recordingId, segmentIndex: index, fileName, segmentStartedAt: new Date().toISOString() });
  setState({ segmentIndex: index });
  const uri = await startNativeSegment(fileName);
  if (uri) void patchActiveSession({ expectedUri: uri });
}

function indexTaken(recordingId: string, index: number): boolean {
  if (getLocalRecording(recordingId)?.segments.some((s) => s.index === index)) return true;
  const prefix = recorderFileName(recordingId, index) + '.';
  return recorderTempDirs().some((d) => listFiles(d).some((f) => f.name.startsWith(prefix) && fileStat(f.uri).size > 0));
}

/** Finds the file of the segment that was just stopped (recorder uri first, then by name). */
function locateSegmentFile(fileName: string, hint: string | null): string | null {
  // the hint must really be THIS segment's file (the native recorder keeps the previous path
  // around after a failed start)
  if (hint && baseName(hint).startsWith(fileName + '.')) {
    const h = fileStat(hint);
    if (h.exists && h.size > 0) return hint;
  }
  for (const d of recorderTempDirs()) {
    for (const f of listFiles(d)) {
      if (f.name.startsWith(fileName + '.')) {
        const st = fileStat(f.uri);
        if (st.size > 0) return f.uri;
      }
    }
  }
  return null;
}

/**
 * Stops the current native segment and registers its file in the manifest (still at the
 * temp location, flagged pendingMove). Returns the registered index/uri, or null if empty.
 */
async function closeCurrentSegment(): Promise<{ index: number; uri: string } | null> {
  const active = getActiveSession();
  if (!active) return null;
  const st = safeStatus();
  const durationMs = st?.durationMillis ?? 0;
  const hint = recorder?.uri || st?.url || active.expectedUri || null;
  if (segmentLive) await hardStop();
  segmentLive = false;

  const uri = locateSegmentFile(active.fileName, hint);
  if (!uri) return null;
  const size = fileStat(uri).size;
  const estimated = !durationMs;
  await upsertSegment(active.recordingId, {
    index: active.segmentIndex,
    uri,
    durationMs: durationMs || estimateDurationMs(size),
    sizeBytes: size,
    uploaded: false,
    estimated: estimated || undefined,
    pendingMove: true,
  });
  const r = getLocalRecording(active.recordingId);
  setState({
    savedSegments: r?.segments.length ?? state.savedSegments + 1,
    lastSavedAt: Date.now(),
    completedMs: r ? recordingDurationMs(r) : state.completedMs + durationMs,
  });
  return { index: active.segmentIndex, uri };
}

async function finalizeFile(recordingId: string, seg: { index: number; uri: string } | null) {
  if (!seg) return;
  const uri = await moveToFinal(recordingId, seg.index, seg.uri);
  await updateSegment(recordingId, seg.index, { uri, pendingMove: false, sizeBytes: fileStat(uri).size || undefined });
  requestSync();
}

// ---------- rotation & watchdog ----------
let ticker: ReturnType<typeof setInterval> | null = null;
let deadTicks = 0;

function startTicker() {
  if (ticker) return;
  ticker = setInterval(tick, 1000);
}
function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function tick() {
  if (state.phase !== 'recording' || !segmentLive) return;
  const st = safeStatus();
  if (!st) return;
  // Native recorder died without telling us (two ticks in a row, to let events win the race).
  if (!st.canRecord && !st.isRecording) {
    if (++deadTicks >= 2) {
      deadTicks = 0;
      void exclusive(() => recoverSegment('ضبط به‌طور ناگهانی قطع شد؛ ادامه در بخش جدید'));
    }
    return;
  }
  deadTicks = 0;
  // Android: JS timers don't run in background, and restarting the mic foreground service from
  // background is not allowed — so only rotate while the app is in the foreground. While in
  // background the current segment simply grows longer (nothing is lost).
  if (Platform.OS === 'android' && AppState.currentState !== 'active') return;
  if (st.durationMillis >= SEGMENT_MS) void exclusive(rotate);
}

async function rotate() {
  if (state.phase !== 'recording' || !segmentLive) return;
  const active = getActiveSession();
  if (!active) return;
  const st = safeStatus();
  if (!st || st.durationMillis < SEGMENT_MS) return;
  const finished = await closeCurrentSegment();
  try {
    await beginSegment(active.recordingId, active.segmentIndex + 1);
    setState({ error: null });
  } catch (e) {
    console.warn('[recorder] could not start next segment', e);
    setState({ phase: 'paused', error: 'شروع بخش بعدی ضبط ممکن نشد. صدای قبلی ذخیره شده است؛ برای ادامه «ادامه» را بزنید.' });
  }
  await finalizeFile(active.recordingId, finished);
}

/** Native error: keep what exists and continue in a fresh segment. */
async function recoverSegment(message: string) {
  if (state.phase !== 'recording' && state.phase !== 'paused') return;
  const active = getActiveSession();
  if (!active) return;
  const wasPaused = state.phase === 'paused';
  const finished = await closeCurrentSegment();
  if (!wasPaused) {
    try {
      await beginSegment(active.recordingId, active.segmentIndex + 1);
      setState({ error: message });
    } catch {
      setState({ phase: 'paused', error: 'میکروفون در دسترس نیست. صدای ضبط‌شده ذخیره شده است؛ برای ادامه «ادامه» را بزنید.' });
    }
  } else {
    // will start a new segment on resume
    await patchActiveSession({ segmentIndex: active.segmentIndex + 1, fileName: recorderFileName(active.recordingId, active.segmentIndex + 1) });
    setState({ segmentIndex: active.segmentIndex + 1, error: message });
  }
  await finalizeFile(active.recordingId, finished);
}

function onNativeStatus(s: NativeRecordingStatus) {
  if (!s.isFinished && !s.hasError) return;
  // our own stop() emits a finish event as well
  if (Date.now() - lastOwnStopAt < 2500) return;
  void exclusive(async () => {
    if (state.phase !== 'recording' && state.phase !== 'paused') return;
    if (s.hasError) {
      await recoverSegment('خطای میکروفون رخ داد؛ ضبط در بخش جدید ادامه پیدا کرد');
    } else if (!safeStatus()?.canRecord) {
      // stopped from outside (e.g. "Stop" in the Android notification) → treat as user stop
      await stopInternal();
    }
  });
}

// ---------- permissions ----------
function ask(title: string, message: string, ok: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'بعداً', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

async function ensurePermissions(): Promise<boolean> {
  let perm = await getRecordingPermissionsAsync();
  if (!perm.granted) {
    if (perm.canAskAgain) {
      if (perm.status === 'undetermined') {
        const go = await ask(
          'دسترسی به میکروفون',
          'کلاس‌نویس برای ضبط صدای کلاس به میکروفون نیاز دارد. صدا فقط روی گوشی شما ذخیره و برای رونویسی به فضای ابری خودتان فرستاده می‌شود.',
          'اجازه می‌دهم',
        );
        if (!go) return false;
      }
      perm = await requestRecordingPermissionsAsync();
    }
    if (!perm.granted) {
      const open = await ask(
        'میکروفون غیرفعال است',
        'دسترسی به میکروفون داده نشده است. لطفاً از تنظیمات گوشی، دسترسی میکروفون را برای کلاس‌نویس روشن کنید.',
        'باز کردن تنظیمات',
      );
      if (open) Linking.openSettings().catch(() => {});
      return false;
    }
  }
  if (Platform.OS === 'android') {
    // Needed on Android 13+ to show the "recording" notification of the background service.
    try {
      await requestNotificationPermissionsAsync();
    } catch {}
  }
  return true;
}

function hasEnoughSpace(): boolean {
  try {
    const free = Paths.availableDiskSpace;
    return !(typeof free === 'number' && free > 0 && free < MIN_FREE_BYTES);
  } catch {
    return true;
  }
}

// ---------- public API ----------
export function defaultRecordingTitle(date = new Date()) {
  return `کلاس ${formatJalaliDate(date)}، ${formatTime(date)}`;
}

export function startRecording(title?: string, tags: string[] = []): Promise<boolean> {
  return exclusive(async () => {
    if (state.phase !== 'idle') return false;
    setState({ ...idleState, phase: 'starting', backgroundRecording: useBackground });
    try {
      if (!(await ensurePermissions())) {
        setState({ phase: 'idle' });
        return false;
      }
      if (!hasEnoughSpace()) {
        const go = await ask('حافظه گوشی کم است', 'فضای خالی گوشی کم است و ممکن است ضبط طولانی جا نشود. باز هم شروع شود؟', 'شروع ضبط');
        if (!go) {
          setState({ phase: 'idle' });
          return false;
        }
      }
      const now = new Date();
      const id = Crypto.randomUUID();
      const t = title?.trim() || defaultRecordingTitle(now);
      await createLocalRecording({ id, title: t, startedAt: now.toISOString(), tags: normalizeTags(tags) });
      setState({ recordingId: id, title: t, startedAt: now.toISOString() });
      await applyAudioMode(true);
      activateKeepAwakeAsync('classnevis-recording').catch(() => {});
      try {
        await beginSegment(id, 0);
      } catch (e) {
        console.warn('[recorder] start failed', e);
        const leftover = await closeCurrentSegment();
        await finalizeFile(id, leftover);
        await updateRecordingMeta(id, { status: 'interrupted', endedAt: new Date().toISOString() });
        await setActiveSession(null);
        const r = getLocalRecording(id);
        if (r && r.segments.length === 0) await deleteLocalRecording(id).catch(() => {}); // nothing was recorded
        deactivateKeepAwake('classnevis-recording').catch(() => {});
        await applyAudioMode(false);
        setState({ ...idleState, error: 'شروع ضبط ممکن نشد. لطفاً دوباره تلاش کنید.' });
        return false;
      }
      setState({ phase: 'recording', error: null });
      startTicker();
      return true;
    } catch (e) {
      console.warn('[recorder] start error', e);
      setState({ phase: 'idle', error: 'شروع ضبط ممکن نشد.' });
      return false;
    }
  });
}

export function pauseRecording(): Promise<void> {
  return exclusive(async () => {
    if (state.phase !== 'recording') return;
    try {
      recorder?.pause();
    } catch (e) {
      console.warn('[recorder] pause failed', e);
    }
    setState({ phase: 'paused' });
  });
}

export function resumeRecording(): Promise<void> {
  return exclusive(async () => {
    if (state.phase !== 'paused') return;
    const active = getActiveSession();
    if (!active) return;
    try {
      if (segmentLive && safeStatus()?.canRecord) {
        recorder?.record();
      } else {
        // previous segment was closed (error) → start a fresh one
        await beginSegment(active.recordingId, active.segmentIndex);
      }
      setState({ phase: 'recording', error: null });
      startTicker();
    } catch (e) {
      console.warn('[recorder] resume failed', e);
      // the paused segment may be broken: save it and start a new one
      try {
        const finished = await closeCurrentSegment();
        await beginSegment(active.recordingId, active.segmentIndex + 1);
        setState({ phase: 'recording', error: null });
        startTicker();
        await finalizeFile(active.recordingId, finished);
      } catch {
        setState({ error: 'ادامه ضبط ممکن نشد. صدای ضبط‌شده امن است؛ دوباره امتحان کنید یا ضبط را تمام کنید.' });
      }
    }
  });
}

async function stopInternal() {
  const active = getActiveSession();
  setState({ phase: 'stopping' });
  stopTicker();
  const finished = await closeCurrentSegment();
  if (active) {
    await updateRecordingMeta(active.recordingId, { status: 'complete', endedAt: new Date().toISOString() });
    await setActiveSession(null);
    await finalizeFile(active.recordingId, finished);
  }
  deactivateKeepAwake('classnevis-recording').catch(() => {});
  await applyAudioMode(false);
  setState({ ...idleState, backgroundRecording: useBackground });
  requestSync();
}

export function stopRecording(): Promise<string | null> {
  return exclusive(async () => {
    if (state.phase !== 'recording' && state.phase !== 'paused') return null;
    const id = state.recordingId;
    await stopInternal();
    return id;
  });
}

export function renameActiveRecording(title: string): Promise<void> {
  const t = title.trim();
  if (!t) return Promise.resolve();
  setState({ title: t });
  if (state.recordingId) {
    const p = renameLocalRecording(state.recordingId, t);
    requestSync();
    return p;
  }
  return Promise.resolve();
}

export function clearRecorderError() {
  setState({ error: null });
}

/** Total recorded time of the active recording (finished segments + live one). */
export function getElapsedMs(): number {
  if (state.phase === 'idle') return 0;
  const live = segmentLive ? (safeStatus()?.durationMillis ?? 0) : 0;
  return state.completedMs + live;
}

/** Live input level in dBFS (-160…0); -160 when not recording. */
export function getLiveMetering(): number {
  if (state.phase !== 'recording' || !segmentLive) return -160;
  const m = safeStatus()?.metering;
  return typeof m === 'number' && Number.isFinite(m) ? m : -160;
}

AppState.addEventListener('change', (s) => {
  if (s === 'active' && state.phase === 'recording') tick();
});

// ---------- hook ----------
export interface ClassRecorder extends RecorderState {
  elapsedMs: number;
  isActive: boolean;
  start: (title?: string, tags?: string[]) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<string | null>;
  rename: (title: string) => Promise<void>;
  clearError: () => void;
}

export function useClassRecorder(pollMs = 250): ClassRecorder {
  const s = useSyncExternalStore(subscribeRecorder, getRecorderState);
  const [elapsedMs, setElapsed] = useState(0);
  const active = s.phase !== 'idle';
  useEffect(() => {
    setElapsed(getElapsedMs());
    if (!active) return;
    const t = setInterval(() => setElapsed(getElapsedMs()), pollMs);
    return () => clearInterval(t);
  }, [active, s.phase, s.completedMs, pollMs]);
  return {
    ...s,
    elapsedMs,
    isActive: active,
    start: startRecording,
    pause: pauseRecording,
    resume: resumeRecording,
    stop: stopRecording,
    rename: renameActiveRecording,
    clearError: clearRecorderError,
  };
}
