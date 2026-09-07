import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Application } from '../types';
import { StatusBadge } from './StatusBadge';
import { initialsOf } from '../../../lib/initials';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface Props {
  application: Application;
  onPress: () => void;
}

export function ApplicationListItem({ application, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const subtitle = [application.company, application.location].filter(Boolean).join(' · ');

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
        <Text style={styles.role} numberOfLines={1}>
          {application.role}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <StatusBadge status={application.status} />
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
    role: { fontSize: 16, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSubtle },
  });
}
