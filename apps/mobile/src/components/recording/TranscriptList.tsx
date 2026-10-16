import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Badge, Button, Text, type BadgeTone, type IconName } from '@/components/ui';
import { formatDuration, toFa } from '@/lib/format';
import type { SegmentDTO, TranscriptStatus } from '@/lib/types';
import { colors, radius, space } from '@/theme';

const STATUS: Record<TranscriptStatus, { label: string; tone: BadgeTone; icon: IconName }> = {
  PENDING: { label: 'در صف رونویسی', tone: 'neutral', icon: 'time-outline' },
  PROCESSING: { label: 'در حال رونویسی', tone: 'accent', icon: 'sparkles-outline' },
  DONE: { label: 'رونویسی شد', tone: 'success', icon: 'checkmark-circle' },
  FAILED: { label: 'خطا', tone: 'danger', icon: 'alert-circle' },
};

export function TranscriptList({
  segments,
  onRetry,
  retrying,
}: {
  segments: SegmentDTO[];
  onRetry: () => void;
  retrying: boolean;
}) {
  const sorted = segments.slice().sort((a, b) => a.index - b.index);
  const failed = sorted.filter((s) => s.transcriptStatus === 'FAILED').length;
  const done = sorted.filter((s) => s.transcriptStatus === 'DONE').length;

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.headRow}>
        <Text variant="heading">متن کلاس</Text>
        <Text variant="caption" color={colors.textMuted}>
          {toFa(done)} از {toFa(sorted.length)} بخش
        </Text>
      </View>
      {failed > 0 ? (
        <View style={styles.failBox}>
          <Text variant="label" color={colors.danger} style={{ flex: 1 }}>
            رونویسی {toFa(failed)} بخش ناموفق بود.
          </Text>
          <Button title="تلاش دوباره" icon="refresh" size="sm" variant="danger" onPress={onRetry} loading={retrying} />
        </View>
      ) : null}
      {sorted.map((s, i) => {
        const st = STATUS[s.transcriptStatus];
        return (
          <Animated.View key={s.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)} style={styles.seg}>
            <View style={styles.headRow}>
              <Text variant="label" color={colors.textMuted}>
                بخش {toFa(s.index + 1)} · {formatDuration(s.durationMs)}
              </Text>
              <Badge label={st.label} tone={st.tone} icon={st.icon} />
            </View>
            {s.transcriptStatus === 'DONE' && s.transcript ? (
              <Text variant="body" selectable style={{ lineHeight: 28 }}>
                {s.transcript}
              </Text>
            ) : s.transcriptStatus === 'DONE' ? (
              <Text variant="caption" color={colors.textFaint}>
                (در این بخش گفتاری شناسایی نشد)
              </Text>
            ) : s.transcriptStatus === 'FAILED' ? (
              <Text variant="caption" color={colors.danger}>
                {s.error ?? 'خطای نامشخص'}
              </Text>
            ) : (
              <View style={styles.skeleton}>
                <View style={[styles.line, { width: '92%' }]} />
                <View style={[styles.line, { width: '76%' }]} />
                <View style={[styles.line, { width: '58%' }]} />
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  seg: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  failBox: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(248,113,113,0.10)' },
  skeleton: { gap: 8, paddingVertical: 4 },
  line: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceHigh },
});
