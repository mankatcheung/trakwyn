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
import { registerSchema } from './registerSchema';
import { OAuthProviderLogo } from './OAuthProviderLogo';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

export function RegisterScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { register, loginWithOAuth } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthProvider, setOAuthProvider] = useState<OAuthProviderName | null>(null);

  const onSubmit = async () => {
    setError(null);
    const parsed = registerSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('auth:validation.invalidInput'));
      return;
    }

    setIsSubmitting(true);
    try {
      await register(parsed.data.email, parsed.data.password);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onPressOAuth = async (provider: OAuthProviderName) => {
    setError(null);
    setOAuthProvider(provider);
    try {
      await loginWithOAuth(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:errorGeneric'));
    } finally {
      setOAuthProvider(null);
    }
  };

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
          <Text style={styles.title}>{t('auth:register.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth:register.haveAccountPrefix')}{' '}
            <Text
              style={styles.link}
              onPress={() => router.push('/login')}
              testID="register-login-link"
            >
              {t('auth:register.signInLink')}
            </Text>
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('auth:register.emailLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth:register.emailPlaceholder')}
              placeholderTextColor={colors.textFaint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              testID="register-email-input"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('auth:register.passwordLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth:register.passwordPlaceholder')}
              placeholderTextColor={colors.textFaint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
              testID="register-password-input"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('auth:register.confirmPasswordLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth:register.confirmPasswordPlaceholder')}
              placeholderTextColor={colors.textFaint}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="password-new"
              testID="register-confirm-password-input"
            />
          </View>

          <Pressable
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={isSubmitting}
            testID="register-submit-button"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>{t('auth:register.submit')}</Text>
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
                  <Text style={styles.oauthButtonText}>{t('auth:register.google')}</Text>
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
                  <Text style={styles.oauthButtonText}>{t('auth:register.github')}</Text>
                </>
              )}
            </Pressable>
          </View>

          <Text style={styles.terms}>{t('auth:register.termsAgreement')}</Text>
        </View>
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
    link: { color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
    field: { gap: 6 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
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
    terms: { color: colors.textSubtle, fontSize: 12, textAlign: 'center' },
  });
}
