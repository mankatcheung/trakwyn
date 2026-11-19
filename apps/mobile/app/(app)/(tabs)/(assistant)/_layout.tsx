import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useNotificationBellHeader } from '../../../../src/components/navigation/useNotificationBellHeader';
import { themedStackScreenOptions } from '../../../../src/components/navigation/themedStackScreenOptions';
import { useTheme } from '../../../../src/theme/ThemeContext';

export default function AssistantStackLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const bellHeader = useNotificationBellHeader();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: t('screenTitles.assistant'), ...bellHeader }} />
      <Stack.Screen name="[id]" options={{ title: t('screenTitles.assistant') }} />
    </Stack>
  );
}
