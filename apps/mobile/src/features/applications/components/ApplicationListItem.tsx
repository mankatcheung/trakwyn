import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Application } from '../types';
import { StatusBadge } from './StatusBadge';
import { StarIcon } from './ApplicationIcons';
import { initialsOf } from '../../../lib/initials';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import type { ApplicationDisplayFields } from '../lib/applicationDisplayFields';
import { defaultApplicationDisplayFields } from '../lib/applicationDisplayFields';

const STAR_COLOR = '#eab308';

interface Props {
  application: Application;
  onPress: () => void;
  displayFields?: ApplicationDisplayFields;
}

export function ApplicationListItem({
  application,
  onPress,
  displayFields = defaultApplicationDisplayFields(),
}: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const subtitle = [application.company, displayFields.location ? application.location : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      testID={`application-item-${application.id}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initialsOf(application.company).slice(0, 2)}</Text>
      </View>
      <View style={styles.textColumn}>
        <View style={styles.roleRow}>
          {displayFields.role ? (
            <Text style={styles.role} numberOfLines={1}>
              {application.role}
            </Text>
          ) : null}
          {displayFields.starred && application.starred ? (
            <StarIcon color={STAR_COLOR} size={13} filled />
          ) : null}
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        {displayFields.tags && application.tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {application.tags.slice(0, 3).map((tag) => (
              <Text key={tag} style={styles.tag} numberOfLines={1}>
                {tag}
              </Text>
            ))}
          </View>
        ) : null}
        {displayFields.ghosted && application.likelyGhosted ? (
          <Text style={styles.ghostedBadge}>{t('list.likelyGhosted')}</Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {displayFields.date ? (
          <Text style={styles.date}>
            {new Date(application.appliedAt ?? application.createdAt).toLocaleDateString()}
          </Text>
        ) : null}
        {displayFields.status ? <StatusBadge status={application.status} /> : null}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    pressed: { backgroundColor: colors.surfaceAlt },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      flexShrink: 0,
    },
    avatarText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
    textColumn: { flex: 1, gap: 2 },
    roleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    role: { fontSize: 16, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSubtle },
    tagsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
    tag: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.primary,
      backgroundColor: colors.primarySurface,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    ghostedBadge: { fontSize: 11, fontWeight: '600', color: colors.warning, marginTop: 2 },
    trailing: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
    date: { fontSize: 11, color: colors.textFaint },
  });
}
