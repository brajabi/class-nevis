import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Badge, Button, Card, Header, Screen, Tap, Text, inputStyle, RtlModal } from '@/components/ui';
import { api } from '@/lib/api';
import { toFa } from '@/lib/format';
import { updateSettings, useSettings } from '@/lib/settings';
import type { ModelDTO } from '@/lib/types';
import { colors, radius, space } from '@/theme';

type Health = { state: 'idle' | 'checking' | 'ok' | 'error'; message?: string; ai?: boolean };

export default function SettingsScreen() {
  const settings = useSettings();
  const [url, setUrl] = useState(settings.serverUrl);
  const [health, setHealth] = useState<Health>({ state: 'idle' });
  const [models, setModels] = useState<ModelDTO[] | null>(null);
  const [picker, setPicker] = useState<null | 'transcribeModel' | 'noteModel'>(null);

  const check = useCallback(async () => {
    setHealth({ state: 'checking' });
    try {
      const h = await api.health();
      setHealth({ state: 'ok', ai: h.openrouterConfigured });
      api.models().then(setModels).catch(() => {});
    } catch (e: any) {
      setHealth({ state: 'error', message: e?.message });
    }
  }, []);

  useEffect(() => {
    setUrl(settings.serverUrl);
    check();
  }, [check, settings.serverUrl]);

  const saveUrl = async () => {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean && clean !== settings.serverUrl) await updateSettings({ serverUrl: clean });
    else check();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <Header title="تنظیمات" subtitle="اتصال به سرور و انتخاب مدل‌های هوش مصنوعی" />

        <View style={styles.section}>
          <Card index={0}>
            <View style={styles.rowBetween}>
              <Text variant="heading">سرور کلاس‌نویس</Text>
              <HealthBadge health={health} />
            </View>
            <Text variant="caption" color={colors.textMuted} style={{ marginTop: 4, marginBottom: space.md }}>
              آدرس سرور بک‌اند (برای شبیه‌ساز اندروید 10.0.2.2 و برای گوشی واقعی IP کامپیوتر در شبکه)
            </Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.10:4000"
              placeholderTextColor={colors.textFaint}
              style={[inputStyle, { textAlign: 'left', writingDirection: 'ltr' }]}
              onSubmitEditing={saveUrl}
            />
            <Button title="ذخیره و بررسی اتصال" icon="pulse" onPress={saveUrl} loading={health.state === 'checking'} style={{ marginTop: space.md }} />
            {health.state === 'ok' && health.ai === false ? (
              <Animated.View entering={FadeIn} style={styles.warn}>
                <Ionicons name="key-outline" size={18} color={colors.warning} />
                <Text variant="caption" color={colors.warning} style={{ flex: 1 }}>
                  کلید OpenRouter روی سرور تنظیم نشده است. صداها ذخیره می‌شوند و بعد از تنظیم کلید رونویسی می‌شوند.
                </Text>
              </Animated.View>
            ) : null}
          </Card>
        </View>

        <View style={styles.section}>
          <Card index={1}>
            <Text variant="heading">مدل‌های هوش مصنوعی (OpenRouter)</Text>
            <Text variant="caption" color={colors.textMuted} style={{ marginTop: 4, marginBottom: space.md }}>
              خالی بگذارید تا از مدل پیش‌فرض سرور استفاده شود.
            </Text>
            <ModelRow label="مدل رونویسی صوت" icon="mic-outline" value={settings.transcribeModel} onPress={() => setPicker('transcribeModel')} />
            <View style={{ height: space.sm }} />
            <ModelRow label="مدل نوشتن جزوه" icon="sparkles-outline" value={settings.noteModel} onPress={() => setPicker('noteModel')} />
          </Card>
        </View>

        <View style={styles.section}>
          <Card index={2}>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
              <View style={styles.shield}>
                <Ionicons name="shield-checkmark" size={22} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="heading">صداهای شما امن هستند</Text>
                <Text variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
                  هر کلاس در بخش‌های کوتاه ضبط و بلافاصله در حافظه‌ی گوشی ذخیره می‌شود. حتی اگر برنامه بسته شود یا اینترنت قطع باشد، صدا از بین نمی‌رود و
                  در اولین فرصت به سرور ارسال می‌شود. فایل‌ها فقط با حذف دستی شما پاک می‌شوند.
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <Text variant="caption" color={colors.textFaint} style={{ textAlign: 'center', marginTop: space.lg }}>
          کلاس‌نویس · نسخه {toFa('1.0.0')}
        </Text>
      </ScrollView>

      <ModelPicker
        visible={picker !== null}
        title={picker === 'transcribeModel' ? 'مدل رونویسی (فقط مدل‌های صوتی)' : 'مدل نوشتن جزوه'}
        audioOnly={picker === 'transcribeModel'}
        models={models}
        selected={picker ? settings[picker] : ''}
        onClose={() => setPicker(null)}
        onSelect={async (id) => {
          if (picker) await updateSettings({ [picker]: id });
          setPicker(null);
        }}
      />
    </Screen>
  );
}

function HealthBadge({ health }: { health: Health }) {
  if (health.state === 'checking') return <Badge label="در حال بررسی" tone="neutral" icon="sync" />;
  if (health.state === 'ok') return <Badge label="متصل" tone="success" icon="checkmark-circle" />;
  if (health.state === 'error') return <Badge label="قطع" tone="danger" icon="close-circle" />;
  return null;
}

function ModelRow({ label, value, icon, onPress }: { label: string; value: string; icon: any; onPress: () => void }) {
  return (
    <Tap onPress={onPress}>
      <View style={styles.modelRow}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{label}</Text>
          <Text variant="caption" color={value ? colors.accent : colors.textFaint} numberOfLines={1} style={{ writingDirection: 'ltr', textAlign: 'right' }}>
            {value || 'پیش‌فرض سرور'}
          </Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
      </View>
    </Tap>
  );
}

function ModelPicker({
  visible,
  title,
  models,
  audioOnly,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  models: ModelDTO[] | null;
  audioOnly: boolean;
  selected: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const base = (models ?? []).filter((m) => (audioOnly ? m.audio : true));
    const s = q.trim().toLowerCase();
    return s ? base.filter((m) => m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s)) : base;
  }, [models, audioOnly, q]);

  return (
    <RtlModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Tap style={StyleSheet.absoluteFill} onPress={onClose} haptic={false}>
          <View style={{ flex: 1 }} />
        </Tap>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.sheet}>
          <View style={styles.grabber} />
          <Text variant="title" style={{ marginBottom: space.md }}>
            {title}
          </Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="جستجوی مدل..."
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            style={inputStyle}
          />
          <Tap onPress={() => onSelect('')}>
            <View style={[styles.modelItem, !selected && styles.modelItemActive]}>
              <Text variant="label">پیش‌فرض سرور</Text>
            </View>
          </Tap>
          {models === null ? (
            <Text variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.xl }}>
              برای دیدن مدل‌ها ابتدا به سرور متصل شوید.
            </Text>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(m) => m.id}
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Tap onPress={() => onSelect(item.id)}>
                  <View style={[styles.modelItem, selected === item.id && styles.modelItemActive]}>
                    <View style={{ flex: 1 }}>
                      <Text variant="label" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text variant="caption" color={colors.textFaint} numberOfLines={1} style={{ writingDirection: 'ltr', textAlign: 'right' }}>
                        {item.id}
                      </Text>
                    </View>
                    {item.stt ? (
                      <Badge label="گفتار به متن" tone="success" icon="mic" />
                    ) : item.audio ? (
                      <Badge label="صوت" tone="accent" icon="mic" />
                    ) : null}
                  </View>
                </Tap>
              )}
            />
          )}
        </Animated.View>
      </View>
    </RtlModal>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: space.xl, marginTop: space.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  warn: { flexDirection: 'row', gap: 8, marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shield: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: space.md },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    marginTop: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelItemActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
