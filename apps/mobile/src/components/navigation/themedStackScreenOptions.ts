import type { ThemeColors } from '../../theme/colors';

// Native Stack headers don't follow the app's own light/dark/system theme
// toggle on their own — they default to React Navigation's built-in light
// theme regardless of ThemeContext's resolved scheme, since nothing in this
// app wires the two together. Every tab-scoped Stack (and the root Stack,
// for the notifications modal) applies this via its own `screenOptions` so
// the header background and title/back-button tint match the current theme.
export function themedStackScreenOptions(colors: ThemeColors) {
  return {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
  };
}
