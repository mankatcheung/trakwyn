import { useCallback, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Platform, type View } from 'react-native';

/** What a `View` ref points at; `View` itself is only a component type here. */
export type ViewElement = ComponentRef<typeof View>;

export interface KeyboardOffsetMeasureProps {
  ref: RefObject<ViewElement | null>;
  onLayout: () => void;
}

export interface KeyboardVerticalOffset {
  /** For `KeyboardAvoidingView`. `undefined` on Android, where that view does not pad. */
  keyboardVerticalOffset: number | undefined;
  /** Spread onto a real, sized `View` that wraps the keyboard view (and set `collapsable={false}`). */
  measureProps: KeyboardOffsetMeasureProps;
}

/**
 * How far the top of a keyboard-avoiding screen sits below the top of the window (JEF-377).
 *
 * `KeyboardAvoidingView` measures its own frame against its parent, not the window, so on a
 * screen under a navigation header it underestimates how much the keyboard covers by the
 * header's height and the composer stays partly behind the keyboard. Measuring the view that
 * wraps it in window coordinates gives the missing amount, including the status bar, without
 * depending on the navigation library's header hook.
 *
 * The measured view has to have a size: a zero-size view at the origin never reports a layout
 * on iOS, which is how a first attempt with a hidden marker left the offset at zero.
 */
export function useKeyboardVerticalOffset(): KeyboardVerticalOffset {
  const ref = useRef<ViewElement | null>(null);
  const [offset, setOffset] = useState(0);

  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((_x, y) => {
      setOffset((current) => (current === y ? current : y));
    });
  }, []);

  const measureProps = useMemo(() => ({ ref, onLayout }), [onLayout]);

  return {
    keyboardVerticalOffset: Platform.OS === 'ios' ? offset : undefined,
    measureProps,
  };
}
