import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from '../../../../src/components/navigation/NotificationBell';
import { applicationDetailStackScreens } from '../../../../src/components/navigation/applicationDetailStackScreens';
import { themedStackScreenOptions } from '../../../../src/components/navigation/themedStackScreenOptions';
import { useTheme } from '../../../../src/theme/ThemeContext';

const bellHeader = { headerRight: () => <NotificationBell /> };

export default function HomeStackLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: t('screenTitles.dashboard'), ...bellHeader }} />
      <Stack.Screen name="applications/new" options={{ title: t('screenTitles.newApplication') }} />
      {applicationDetailStackScreens(t, 'applications/')}
    </Stack>
  );
}
