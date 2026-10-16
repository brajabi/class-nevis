import { useEffect } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { getLiveMetering } from '@/lib/recorder';

export const WAVE_BARS = 34;

/** dBFS → 0..1 with a curve that makes normal speech look lively. */
export function dbToLevel(db: number) {
  const n = Math.min(1, Math.max(0, (db + 55) / 50));
  return Math.pow(n, 1.4);
}

/**
 * Polls the recorder's metering and exposes it to the UI thread:
 * `level` (smoothed 0..1) and `history` (rolling window for waveform bars).
 */
export function useLiveLevel(active: boolean): { level: SharedValue<number>; history: SharedValue<number[]> } {
  const level = useSharedValue(0);
  const history = useSharedValue<number[]>(new Array(WAVE_BARS).fill(0));

  useEffect(() => {
    if (!active) {
      level.value = 0;
      history.value = new Array(WAVE_BARS).fill(0);
      return;
    }
    let smooth = 0;
    const t = setInterval(() => {
      const target = dbToLevel(getLiveMetering());
      // fast attack, slower release
      smooth = target > smooth ? smooth * 0.35 + target * 0.65 : smooth * 0.75 + target * 0.25;
      level.value = smooth;
      const next = history.value.slice(1);
      next.push(smooth);
      history.value = next;
    }, 90);
    return () => clearInterval(t);
  }, [active, level, history]);

  return { level, history };
}
