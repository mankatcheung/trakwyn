import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface StatCardProps {
  label: string;
  value: number;
  loading: boolean;
  icon: React.ReactNode;
  iconBg: string;
}

export function StatCard({ label, value, loading, icon, iconBg }: StatCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card} testID={`stat-card-${label}`}>
      <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>{icon}</View>
      {loading ? (
        <ActivityIndicator style={styles.loading} size="small" color={colors.text} />
      ) : (
        <Text style={styles.value}>{value}</Text>
      )}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: 112,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 10,
    },
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    value: { fontSize: 22, fontWeight: '700', color: colors.text },
    label: { fontSize: 12, color: colors.textSubtle },
    loading: { alignSelf: 'flex-start' },
  });
}
