import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface StatCardProps {
  label: string;
  value: number;
  loading: boolean;
  color: string;
}

export function StatCard({ label, value, loading, color }: StatCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.card, { borderColor: color }]} testID={`stat-card-${label}`}>
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Text style={[styles.value, { color }]}>{value}</Text>
      )}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: 104,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 4,
    },
    value: { fontSize: 22, fontWeight: '700' },
    label: { fontSize: 12, color: colors.textSubtle },
  });
}
