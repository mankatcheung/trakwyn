import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WeeklyPoint } from '../lib/analyticsSummary';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const CHART_HEIGHT = 100;

export function WeeklyBarChart({ data }: { data: WeeklyPoint[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <View style={styles.chart} testID="weekly-bar-chart">
      {data.map((point) => (
        <View key={point.week} style={styles.barColumn}>
          <Text style={styles.barCount}>{point.count}</Text>
          <View style={[styles.bar, { height: Math.max(2, (point.count / max) * CHART_HEIGHT) }]} />
          <Text style={styles.barLabel} numberOfLines={1}>
            {point.week}
          </Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      height: CHART_HEIGHT + 36,
    },
    barColumn: { alignItems: 'center', width: 24, justifyContent: 'flex-end', flex: 1 },
    barCount: { fontSize: 9, color: colors.textSubtle, marginBottom: 2 },
    bar: { width: 14, borderRadius: 3, backgroundColor: colors.primary },
    barLabel: { fontSize: 9, color: colors.textFaint, marginTop: 4 },
  });
}
