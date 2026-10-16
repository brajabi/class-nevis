import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { Button, Text, inputStyle, RtlModal } from '@/components/ui';
import { colors, radius, space } from '@/theme';

/** Small bottom sheet with a text field for renaming a recording. */
export function RenameSheet({
  visible,
  initial,
  onClose,
  onSave,
  title = 'تغییر عنوان',
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (title: string) => void | Promise<void>;
  title?: string;
}) {
  return (
    <RtlModal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? <RenameBody initial={initial} onClose={onClose} onSave={onSave} title={title} /> : null}
    </RtlModal>
  );
}

function RenameBody({ initial, onClose, onSave, title }: { initial: string; onClose: () => void; onSave: (t: string) => void | Promise<void>; title: string }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const t = value.trim();
    if (!t) return;
    setSaving(true);
    try {
      await onSave(t);
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(20)} style={styles.sheet}>
        <View style={styles.handle} />
        <Text variant="heading">{title}</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          selectTextOnFocus
          placeholder="مثلاً: ریاضی ۲ – جلسه پنجم"
          placeholderTextColor={colors.textFaint}
          style={inputStyle}
          returnKeyType="done"
          onSubmitEditing={save}
          maxLength={120}
        />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button title="ذخیره" icon="checkmark" onPress={save} loading={saving} disabled={!value.trim()} style={{ flex: 1 }} />
          <Button title="انصراف" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,6,12,0.7)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    paddingBottom: space.xxl + 8,
    gap: space.lg,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
});
