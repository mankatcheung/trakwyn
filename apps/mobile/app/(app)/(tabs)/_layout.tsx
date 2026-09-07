import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeContext';
import {
  ApplicationsIcon,
  AssistantIcon,
  CalendarIcon,
  DashboardIcon,
  SettingsIcon,
} from '../../../src/components/navigation/NavIcons';

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <DashboardIcon color={color as string} />,
          tabBarButtonTestID: 'tab-home',
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: t('tabs.applications'),
          tabBarIcon: ({ color }) => <ApplicationsIcon color={color as string} />,
          tabBarButtonTestID: 'tab-applications',
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tabs.calendar'),
          tabBarIcon: ({ color }) => <CalendarIcon color={color as string} />,
          tabBarButtonTestID: 'tab-calendar',
        }}
      />
      <Tabs.Screen
        name="(assistant)"
        options={{
          title: t('tabs.assistant'),
          tabBarIcon: ({ color }) => <AssistantIcon color={color as string} />,
          tabBarButtonTestID: 'tab-assistant',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <SettingsIcon color={color as string} />,
          tabBarButtonTestID: 'tab-settings',
        }}
      />
    </Tabs>
  );
}
