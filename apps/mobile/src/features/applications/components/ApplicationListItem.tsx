import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Application } from '../types';
import { StatusBadge } from './StatusBadge';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface Props {
  application: Application;
  onPress: () => void;
}

export function ApplicationListItem({ application, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      testID={`application-item-${application.id}`}
    >
      <View style={styles.textColumn}>
        <Text style={styles.role} numberOfLines={1}>
          {application.role}
        </Text>
        <Text style={styles.company} numberOfLines={1}>
          {application.company}
        </Text>
        {application.location ? (
          <Text style={styles.location} numberOfLines={1}>
            {application.location}
          </Text>
        ) : null}
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
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    pressed: { backgroundColor: colors.surfaceAlt },
    textColumn: { flex: 1, gap: 2 },
    role: { fontSize: 15, fontWeight: '600', color: colors.text },
    company: { fontSize: 13, color: colors.textMuted },
    location: { fontSize: 12, color: colors.textSubtle },
  });
}
