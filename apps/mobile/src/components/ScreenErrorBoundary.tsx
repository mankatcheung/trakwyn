import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { captureException } from '../lib/analytics';

interface ScreenErrorBoundaryProps {
  children: ReactNode;
}

interface ScreenErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a render-time error anywhere below it, reports it, and shows a
 * retry instead of a white screen (JEF-349).
 *
 * This is the "handled screen errors" half of the mobile scope, and it is
 * the one case PostHog's own autocapture cannot see: React catches a render
 * error at the boundary, so it never reaches the global handler that
 * `errorTracking.autocapture.uncaughtExceptions` installs. Without this, a
 * component that throws leaves an empty screen and no event anywhere.
 *
 * `componentStack` is the one thing worth passing along: on Hermes a
 * minified stack often names nothing recognisable, while the component
 * stack names the screen. It is a list of component names — no props, no
 * state — so it carries none of the user's data.
 */
export class ScreenErrorBoundary extends Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  state: ScreenErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ScreenErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, {
      kind: 'screen_error_boundary',
      component_stack: info.componentStack ?? undefined,
    });
  }

  private readonly reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <ScreenErrorFallback onRetry={this.reset} />;
  }
}

/**
 * Split out as a function component so the fallback can use the theme and
 * translation hooks — a class component cannot, and hard-coding either
 * would make this the one screen in the app that ignores dark mode and the
 * chosen language.
 */
function ScreenErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="screen-error-boundary"
    >
      <Text style={[styles.message, { color: colors.text }]}>{t('common:errorGeneric')}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={[styles.retry, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.retryLabel, { color: colors.onPrimary }]}>{t('common:retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  retry: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryLabel: { fontSize: 15, fontWeight: '600' },
});
