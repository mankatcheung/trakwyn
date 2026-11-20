import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useKeyboardVerticalOffset } from '../hooks/useKeyboardVerticalOffset';

export interface KeyboardAvoidingScreenProps {
  children: ReactNode;
  /** Applied to the keyboard-avoiding view, which fills the measured frame. */
  style?: StyleProp<ViewStyle>;
  /** Applied to the measured outer view. Defaults to filling its parent. */
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const FILL: ViewStyle = { flex: 1 };

/**
 * The one place that renders `KeyboardAvoidingView` (JEF-661, after JEF-377).
 *
 * `KeyboardAvoidingView` measures its frame against its parent, not the window, so on a screen
 * that starts below the top of the window (under a navigation header, or in a page-sheet modal)
 * it underestimates how much the keyboard covers and the lowest input stays behind it. The
 * real, sized outer `View` is measured in window coordinates by `useKeyboardVerticalOffset`
 * and that distance is passed on as `keyboardVerticalOffset`. A zero-size marker would never
 * report a layout on iOS, which is why this is a wrapper and not a hook call per screen.
 *
 * `behavior` is `padding` on iOS and unset on Android, as everywhere in the app.
 */
export function KeyboardAvoidingScreen({
  children,
  style,
  containerStyle,
  testID,
}: KeyboardAvoidingScreenProps) {
  const { keyboardVerticalOffset, measureProps } = useKeyboardVerticalOffset();

  return (
    <View style={[FILL, containerStyle]} {...measureProps} collapsable={false} testID={testID}>
      <KeyboardAvoidingView
        style={[FILL, style]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
