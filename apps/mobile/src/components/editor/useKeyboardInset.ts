import { ComponentRef, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform, View } from 'react-native';

/**
 * How many points of `ref`'s view are covered by the software keyboard.
 *
 * Works whether or not the OS resizes the window: with edge-to-edge on Android
 * (enforced in recent SDKs) `adjustResize` no longer shrinks the window, so we
 * measure the view's bottom in window coordinates and compare it to the
 * keyboard's top edge. If the window *did* resize, the overlap is ~0 and no
 * extra padding is added (no double offset).
 *
 * Call the returned `onLayout` from the measured view's onLayout.
 */
export function useKeyboardInset(ref: RefObject<ComponentRef<typeof View> | null>) {
  const [inset, setInset] = useState(0);
  const kbTop = useRef<number | null>(null);

  const measure = useCallback(() => {
    const top = kbTop.current;
    if (top == null) {
      setInset(0);
      return;
    }
    ref.current?.measureInWindow((_x, y, _w, h) => {
      // Overlap includes the navigation bar area under the keyboard (edge-to-edge).
      const overlap = Math.round(y + h - top);
      setInset(Math.max(0, overlap));
    });
  }, [ref]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const timers: ReturnType<typeof setTimeout>[] = [];
    const onShow = (e: KeyboardEvent) => {
      kbTop.current = e.endCoordinates.screenY;
      measure();
      // Re-measure once layout settles (the window may still be resizing).
      timers.push(setTimeout(measure, 120), setTimeout(measure, 350));
    };
    const onHide = () => {
      kbTop.current = null;
      setInset(0);
    };
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    // Android sometimes only reports frame changes (e.g. switching keyboards).
    const s3 = Platform.OS === 'android' ? Keyboard.addListener('keyboardDidChangeFrame', onShow) : null;
    return () => {
      s1.remove();
      s2.remove();
      s3?.remove();
      timers.forEach(clearTimeout);
    };
  }, [measure]);

  return { inset, onLayout: measure };
}
