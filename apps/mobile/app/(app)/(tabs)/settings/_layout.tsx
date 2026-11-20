import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useNotificationBellHeader } from '../../../../src/components/navigation/useNotificationBellHeader';
import { themedStackScreenOptions } from '../../../../src/components/navigation/themedStackScreenOptions';
import { useTheme } from '../../../../src/theme/ThemeContext';

export default function SettingsStackLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const bellHeader = useNotificationBellHeader();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: t('screenTitles.settings'), ...bellHeader }} />
      <Stack.Screen name="profile" options={{ title: t('screenTitles.profile') }} />
      <Stack.Screen name="security" options={{ title: t('screenTitles.security') }} />
      <Stack.Screen name="notifications" options={{ title: t('screenTitles.notifications') }} />
      <Stack.Screen name="appearance" options={{ title: t('screenTitles.appearance') }} />
      <Stack.Screen name="language" options={{ title: t('screenTitles.language') }} />
      <Stack.Screen name="ai" options={{ title: t('screenTitles.ai') }} />
      <Stack.Screen name="experience" options={{ title: t('screenTitles.experience') }} />
      <Stack.Screen name="integrations" options={{ title: t('screenTitles.integrations') }} />
      <Stack.Screen name="data" options={{ title: t('screenTitles.data') }} />
      <Stack.Screen name="danger-zone" options={{ title: t('screenTitles.dangerZone') }} />
      <Stack.Screen name="trash" options={{ title: t('screenTitles.trash') }} />
    </Stack>
  );
}
