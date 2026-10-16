import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Dialog,
  ErrorCard,
  NameDialog,
  NoteCard,
  Sheet,
  SheetAction,
  showToast,
  ToastHost,
} from '@/components/notes';
import { Button, EmptyState, Header, IconButton, Screen, Tap, Text } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { toFa } from '@/lib/format';
import type { NoteListItemDTO } from '@/lib/types';
import { colors, fonts, gradients, radius, shadow, space, type } from '@/theme';

const TAB_BAR_SPACE = 110;

/** Lowercase + unify Arabic/Persian letter variants + drop ZWNJ for forgiving search. */
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‏ً-ٟ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'خطای ناشناخته');

export default function NotesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<NoteListItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [grid, setGrid] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<NoteListItemDTO | null>(null);
  const [renameFor, setRenameFor] = useState<NoteListItemDTO | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleteFor, setDeleteFor] = useState<NoteListItemDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loadSeq = useRef(0);

  const load = async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    const seq = ++loadSeq.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const list = await api.listNotes();
      if (seq !== loadSeq.current) return;
      setNotes(list);
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(errMsg(e));
      if (mode === 'refresh' && notes) showToast('به‌روزرسانی ناموفق بود', 'error');
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Reload whenever the tab gains focus (e.g. after editing a note).
  useFocusEffect(
    useCallback(() => {
      load(notes ? 'silent' : 'initial');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const q = norm(query);
  const filtered = (notes ?? []).filter((n) => !q || norm(n.title).includes(q) || norm(n.preview).includes(q));

  const create = async (title: string) => {
    setCreating(true);
    try {
      const note = await api.createNote({ title, contentHtml: '' });
      setCreateOpen(false);
      setNotes((prev) => [
        { id: note.id, title: note.title, preview: '', createdAt: note.createdAt, updatedAt: note.updatedAt, recordingCount: 0 },
        ...(prev ?? []),
      ]);
      router.push(`/note/${note.id}`);
    } catch (e) {
      showToast(`ساخت جزوه ناموفق بود: ${errMsg(e)}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const rename = async (title: string) => {
    const target = renameFor;
    if (!target) return;
    setRenaming(true);
    try {
      const updated = await api.updateNote(target.id, { title });
      setNotes((prev) => (prev ?? []).map((n) => (n.id === target.id ? { ...n, title: updated.title, updatedAt: updated.updatedAt } : n)));
      setRenameFor(null);
      showToast('نام جزوه تغییر کرد');
    } catch (e) {
      showToast(`تغییر نام ناموفق بود: ${errMsg(e)}`, 'error');
    } finally {
      setRenaming(false);
    }
  };

  const remove = async () => {
    const target = deleteFor;
    if (!target) return;
    setDeleting(true);
    try {
      await api.deleteNote(target.id);
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== target.id));
      setDeleteFor(null);
      showToast('جزوه حذف شد');
    } catch (e) {
      showToast(`حذف ناموفق بود: ${errMsg(e)}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const listHeader = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="جستجو در عنوان و متن جزوه‌ها"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          returnKeyType="search"
          selectionColor={colors.primary}
          cursorColor={colors.primary}
        />
        {query ? (
          <Tap onPress={() => setQuery('')} haptic={false}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </Tap>
        ) : null}
      </Animated.View>
      {error && notes ? (
        <Animated.View entering={FadeIn} style={styles.offlineBar}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <Text variant="caption" color={colors.warning} style={{ flex: 1 }}>
            اتصال به سرور قطع است؛ فهرست ممکن است قدیمی باشد.
          </Text>
          <Tap onPress={() => load('refresh')}>
            <Text variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
              تلاش دوباره
            </Text>
          </Tap>
        </Animated.View>
      ) : null}
    </View>
  );

  const empty = () => {
    if (loading && !notes)
      return (
        <View style={{ paddingTop: 80, alignItems: 'center', gap: space.md }}>
          <ActivityIndicator color={colors.primary} />
          <Text variant="label" color={colors.textMuted}>
            در حال دریافت جزوه‌ها…
          </Text>
        </View>
      );
    if (error && !notes) return <ErrorCard message={error} onRetry={() => load('initial')} loading={loading} />;
    if (q)
      return <EmptyState icon="search-outline" title="چیزی پیدا نشد" subtitle={`هیچ جزوه‌ای با «${query.trim()}» مطابقت ندارد.`} />;
    return (
      <EmptyState
        icon="document-text-outline"
        title="هنوز جزوه‌ای ندارید"
        subtitle="یک جزوهٔ خالی بسازید و بنویسید، یا صدای کلاس را اضافه کنید تا هوش مصنوعی برایتان بنویسد."
        action={<Button title="ساخت اولین جزوه" icon="add" onPress={() => setCreateOpen(true)} style={{ marginTop: space.sm }} />}
      />
    );
  };

  return (
    <Screen>
      <Header
        title="جزوه‌های من"
        subtitle={notes ? (notes.length ? `${toFa(notes.length)} جزوه` : 'دفتر شما خالی است') : undefined}
        right={<IconButton icon={grid ? 'list' : 'grid-outline'} onPress={() => setGrid((g) => !g)} />}
      />
      <Animated.FlatList
        key={grid ? 'grid' : 'list'}
        data={filtered}
        keyExtractor={(n) => n.id}
        numColumns={grid ? 2 : 1}
        columnWrapperStyle={grid ? { gap: space.md } : undefined}
        renderItem={({ item, index }) => (
          <View style={grid ? { flex: 1, maxWidth: '50%' } : undefined}>
            <NoteCard
              note={item}
              index={index}
              compact={grid}
              onPress={() => router.push(`/note/${item.id}`)}
              onLongPress={() => setMenuFor(item)}
            />
          </View>
        )}
        itemLayoutAnimation={grid ? undefined : LinearTransition.springify().damping(18)}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty()}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: TAB_BAR_SPACE + insets.bottom + 64, gap: space.md }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            tintColor={colors.primary}
            colors={[colors.primary, colors.accent]}
            progressBackgroundColor={colors.surfaceHigh}
          />
        }
      />

      {/* Floating "new note" button, above the floating tab bar. */}
      <Animated.View entering={FadeInDown.delay(250).springify().damping(15)} style={[styles.fabWrap, { bottom: Math.max(insets.bottom, 12) + 68 + 14 }]}>
        <Tap onPress={() => setCreateOpen(true)}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text variant="heading" color="#fff" style={{ fontSize: 15 }}>
              جزوه جدید
            </Text>
          </LinearGradient>
        </Tap>
      </Animated.View>

      <NameDialog
        visible={createOpen}
        title="جزوه جدید"
        confirmLabel="ساختن"
        loading={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={create}
      />

      <Sheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title || 'جزوه'} subtitle="چه کاری انجام شود؟">
        <SheetAction
          index={0}
          icon="open-outline"
          tone="primary"
          title="باز کردن"
          onPress={() => {
            const n = menuFor;
            setMenuFor(null);
            if (n) router.push(`/note/${n.id}`);
          }}
        />
        <SheetAction
          index={1}
          icon="pencil-outline"
          title="تغییر نام"
          onPress={() => {
            setRenameFor(menuFor);
            setMenuFor(null);
          }}
        />
        <SheetAction
          index={2}
          icon="trash-outline"
          tone="danger"
          title="حذف جزوه"
          onPress={() => {
            setDeleteFor(menuFor);
            setMenuFor(null);
          }}
        />
      </Sheet>

      <NameDialog
        visible={!!renameFor}
        title="تغییر نام جزوه"
        initialValue={renameFor?.title ?? ''}
        confirmLabel="ذخیره"
        loading={renaming}
        onCancel={() => setRenameFor(null)}
        onSubmit={rename}
      />

      <Dialog visible={!!deleteFor} onClose={() => !deleting && setDeleteFor(null)}>
        <View style={styles.deleteIcon}>
          <Ionicons name="trash" size={26} color={colors.danger} />
        </View>
        <Text variant="title" style={{ fontSize: 19 }}>
          حذف جزوه؟
        </Text>
        <Text variant="body" color={colors.textMuted}>
          «{deleteFor?.title || 'جزوه بدون عنوان'}» برای همیشه حذف می‌شود. ضبط‌های صوتی مرتبط حذف نمی‌شوند.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button title="حذف" variant="danger" icon="trash-outline" onPress={remove} loading={deleting} style={{ flex: 1 }} />
          <Button title="انصراف" variant="secondary" onPress={() => setDeleteFor(null)} disabled={deleting} />
        </View>
      </Dialog>

      <ToastHost />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    height: 50,
  },
  searchInput: {
    ...type.body,
    flex: 1,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 0,
  },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fabWrap: { position: 'absolute', end: space.lg },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 54,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    ...shadow.glow,
  },
  deleteIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(248,113,113,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
