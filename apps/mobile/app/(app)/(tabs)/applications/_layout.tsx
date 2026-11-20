import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useNotificationBellHeader } from '../../../../src/components/navigation/useNotificationBellHeader';
import { applicationDetailStackScreens } from '../../../../src/components/navigation/applicationDetailStackScreens';
import { themedStackScreenOptions } from '../../../../src/components/navigation/themedStackScreenOptions';
import { useTheme } from '../../../../src/theme/ThemeContext';

export default function ApplicationsStackLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const bellHeader = useNotificationBellHeader();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen
        name="index"
        options={{ title: t('screenTitles.applications'), ...bellHeader }}
      />
      <Stack.Screen name="new" options={{ title: t('screenTitles.newApplication') }} />
      <Stack.Screen name="trash" options={{ title: t('screenTitles.trash') }} />
      {applicationDetailStackScreens(t, '')}
    </Stack>
  );
}
