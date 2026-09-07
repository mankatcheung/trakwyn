import { useEffect, useRef } from 'react';
import { Stack, usePathname, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import i18n from '../src/i18n';

const queryClient = new QueryClient();

export function RootNavigator() {
  const { isLoading, isAuthenticated, sessionExpired } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const lastAppPath = useRef<string | null>(null);
  const returnTo = useRef<string | null>(null);

  // Remember where the user is while signed in, so a session that dies
  // underneath them (as opposed to a deliberate sign-out) can put them back
  // there once they sign in again — apps/web's returnTo (JEF-233).
  useEffect(() => {
    if (isAuthenticated) lastAppPath.current = pathname;
  }, [isAuthenticated, pathname]);

  useEffect(() => {
    if (isAuthenticated || !sessionExpired) return;
    if (lastAppPath.current && lastAppPath.current !== '/') returnTo.current = lastAppPath.current;
  }, [isAuthenticated, sessionExpired]);

  useEffect(() => {
    if (!isAuthenticated || !returnTo.current) return;
    const target = returnTo.current;
    returnTo.current = null;
    // Deferred a tick so Stack.Protected has mounted the (app) group before
    // the navigation into it is dispatched.
    const timer = setTimeout(() => router.replace(target as Href), 0);
    return () => clearTimeout(timer);
  }, [isAuthenticated, router]);

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]} testID="root-loading">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

function AppStatusBar() {
  const { resolvedScheme } = useTheme();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <LanguageProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <RootNavigator />
              </AuthProvider>
            </QueryClientProvider>
            <AppStatusBar />
          </ThemeProvider>
        </LanguageProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
