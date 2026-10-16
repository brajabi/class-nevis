import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text as RNText, TextStyle, View } from 'react-native';

import { Tap, type IconName } from '@/components/ui';
import { toFa } from '@/lib/format';
import { colors, fonts, gradients } from '@/theme';

import type { EditorCommand, SelectionState } from './types';

const SIZE = 40;

function ToolButton({
  active,
  onPress,
  children,
  label,
}: {
  active?: boolean;
  onPress: () => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <Tap onPress={onPress} haptic>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!active }}
        style={[styles.btn, active && styles.btnActive]}>
        {children}
      </View>
    </Tap>
  );
}

function Glyph({ children, active, style }: { children: ReactNode; active?: boolean; style?: TextStyle }) {
  return (
    <RNText allowFontScaling={false} style={[styles.glyph, { color: active ? colors.primary : colors.text }, style]}>
      {children}
    </RNText>
  );
}

function Icon({ name, active }: { name: IconName; active?: boolean }) {
  return <Ionicons name={name} size={19} color={active ? colors.primary : colors.text} />;
}

/** Three little lines drawn to show text alignment. */
function AlignIcon({ align, active }: { align: 'right' | 'center' | 'left'; active?: boolean }) {
  const c = active ? colors.primary : colors.text;
  const alignItems = align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center';
  return (
    <View style={{ width: 18, gap: 3, alignItems, direction: 'ltr' }}>
      {[18, 11, 15, 9].map((w, i) => (
        <View key={i} style={{ width: w, height: 2, borderRadius: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export function EditorToolbar({
  state,
  onCommand,
  onDone,
  keyboardOpen,
}: {
  state: SelectionState;
  onCommand: (c: EditorCommand) => void;
  onDone?: () => void;
  keyboardOpen?: boolean;
}) {
  const b = (cmd: EditorCommand, label: string, child: ReactNode, active?: boolean) => (
    <ToolButton key={cmd} label={label} active={active} onPress={() => onCommand(cmd)}>
      {child}
    </ToolButton>
  );

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'ios' ? <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <LinearGradient colors={['rgba(30,34,54,0.97)', 'rgba(14,16,27,0.99)']} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topLine} />
      <View style={styles.row}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.scroll}>
          {b('undo', 'واگرد', <Icon name="arrow-undo-outline" />)}
          {b('redo', 'از نو', <Icon name="arrow-redo-outline" />)}
          <Divider />
          {b('bold', 'پررنگ', <Glyph active={state.bold} style={{ fontFamily: fonts.black }}>B</Glyph>, state.bold)}
          {b('italic', 'کج', <Glyph active={state.italic} style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</Glyph>, state.italic)}
          {b(
            'underline',
            'زیرخط',
            <Glyph active={state.underline} style={{ textDecorationLine: 'underline' }}>U</Glyph>,
            state.underline,
          )}
          {b(
            'strike',
            'خط‌خورده',
            <Glyph active={state.strike} style={{ textDecorationLine: 'line-through' }}>S</Glyph>,
            state.strike,
          )}
          {b(
            'mark',
            'هایلایت',
            <View style={[styles.markChip, state.mark && { borderColor: colors.primary }]}>
              <Glyph style={{ color: colors.ink, fontSize: 13 }}>ab</Glyph>
            </View>,
            state.mark,
          )}
          <Divider />
          {b('h1', 'عنوان ۱', <Glyph active={state.heading === 'h1'}>{'H' + toFa(1)}</Glyph>, state.heading === 'h1')}
          {b('h2', 'عنوان ۲', <Glyph active={state.heading === 'h2'}>{'H' + toFa(2)}</Glyph>, state.heading === 'h2')}
          {b('h3', 'عنوان ۳', <Glyph active={state.heading === 'h3'}>{'H' + toFa(3)}</Glyph>, state.heading === 'h3')}
          {b(
            'paragraph',
            'متن عادی',
            <Glyph active={!state.heading && !state.quote} style={{ fontSize: 14 }}>¶</Glyph>,
            false,
          )}
          {b('fontUp', 'بزرگ‌تر', <Glyph style={{ fontSize: 15 }}>A+</Glyph>)}
          {b('fontDown', 'کوچک‌تر', <Glyph style={{ fontSize: 12 }}>A−</Glyph>)}
          <Divider />
          {b('ul', 'فهرست نقطه‌ای', <Icon name="list" active={state.ul} />, state.ul)}
          {b('ol', 'فهرست شماره‌دار', <Glyph active={state.ol} style={{ fontSize: 14 }}>{toFa('1.2')}</Glyph>, state.ol)}
          {b('quote', 'نقل‌قول', <Glyph active={state.quote} style={{ fontSize: 20, lineHeight: 26 }}>«»</Glyph>, state.quote)}
          {b('hr', 'خط جداکننده', <Icon name="remove-outline" />)}
          <Divider />
          {b('alignRight', 'راست‌چین', <AlignIcon align="right" active={state.align === 'right'} />, state.align === 'right')}
          {b('alignCenter', 'وسط‌چین', <AlignIcon align="center" active={state.align === 'center'} />, state.align === 'center')}
          {b('alignLeft', 'چپ‌چین', <AlignIcon align="left" active={state.align === 'left'} />, state.align === 'left')}
          <Divider />
          {b('clear', 'پاک کردن قالب', <Icon name="color-wand-outline" />)}
        </ScrollView>
        {keyboardOpen && onDone ? (
          <Tap onPress={onDone}>
            <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.done}>
              <Ionicons name="chevron-down" size={20} color="#fff" />
            </LinearGradient>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  topLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  scroll: { paddingHorizontal: 10, gap: 6, alignItems: 'center' },
  btn: {
    width: SIZE,
    height: SIZE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  glyph: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, textAlign: 'center', includeFontPadding: false },
  markChip: {
    backgroundColor: '#FFEC99',
    borderRadius: 5,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  divider: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 4 },
  done: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
});
