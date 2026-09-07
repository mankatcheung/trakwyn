import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface AnalyticsCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  testID?: string;
}

export function AnalyticsCard({ title, description, children, testID }: AnalyticsCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    title: { fontSize: 14, fontWeight: '700', color: colors.text },
    description: { fontSize: 11, color: colors.textFaint, marginTop: -4 },
  });
}
