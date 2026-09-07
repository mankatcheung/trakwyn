import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from '../../../../src/components/navigation/NotificationBell';
import { themedStackScreenOptions } from '../../../../src/components/navigation/themedStackScreenOptions';
import { useTheme } from '../../../../src/theme/ThemeContext';

const bellHeader = { headerRight: () => <NotificationBell /> };

export default function AssistantStackLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: t('screenTitles.assistant'), ...bellHeader }} />
      <Stack.Screen name="[id]" options={{ title: t('screenTitles.assistant') }} />
    </Stack>
  );
}
