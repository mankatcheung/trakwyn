import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { themedStackScreenOptions } from '../../src/components/navigation/themedStackScreenOptions';
import { useTheme } from '../../src/theme/ThemeContext';

export default function AppLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="notifications"
        options={{ title: t('screenTitles.notifications'), presentation: 'modal' }}
      />
    </Stack>
  );
}
