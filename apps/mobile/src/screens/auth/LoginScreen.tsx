import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth, type OAuthProviderName } from '../../auth/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import { LogoMark } from '../../components/LogoMark';
import { loginSchema, totpSchema } from './loginSchema';
import { OAuthProviderLogo } from './OAuthProviderLogo';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

export function LoginScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { login, loginWithTotp, loginWithOAuth } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthProvider, setOAuthProvider] = useState<OAuthProviderName | null>(null);

  const onPressOAuth = async (provider: OAuthProviderName) => {
    setError(null);
    setOAuthProvider(provider);
    try {
      await loginWithOAuth(provider);
    } catch (err) {
      // AuthContext.loginWithOAuth always throws a plain Error with an
      // already user-facing message (an oauthError slug's copy, or a fixed
      // fallback) — not the GraphQL/network shapes getErrorMessage handles.
      setError(err instanceof Error ? err.message : t('common:errorGeneric'));
    } finally {
      setOAuthProvider(null);
    }
  };

  const onSubmit = async () => {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('auth:validation.invalidInput'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(parsed.data.email, parsed.data.password);
      if (result.totpRequired) setTotpRequired(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitTotp = async () => {
    setError(null);
    const parsed = totpSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('auth:validation.invalidCode'));
      return;
    }

    setIsSubmitting(true);
    try {
      await loginWithTotp(email, password, parsed.data.code);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (totpRequired) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <LogoMark size={28} scheme={resolvedScheme} />
            <Text style={styles.brandText}>{t('auth:appName')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{t('auth:totp.title')}</Text>
            <Text style={styles.subtitle}>{t('auth:totp.subtitle')}</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('auth:totp.codeLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('auth:totp.codePlaceholder')}
                placeholderTextColor={colors.textFaint}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoFocus
                testID="totp-code-input"
              />
            </View>

            <Pressable
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={onSubmitTotp}
              disabled={isSubmitting}
              testID="totp-submit-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>{t('auth:totp.verify')}</Text>
              )}
            </Pressable>

            <Pressable onPress={() => setTotpRequired(false)}>
              <Text style={styles.backLink}>{t('auth:totp.back')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <LogoMark size={28} scheme={resolvedScheme} />
          <Text style={styles.brandText}>{t('auth:appName')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('auth:login.title')}</Text>
          {/* Two sibling Texts in a row, not a nested Text: on Android a nested
              Text is a span inside its parent's TextView — no view of its own,
              no resource-id — so Maestro cannot find the link by testID. */}
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitleText}>{t('auth:login.noAccountPrefix')}</Text>
            <Text
              style={[styles.subtitleText, styles.link]}
              onPress={() => router.push('/register')}
              testID="login-register-link"
            >
              {t('auth:login.registerLink')}
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('auth:login.emailLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth:login.emailPlaceholder')}
              placeholderTextColor={colors.textFaint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              testID="login-email-input"
            />
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>{t('auth:login.passwordLabel')}</Text>
              <Pressable onPress={() => router.push('/forgot-password')}>
                <Text style={styles.forgotLink}>{t('auth:login.forgotPassword')}</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder={t('auth:login.passwordPlaceholder')}
              placeholderTextColor={colors.textFaint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              testID="login-password-input"
            />
          </View>

          <Pressable
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={isSubmitting}
            testID="login-submit-button"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>{t('auth:login.submit')}</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth:orContinueWith')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.oauthRow}>
            <Pressable
              style={[styles.oauthButton, oauthProvider !== null && styles.buttonDisabled]}
              onPress={() => onPressOAuth('google')}
              disabled={oauthProvider !== null}
              testID="oauth-google-button"
            >
              {oauthProvider === 'google' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <OAuthProviderLogo provider="google" />
                  <Text style={styles.oauthButtonText}>{t('auth:login.google')}</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.oauthButton, oauthProvider !== null && styles.buttonDisabled]}
              onPress={() => onPressOAuth('github')}
              disabled={oauthProvider !== null}
              testID="oauth-github-button"
            >
              {oauthProvider === 'github' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <OAuthProviderLogo provider="github" />
                  <Text style={styles.oauthButtonText}>{t('auth:login.github')}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <Text style={styles.footer}>{t('auth:footer.termsPrivacy')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 24,
    },
    brandText: { fontSize: 20, fontWeight: '700', color: colors.text },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      gap: 16,
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    title: { fontSize: 26, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSubtle, marginTop: -8 },
    subtitleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: 4,
      marginTop: -8,
    },
    subtitleText: { fontSize: 14, color: colors.textSubtle },
    link: { color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
    field: { gap: 6 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    forgotLink: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    button: {
      minHeight: 48,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
    backLink: { color: colors.primary, textAlign: 'center', marginTop: 4 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { color: colors.textSubtle, fontSize: 12 },
    oauthRow: { flexDirection: 'row', gap: 12 },
    oauthButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    oauthButtonText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
    footer: { color: colors.textSubtle, fontSize: 12, textAlign: 'center', marginTop: 24 },
  });
}
