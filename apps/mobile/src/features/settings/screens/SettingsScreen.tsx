import React, { useMemo } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/AuthContext';
import { useProfile } from '../hooks/useProfile';
import { initialsOf } from '../../../lib/initials';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { WEB_URL } from '../../../constants';
import {
  BellIcon,
  ChartIcon,
  ChevronRightIcon,
  DatabaseIcon,
  DocumentIcon,
  GlobeIcon,
  PaletteIcon,
  RefreshIcon,
  ShieldIcon,
  SlidersIcon,
  StarIcon,
  TrashSettingsIcon,
  WarningIcon,
  type SettingsIconProps,
} from '../components/SettingsIcons';

const ROW_COLORS = {
  blue: { bg: '#eff6ff', fg: '#2563eb' },
  green: { bg: '#dcfce7', fg: '#15803d' },
  purple: { bg: '#f3e8ff', fg: '#7e22ce' },
  slate: { bg: '#f1f5f9', fg: '#475569' },
  amber: { bg: '#fef3c7', fg: '#a16207' },
  gray: { bg: '#f3f4f6', fg: '#4b5563' },
  indigo: { bg: '#eef2ff', fg: '#4338ca' },
  teal: { bg: '#ecfeff', fg: '#0e7490' },
  orange: { bg: '#ffedd5', fg: '#c2410c' },
};

interface MenuItem {
  label: string;
  href: Href;
  testID: string;
  icon: (props: SettingsIconProps) => React.JSX.Element;
  iconColor: { bg: string; fg: string };
}

interface LegalLinkItem {
  label: string;
  url: string;
  testID: string;
}

export function SettingsScreen() {
  const { t } = useTranslation('settingsMenu');
  const router = useRouter();
  const { logout } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: profile } = useProfile();

  const MENU: MenuItem[] = [
    {
      label: t('experience'),
      href: '/settings/experience',
      testID: 'settings-experience-row',
      icon: SlidersIcon,
      iconColor: ROW_COLORS.blue,
    },
    {
      label: t('security'),
      href: '/settings/security',
      testID: 'settings-security-row',
      icon: ShieldIcon,
      iconColor: ROW_COLORS.green,
    },
    {
      label: t('ai'),
      href: '/settings/ai',
      testID: 'settings-ai-row',
      icon: StarIcon,
      iconColor: ROW_COLORS.purple,
    },
    {
      label: t('integrations'),
      href: '/settings/integrations',
      testID: 'settings-integrations-row',
      icon: RefreshIcon,
      iconColor: ROW_COLORS.slate,
    },
    {
      label: t('notifications'),
      href: '/settings/notifications',
      testID: 'settings-notifications-row',
      icon: BellIcon,
      iconColor: ROW_COLORS.amber,
    },
    {
      label: t('data'),
      href: '/settings/data',
      testID: 'settings-data-row',
      icon: DatabaseIcon,
      iconColor: ROW_COLORS.gray,
    },
    {
      label: t('appearance'),
      href: '/settings/appearance',
      testID: 'settings-appearance-row',
      icon: PaletteIcon,
      iconColor: ROW_COLORS.indigo,
    },
    {
      label: t('language'),
      href: '/settings/language',
      testID: 'settings-language-row',
      icon: GlobeIcon,
      iconColor: ROW_COLORS.teal,
    },
    {
      label: t('analytics'),
      href: '/settings/analytics',
      testID: 'settings-analytics-row',
      icon: ChartIcon,
      iconColor: ROW_COLORS.orange,
    },
    {
      label: t('trash'),
      href: '/settings/trash',
      testID: 'settings-trash-row',
      icon: TrashSettingsIcon,
      iconColor: ROW_COLORS.gray,
    },
  ];

  const LEGAL_LINKS: LegalLinkItem[] = [
    {
      label: t('privacyPolicy'),
      url: `${WEB_URL}/privacy`,
      testID: 'settings-privacy-policy-row',
    },
    {
      label: t('termsOfService'),
      url: `${WEB_URL}/terms`,
      testID: 'settings-terms-of-service-row',
    },
    {
      label: t('accessibility'),
      url: `${WEB_URL}/accessibility`,
      testID: 'settings-accessibility-row',
    },
  ];

  const initials = profile ? initialsOf(profile.name || profile.email) : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {profile ? (
        <Pressable
          style={styles.profileCard}
          onPress={() => router.push('/settings/profile')}
          testID="settings-profile-row"
        >
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{profile.name || profile.email}</Text>
            <Text style={styles.profileEmail}>{profile.email}</Text>
          </View>
          <ChevronRightIcon color={colors.textFaint} />
        </Pressable>
      ) : (
        <Pressable
          style={styles.profileCard}
          onPress={() => router.push('/settings/profile')}
          testID="settings-profile-row"
        >
          <View style={styles.profileText} />
          <ChevronRightIcon color={colors.textFaint} />
        </Pressable>
      )}

      <View style={styles.menuCard}>
        {MENU.map((item, index) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.testID}
              style={[styles.row, index > 0 && styles.rowDivider]}
              onPress={() => router.push(item.href)}
              testID={item.testID}
            >
              <View style={[styles.iconBadge, { backgroundColor: item.iconColor.bg }]}>
                <Icon color={item.iconColor.fg} />
              </View>
              <Text style={styles.label}>{item.label}</Text>
              <ChevronRightIcon color={colors.textFaint} />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.dangerCard}
        onPress={() => router.push('/settings/danger-zone')}
        testID="settings-danger-zone-row"
      >
        <View style={[styles.iconBadge, { backgroundColor: colors.dangerSurface }]}>
          <WarningIcon color={colors.danger} />
        </View>
        <Text style={styles.dangerLabel}>{t('dangerZone')}</Text>
        <ChevronRightIcon color={colors.danger} />
      </Pressable>

      <View style={styles.menuCard}>
        {LEGAL_LINKS.map((item, index) => (
          <Pressable
            key={item.testID}
            style={[styles.row, index > 0 && styles.rowDivider]}
            onPress={() => void Linking.openURL(item.url)}
            testID={item.testID}
          >
            <View style={[styles.iconBadge, { backgroundColor: ROW_COLORS.slate.bg }]}>
              <DocumentIcon color={ROW_COLORS.slate.fg} />
            </View>
            <Text style={styles.label}>{item.label}</Text>
            <ChevronRightIcon color={colors.textFaint} />
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.signOutRow}
        onPress={() => void logout()}
        testID="settings-signout-button"
      >
        <Text style={styles.signOutLabel}>{t('signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16, paddingBottom: 32 },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    avatarImage: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt },
    avatarPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' },
    profileText: { flex: 1, gap: 2 },
    profileName: { fontSize: 16, fontWeight: '700', color: colors.text },
    profileEmail: { fontSize: 13, color: colors.textSubtle },
    menuCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    iconBadge: {
      width: 32,
      height: 32,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
    dangerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    dangerLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.danger },
    signOutRow: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerSurface,
      paddingVertical: 14,
    },
    signOutLabel: { fontSize: 15, fontWeight: '600', color: colors.danger },
  });
}
