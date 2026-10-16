import { ComponentRef, ComponentType, Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Keyboard, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { colors } from '@/theme';

import { buildEditorHtml } from './editorHtml';
import { EditorToolbar } from './EditorToolbar';
import { emptySelectionState, type EditorCommand, type RichEditorHandle, type SelectionState, type WebToNative } from './types';
import { useKeyboardInset } from './useKeyboardInset';

export type { EditorCommand, RichEditorHandle, SelectionState } from './types';

// react-native-webview's class typing (`WebViewProps & undefined`) collapses to `never`
// under current TS; re-type it as a plain component with the one method we use.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/**
 * Google-Docs-like rich text editor: a WebView hosting a white contenteditable
 * "paper" (RTL, Vazirmatn) plus a formatting toolbar that stays above the
 * keyboard. Fill the available space (flex: 1); it handles the bottom safe area.
 */
export function RichEditor({
  ref,
  initialHtml,
  placeholder = 'اینجا بنویسید...',
  onChange,
  onDirty,
  onReady,
  onHint,
  onFocusChange,
  editable = true,
  style,
}: {
  ref?: Ref<RichEditorHandle>;
  /** Used only on first mount; use ref.setHtml to replace content later. */
  initialHtml: string;
  placeholder?: string;
  /** Debounced (600ms) HTML after user edits. */
  onChange?: (html: string) => void;
  /** Fired immediately when the user starts editing after the last change event. */
  onDirty?: () => void;
  onReady?: () => void;
  /** Short user-facing hint from the editor (e.g. "select some text first"). */
  onHint?: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const webRef = useRef<WebViewHandle>(null);
  const boxRef = useRef<ComponentRef<typeof View>>(null);
  const [html] = useState(() => buildEditorHtml(initialHtml, placeholder));
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<SelectionState>(emptySelectionState);
  const pending = useRef(new Map<string, (html: string) => void>());
  const seq = useRef(0);
  const queue = useRef<string[]>([]);
  const readyRef = useRef(false);
  const insets = useSafeAreaInsets();
  const { inset, onLayout } = useKeyboardInset(boxRef);
  const keyboardOpen = inset > 0;

  const run = (js: string) => {
    const code = `try{${js}}catch(e){};true;`;
    if (!readyRef.current) queue.current.push(code);
    else webRef.current?.injectJavaScript(code);
  };

  useImperativeHandle(ref, () => ({
    exec: (c: EditorCommand) => run(`window.__cn.cmd(${JSON.stringify(c)})`),
    setHtml: (h: string) => run(`window.__cn.setHtml(${JSON.stringify(h)})`),
    getHtml: () =>
      new Promise<string>((resolve, reject) => {
        const id = String(++seq.current);
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error('editor timeout'));
        }, 4000);
        pending.current.set(id, (h) => {
          clearTimeout(timer);
          resolve(h);
        });
        run(`window.__cn.getHtml(${JSON.stringify(id)})`);
      }),
    focus: () => run('window.__cn.focus()'),
    blur: () => {
      run('window.__cn.blur()');
      Keyboard.dismiss();
    },
  }));

  useEffect(() => {
    if (ready) run(`window.__cn.setEditable(${editable ? 'true' : 'false'})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, ready]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: WebToNative;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (m.type) {
      case 'ready':
        readyRef.current = true;
        setReady(true);
        queue.current.splice(0).forEach((c) => webRef.current?.injectJavaScript(c));
        onReady?.();
        break;
      case 'dirty':
        onDirty?.();
        break;
      case 'change':
        if (!m.silent) onChange?.(m.html);
        break;
      case 'state':
        setSel(m.state);
        break;
      case 'html': {
        const cb = pending.current.get(m.id);
        pending.current.delete(m.id);
        cb?.(m.html);
        break;
      }
      case 'focus':
        onFocusChange?.(m.focused);
        break;
      case 'hint':
        onHint?.(m.text);
        break;
    }
  };

  // Animate the toolbar up with the keyboard.
  const pad = useSharedValue(insets.bottom);
  useEffect(() => {
    pad.value = withTiming(keyboardOpen ? inset : insets.bottom, { duration: keyboardOpen ? 160 : 200 });
  }, [inset, keyboardOpen, insets.bottom, pad]);
  const padStyle = useAnimatedStyle(() => ({ paddingBottom: pad.value }));

  return (
    <View ref={boxRef} onLayout={onLayout} style={[styles.root, style]} collapsable={false}>
      <Animated.View style={[styles.column, padStyle]}>
        <View style={styles.webWrap}>
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html, baseUrl: '' }}
            onMessage={onMessage}
            style={styles.web}
            containerStyle={styles.web}
            javaScriptEnabled
            domStorageEnabled={false}
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            setSupportMultipleWindows={false}
            overScrollMode="never"
            textZoom={100}
            allowsLinkPreview={false}
            bounces={false}
            showsVerticalScrollIndicator={false}
            onShouldStartLoadWithRequest={(r) => !/^(https?|intent|tel|mailto):/i.test(r.url)}
          />
          {!ready ? <View style={[StyleSheet.absoluteFill, styles.cover]} pointerEvents="none" /> : null}
        </View>
        <EditorToolbar
          state={sel}
          onCommand={(c) => run(`window.__cn.cmd(${JSON.stringify(c)})`)}
          keyboardOpen={keyboardOpen}
          onDone={() => {
            run('window.__cn.blur()');
            Keyboard.dismiss();
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { flex: 1 },
  webWrap: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  cover: { backgroundColor: colors.bg },
});
