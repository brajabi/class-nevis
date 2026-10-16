import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Sheet } from '@/components/notes';
import { Button, Tap, Text, inputStyle } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme';

/** One pill. `selected` fills it with the primary color. */
export function TagChip({
  label,
  selected,
  onPress,
  icon,
  size = 'md',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
}) {
  const small = size === 'sm';
  const body = (
    <Animated.View
      layout={LinearTransition.springify().damping(18)}
      style={[styles.chip, small && styles.chipSm, selected && styles.chipOn]}>
      {icon ? <Ionicons name={icon} size={small ? 11 : 14} color={selected ? colors.text : colors.textMuted} /> : null}
      <Text
        variant="caption"
        numberOfLines={1}
        color={selected ? colors.text : colors.textMuted}
        style={{ fontFamily: selected ? fonts.bold : fonts.medium, fontSize: small ? 11 : 13 }}>
        {label}
      </Text>
    </Animated.View>
  );
  return onPress ? <Tap onPress={onPress}>{body}</Tap> : body;
}

/** Read-only row of a recording's tags (cards, headers). */
export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <View style={styles.wrap}>
      {tags.map((t) => (
        <TagChip key={t} label={t} icon="pricetag" size="sm" selected />
      ))}
    </View>
  );
}

/**
 * Horizontal multi-select: every known tag plus the selected ones, and a "+" chip that
 * opens a sheet to type a new tag.
 */
export function TagPicker({
  selected,
  allTags,
  onChange,
  inset = space.xl,
}: {
  selected: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
  /** horizontal padding of the scroll content (0 when the parent is already padded) */
  inset?: number;
}) {
  const [adding, setAdding] = useState(false);
  const options = [...selected, ...allTags.filter((t) => !selected.includes(t))];
  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
        keyboardShouldPersistTaps="handled">
        <TagChip label="برچسب جدید" icon="add" onPress={() => setAdding(true)} />
        {options.map((t) => (
          <TagChip key={t} label={t} icon={selected.includes(t) ? 'checkmark' : 'pricetag-outline'} selected={selected.includes(t)} onPress={() => toggle(t)} />
        ))}
      </ScrollView>
      <AddTagSheet
        visible={adding}
        existing={allTags}
        onClose={() => setAdding(false)}
        onAdd={(t) => {
          if (!selected.includes(t)) onChange([...selected, t]);
          setAdding(false);
        }}
      />
    </>
  );
}

/** Single-select filter row: «همه» + every tag. */
export function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  value: string | null;
  onChange: (tag: string | null) => void;
}) {
  if (!tags.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <TagChip label="همه" icon="apps-outline" selected={value === null} onPress={() => onChange(null)} />
      {tags.map((t) => (
        <TagChip key={t} label={t} icon="pricetag-outline" selected={value === t} onPress={() => onChange(value === t ? null : t)} />
      ))}
    </ScrollView>
  );
}

function AddTagSheet({
  visible,
  existing,
  onClose,
  onAdd,
}: {
  visible: boolean;
  existing: string[];
  onClose: () => void;
  onAdd: (tag: string) => void;
}) {
  const [text, setText] = useState('');
  const clean = text.replace(/\s+/g, ' ').trim();
  const matches = clean ? existing.filter((t) => t.includes(clean) && t !== clean).slice(0, 6) : [];
  const submit = (t: string) => {
    if (!t) return;
    onAdd(t.slice(0, 40));
    setText('');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="برچسب جدید" subtitle="مثلاً نام درس، استاد یا ترم">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="مثلاً ساختمان داده"
        placeholderTextColor={colors.textFaint}
        style={inputStyle}
        autoFocus
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={() => submit(clean)}
      />
      {matches.length ? (
        <Animated.View entering={FadeIn} style={styles.wrap}>
          {matches.map((t) => (
            <TagChip key={t} label={t} icon="pricetag-outline" onPress={() => submit(t)} />
          ))}
        </Animated.View>
      ) : null}
      <Button title="افزودن برچسب" icon="pricetag" onPress={() => submit(clean)} disabled={!clean} style={{ marginTop: space.sm }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSm: { height: 24, paddingHorizontal: 8, gap: 3 },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: 'rgba(124,92,255,0.55)' },
});
