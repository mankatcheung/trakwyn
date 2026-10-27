import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { themedStackScreenOptions } from '../../src/components/navigation/themedStackScreenOptions';
import { useEmailVerification } from '../../src/features/verification/hooks/useEmailVerification';
import { VerifyEmailRequiredScreen } from '../../src/features/verification/screens/VerifyEmailRequiredScreen';
import { useTheme } from '../../src/theme/ThemeContext';

export default function AppLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const { data: verification } = useEmailVerification();

  // An account whose email is not verified gets nothing but the reminder
  // (JEF-438). The check does not hold the app back: until it answers, and if
  // it fails, the tabs render, and the API refuses an unverified user's
  // requests itself.
  if (verification && !verification.emailVerified) {
    return <VerifyEmailRequiredScreen email={verification.email} />;
  }

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="notifications"
        options={{ title: t('screenTitles.notifications'), presentation: 'modal' }}
      />
      <Stack.Screen name="offers" options={{ title: t('screenTitles.allOffers') }} />
    </Stack>
  );
}
