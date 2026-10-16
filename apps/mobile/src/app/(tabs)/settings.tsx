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
  const [health, setHealth] = useState<Health>({ state: 'idle' });
  const [models, setModels] = useState<ModelDTO[] | null>(null);
  const [picker, setPicker] = useState<null | 'transcribeModel' | 'noteModel'>(null);
  const [advanced, setAdvanced] = useState(false);

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
    check();
  }, [check]);

  const status =
    health.state === 'error'
      ? { icon: 'cloud-offline-outline' as const, color: colors.warning, bg: colors.warningSoft, title: 'اتصال برقرار نیست', text: 'اینترنت گوشی را بررسی کنید. صداها روی گوشی امن می‌مانند و بعد از وصل شدن خودکار ارسال می‌شوند.' }
      : health.state === 'ok' && health.ai === false
        ? { icon: 'hourglass-outline' as const, color: colors.warning, bg: colors.warningSoft, title: 'رونویسی موقتاً در دسترس نیست', text: 'صداها ذخیره می‌شوند و به‌زودی خودکار به متن تبدیل می‌شوند.' }
        : health.state === 'ok'
          ? { icon: 'checkmark-circle' as const, color: colors.success, bg: colors.successSoft, title: 'همه‌چیز آماده است', text: 'کلاس‌نویس وصل است؛ صداها خودکار به متن و جزوه تبدیل می‌شوند.' }
          : { icon: 'sync-outline' as const, color: colors.textMuted, bg: colors.surfaceHigh, title: 'در حال بررسی اتصال...', text: '' };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <Header title="تنظیمات" />

        <View style={styles.section}>
          <Card index={0}>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <View style={[styles.shield, { backgroundColor: status.bg }]}>
                <Ionicons name={status.icon} size={22} color={status.color} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{status.title}</Text>
                {status.text ? (
                  <Text variant="caption" color={colors.textMuted}>
                    {status.text}
                  </Text>
                ) : null}
              </View>
            </View>
            {health.state === 'error' ? (
              <Button title="تلاش دوباره" icon="refresh" variant="secondary" size="sm" onPress={check} style={{ marginTop: space.md }} />
            ) : null}
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
                  در اولین فرصت ارسال می‌شود. فایل‌ها فقط با حذف دستی شما پاک می‌شوند.
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Tap onPress={() => setAdvanced((v) => !v)}>
            <View style={styles.advancedHead}>
              <Ionicons name="options-outline" size={18} color={colors.textMuted} />
              <Text variant="label" color={colors.textMuted} style={{ flex: 1 }}>
                تنظیمات پیشرفته
              </Text>
              <Ionicons name={advanced ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />
            </View>
          </Tap>
          {advanced ? (
            <Animated.View entering={FadeIn} style={{ gap: space.sm, marginTop: space.sm }}>
              <ModelRow label="هوش مصنوعی تبدیل صدا به متن" icon="mic-outline" value={settings.transcribeModel} onPress={() => setPicker('transcribeModel')} />
              <ModelRow label="هوش مصنوعی نوشتن جزوه" icon="sparkles-outline" value={settings.noteModel} onPress={() => setPicker('noteModel')} />
            </Animated.View>
          ) : null}
        </View>

        <Text variant="caption" color={colors.textFaint} style={{ textAlign: 'center', marginTop: space.lg }}>
          کلاس‌نویس · نسخه {toFa('1.0.0')}
        </Text>
      </ScrollView>

      <ModelPicker
        visible={picker !== null}
        title={picker === 'transcribeModel' ? 'تبدیل صدا به متن' : 'نوشتن جزوه'}
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

function ModelRow({ label, value, icon, onPress }: { label: string; value: string; icon: any; onPress: () => void }) {
  return (
    <Tap onPress={onPress}>
      <View style={styles.modelRow}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{label}</Text>
          <Text variant="caption" color={value ? colors.accent : colors.textFaint} numberOfLines={1} style={{ writingDirection: 'ltr', textAlign: 'right' }}>
            {value || 'پیشنهادی'}
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
              <Text variant="label">پیشنهادی (توصیه می‌شود)</Text>
            </View>
          </Tap>
          {models === null ? (
            <Text variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.xl }}>
              برای دیدن فهرست، اتصال اینترنت لازم است.
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
  advancedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
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
