import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Card, IconButton, Tap, Text } from '@/components/ui';
import { formatDuration, toFa } from '@/lib/format';
import { colors, gradients, radius, space } from '@/theme';

export interface PlayerTrack {
  index: number;
  uri: string;
  durationMs: number;
  local: boolean;
}

/**
 * Plays a recording segment-by-segment (local file preferred, server url as fallback) and
 * auto-advances to the next segment.
 */
export function PlayerBar({ tracks, disabledReason }: { tracks: PlayerTrack[]; disabledReason?: string }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState(0);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [barW, setBarW] = useState(1);

  const track = tracks[current];
  const offsetMs = tracks.slice(0, current).reduce((a, t) => a + t.durationMs, 0);
  const totalMs = tracks.reduce((a, t) => a + t.durationMs, 0);

  // load the selected track
  useEffect(() => {
    if (!track || track.uri === loadedUri) return;
    player.replace({ uri: track.uri });
    setLoadedUri(track.uri);
    if (autoplay) player.play();
  }, [track, loadedUri, autoplay, player]);

  // auto-advance: count finish events (a status object can carry didJustFinish more than once)
  const [finished, setFinished] = useState(0);
  const [handled, setHandled] = useState(0);
  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) setFinished((n) => n + 1);
    });
    return () => sub.remove();
  }, [player]);
  useEffect(() => {
    if (finished === handled) return;
    setHandled(finished);
    if (current + 1 < tracks.length) {
      setAutoplay(true);
      setCurrent(current + 1);
    } else {
      setAutoplay(false);
      player.seekTo(0).catch(() => {});
      player.pause();
    }
  }, [finished, handled, current, tracks.length, player]);

  // stop sound when leaving the screen
  useEffect(() => () => {
    try {
      player.pause();
    } catch {}
  }, [player]);

  if (tracks.length === 0) return null;

  const dur = status.duration > 0 ? status.duration : (track?.durationMs ?? 0) / 1000;
  const pos = Math.min(status.currentTime, dur || Infinity);
  const ratio = dur > 0 ? pos / dur : 0;
  const disabled = !!disabledReason;

  const toggle = () => {
    if (disabled) return;
    if (status.playing) {
      player.pause();
      setAutoplay(false);
    } else {
      if (dur > 0 && pos >= dur - 0.25) player.seekTo(0).catch(() => {});
      player.play();
      setAutoplay(true);
    }
  };

  const select = (i: number) => {
    if (disabled) return;
    setAutoplay(true);
    if (i === current) {
      player.seekTo(0).catch(() => {});
      player.play();
    } else setCurrent(i);
  };

  const seek = (x: number) => {
    if (disabled || dur <= 0) return;
    let r = Math.min(1, Math.max(0, x / barW));
    r = 1 - r; // the app is always RTL: the fill grows from the right
    player.seekTo(r * dur).catch(() => {});
  };

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.row}>
        <Tap onPress={toggle} disabled={disabled}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.play}>
            <Ionicons name={status.playing ? 'pause' : 'play'} size={26} color="#fff" style={!status.playing ? { marginLeft: 3 } : undefined} />
          </LinearGradient>
        </Tap>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.rowBetween}>
            <Text variant="label">
              بخش {toFa(track?.index != null ? track.index + 1 : 1)} از {toFa(tracks.length)}
              {track && !track.local ? '  ·  از سرور' : ''}
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              {formatDuration(offsetMs + pos * 1000)} / {formatDuration(totalMs)}
            </Text>
          </View>
          <Pressable
            onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width || 1)}
            onPress={(e) => seek(e.nativeEvent.locationX)}
            hitSlop={{ top: 12, bottom: 12 }}
            style={styles.track}>
            <LinearGradient colors={gradients.primary} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={[styles.fill, { width: `${ratio * 100}%` }]} />
          </Pressable>
          <View style={styles.rowBetween}>
            <Text variant="caption" color={colors.textFaint}>
              {formatDuration(pos * 1000)}
            </Text>
            <Text variant="caption" color={colors.textFaint}>
              {formatDuration(dur * 1000)}
            </Text>
          </View>
        </View>
      </View>
      {disabledReason ? (
        <Text variant="caption" color={colors.warning}>
          {disabledReason}
        </Text>
      ) : null}
      {tracks.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {tracks.map((t, i) => {
            const on = i === current;
            return (
              <Tap key={t.index} onPress={() => select(i)}>
                <View style={[styles.chip, on && styles.chipOn]}>
                  <Ionicons name={on && status.playing ? 'volume-high' : t.local ? 'phone-portrait-outline' : 'cloud-outline'} size={12} color={on ? colors.text : colors.textFaint} />
                  <Text variant="caption" color={on ? colors.text : colors.textMuted}>
                    بخش {toFa(t.index + 1)} · {formatDuration(t.durationMs)}
                  </Text>
                </View>
              </Tap>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.rowEnd}>
        <IconButton icon="play-skip-forward" size={34} onPress={() => current > 0 && select(current - 1)} />
        <IconButton icon="play-skip-back" size={34} onPress={() => current + 1 < tracks.length && select(current + 1)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowEnd: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end', marginTop: -space.xs },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 8, borderRadius: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
});
