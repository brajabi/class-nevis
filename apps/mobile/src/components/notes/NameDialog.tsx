import { ComponentRef, useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Text, inputStyle } from '@/components/ui';
import { colors, fonts } from '@/theme';

import { Dialog } from './Sheet';

/** Small dialog asking for a note title (create / rename). */
export function NameDialog({
  visible,
  title,
  initialValue = '',
  confirmLabel,
  loading,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  confirmLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      const t = setTimeout(() => input.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [visible, initialValue]);

  const submit = () => {
    const v = value.trim();
    if (!v || loading) return;
    onSubmit(v);
  };

  return (
    <Dialog visible={visible} onClose={loading ? () => {} : onCancel}>
      <Text variant="title" style={{ fontSize: 19 }}>
        {title}
      </Text>
      <TextInput
        ref={input}
        value={value}
        onChangeText={setValue}
        placeholder="مثلاً: فیزیک ۲ — جلسه سوم"
        placeholderTextColor={colors.textFaint}
        style={[inputStyle, { fontFamily: fonts.medium, fontSize: 16 }]}
        returnKeyType="done"
        onSubmitEditing={submit}
        maxLength={120}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
      />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button title={confirmLabel} onPress={submit} loading={loading} disabled={!value.trim()} style={{ flex: 1 }} />
        <Button title="انصراف" variant="secondary" onPress={onCancel} disabled={loading} />
      </View>
    </Dialog>
  );
}
