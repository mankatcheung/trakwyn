import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useNotificationBellHeader } from '../../../../src/components/navigation/useNotificationBellHeader';
import { applicationDetailStackScreens } from '../../../../src/components/navigation/applicationDetailStackScreens';
import { themedStackScreenOptions } from '../../../../src/components/navigation/themedStackScreenOptions';
import { useTheme } from '../../../../src/theme/ThemeContext';

export default function HomeStackLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const bellHeader = useNotificationBellHeader();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: t('screenTitles.dashboard'), ...bellHeader }} />
      <Stack.Screen name="analytics" options={{ title: t('screenTitles.analytics') }} />
      <Stack.Screen name="profile" options={{ title: t('screenTitles.cvProfile') }} />
      <Stack.Screen name="applications/new" options={{ title: t('screenTitles.newApplication') }} />
      {applicationDetailStackScreens(t, 'applications/')}
    </Stack>
  );
}
