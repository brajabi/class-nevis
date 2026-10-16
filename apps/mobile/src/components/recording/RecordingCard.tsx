import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Tap, Text } from '@/components/ui';
import { formatDate, formatDuration } from '@/lib/format';
import { colors, gradients, radius, space } from '@/theme';

import type { BadgeSpec } from './badges';
import { TagChip } from './Tags';

export function RecordingCard({
  title,
  startedAt,
  durationMs,
  badges,
  onPress,
  index = 0,
  live = false,
  tags = [],
}: {
  title: string;
  startedAt: string;
  durationMs: number;
  badges: BadgeSpec[];
  onPress: () => void;
  index?: number;
  live?: boolean;
  tags?: string[];
}) {
  return (
    <Tap onPress={onPress}>
      <Card index={index} style={styles.card}>
        <View style={styles.row}>
          <LinearGradient
            colors={live ? gradients.record : ['rgba(124,92,255,0.28)', 'rgba(34,211,238,0.14)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.icon}>
            <Ionicons name={live ? 'mic' : 'pulse'} size={22} color={live ? '#fff' : colors.text} />
          </LinearGradient>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.meta}>
              <Ionicons name="calendar-outline" size={12} color={colors.textFaint} />
              <Text variant="caption" color={colors.textMuted}>
                {formatDate(startedAt)}
              </Text>
              <View style={styles.dot} />
              <Ionicons name="time-outline" size={12} color={colors.textFaint} />
              <Text variant="caption" color={colors.textMuted}>
                {formatDuration(durationMs)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
        </View>
        {badges.length > 0 || tags.length > 0 ? (
          <View style={styles.badges}>
            {tags.map((t) => (
              <TagChip key={`tag:${t}`} label={t} icon="pricetag" size="sm" selected />
            ))}
            {badges.map((b) => (
              <Badge key={b.label} label={b.label} tone={b.tone} icon={b.icon} />
            ))}
          </View>
        ) : null}
      </Card>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textFaint, marginHorizontal: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
